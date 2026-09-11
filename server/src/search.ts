/**
 * NEW-02 — источник данных поиск-модалки. Один запрос отдаёт четыре среза сразу:
 * файлы, теги, форматы и папки. Файлы считает та же `listFiles`, что и сетка, —
 * иначе выдача модалки и выдача сетки после «применить как фильтр» разошлись бы.
 *
 * Чипы-фильтры (`tags`, `exts`, `folderId`) сужают только файлы: подсказки тегов и
 * папок остаются ответом на строку запроса, а не на уже закреплённое.
 */
import {
  ACCEPTED_EXTS,
  type FileExt,
  type FileSummary,
  type SearchExtHit,
  type SearchFolderHit,
  type SearchResponse,
  type SearchTagHit,
} from '../../shared/api.js';
import type { Db } from './db.js';
import { listFiles } from './files.js';
import { subtreeFileCount } from './folders.js';

/** Сколько подсказок отдаём в каждой секции: список должен читаться, а не листаться. */
const TAG_LIMIT = 10;
const FOLDER_LIMIT = 10;
const DEFAULT_FILE_LIMIT = 30;
const MAX_FILE_LIMIT = 100;

export interface SearchParams {
  /** Уже обрезанная строка; пустая означает «показать, что тут вообще есть». */
  q: string;
  tags: string[];
  exts: FileExt[];
  /** `undefined` — по папкам не фильтруем; `null` — файлы вне папок. */
  folderId?: number | null;
  limit: number;
}

export function normalizeSearchLimit(raw: number | undefined): number {
  if (raw === undefined || !Number.isInteger(raw) || raw <= 0) return DEFAULT_FILE_LIMIT;
  return Math.min(raw, MAX_FILE_LIMIT);
}

/** Экранирование для LIKE — то же, что в `files.ts`: подстрока, а не шаблон. */
function likePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

interface FolderNode {
  id: number;
  name: string;
  parentFolderId: number | null;
}

/** Плоская карта папок: по ней собираются пути «Интерфейсы / Дашборды» без рекурсии в SQL. */
function folderIndex(db: Db): Map<number, FolderNode> {
  const rows = db
    .prepare(`SELECT id, name, parent_folder_id AS parentFolderId FROM folders`)
    .all() as FolderNode[];
  return new Map(rows.map((row) => [row.id, row]));
}

/**
 * Путь папки от корня. Счётчик шагов — защита от цикла в данных: дерево строится
 * без циклов (`updateFolder` их запрещает), но правленая руками база не должна
 * подвешивать сервер.
 */
function pathOf(index: Map<number, FolderNode>, folderId: number | null): string | null {
  if (folderId === null) return null;
  const parts: string[] = [];
  let current = index.get(folderId);
  for (let depth = 0; current !== undefined && depth < 64; depth += 1) {
    parts.unshift(current.name);
    current = current.parentFolderId === null ? undefined : index.get(current.parentFolderId);
  }
  return parts.length === 0 ? null : parts.join(' / ');
}

function toSummary(file: { id: number; originalFilename: string; ext: string; folderId: number | null; previewUrl: string | null; originalUrl: string }, index: Map<number, FolderNode>): FileSummary {
  return {
    id: file.id,
    originalFilename: file.originalFilename,
    ext: file.ext as FileExt,
    folderId: file.folderId,
    folderPath: pathOf(index, file.folderId),
    previewUrl: file.previewUrl,
    originalUrl: file.originalUrl,
  };
}

/** Теги: с запросом — совпавшие по подстроке имени, без запроса — самые частые. */
function searchTags(db: Db, q: string): SearchTagHit[] {
  const countExpr = `(SELECT COUNT(*) FROM file_tags ft JOIN files f ON f.id = ft.file_id
                        WHERE ft.tag_id = t.id AND f.deleted_at IS NULL)`;
  const rows =
    q === ''
      ? (db
          .prepare(
            `SELECT t.name AS name, ${countExpr} AS count FROM tags t
              ORDER BY count DESC, t.name COLLATE NOCASE ASC LIMIT ?`,
          )
          .all(TAG_LIMIT) as Array<{ name: string; count: number }>)
      : (db
          .prepare(
            `SELECT t.name AS name, ${countExpr} AS count FROM tags t
              WHERE kp_lower(t.name) LIKE kp_lower(?) ESCAPE '\\'
              ORDER BY count DESC, t.name COLLATE NOCASE ASC LIMIT ?`,
          )
          .all(likePattern(q), TAG_LIMIT) as Array<{ name: string; count: number }>);
  // Тег без файлов в списке не нужен: он остался бы от корзины, а счётчик показал бы 0.
  return rows.filter((row) => row.count > 0);
}

/** Форматы отдаём все из контракта — пустые видно в интерфейсе выключенными. */
function searchExts(db: Db): SearchExtHit[] {
  const rows = db
    .prepare(`SELECT ext, COUNT(*) AS count FROM files WHERE deleted_at IS NULL GROUP BY ext`)
    .all() as Array<{ ext: string; count: number }>;
  const byExt = new Map(rows.map((row) => [row.ext, row.count]));
  return ACCEPTED_EXTS.map((ext) => ({ ext, count: byExt.get(ext) ?? 0 }));
}

/** Папки: с запросом — совпавшие по имени, без запроса — корневые. Счётчик по поддереву. */
function searchFolders(db: Db, q: string, index: Map<number, FolderNode>): SearchFolderHit[] {
  const rows =
    q === ''
      ? (db
          .prepare(
            `SELECT id, name FROM folders WHERE parent_folder_id IS NULL
              ORDER BY sort_order ASC, name COLLATE NOCASE ASC LIMIT ?`,
          )
          .all(FOLDER_LIMIT) as Array<{ id: number; name: string }>)
      : (db
          .prepare(
            `SELECT id, name FROM folders WHERE kp_lower(name) LIKE kp_lower(?) ESCAPE '\\'
              ORDER BY name COLLATE NOCASE ASC LIMIT ?`,
          )
          .all(likePattern(q), FOLDER_LIMIT) as Array<{ id: number; name: string }>);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    path: pathOf(index, row.id) ?? row.name,
    count: subtreeFileCount(db, row.id),
  }));
}

export function search(db: Db, params: SearchParams): SearchResponse {
  const index = folderIndex(db);

  // Файлы считает список сетки: одна логика на оба места, включая поддерево папки.
  const page = listFiles(db, {
    scope: 'library',
    ...(params.folderId === undefined ? {} : { folderId: params.folderId }),
    ...(params.q === '' ? {} : { query: params.q }),
    ...(params.tags.length > 0 ? { tags: params.tags } : {}),
    ...(params.exts.length > 0 ? { exts: params.exts } : {}),
    sort: 'added_desc',
    limit: params.limit,
  });

  return {
    files: page.files.map((file) => toSummary(file, index)),
    tags: searchTags(db, params.q),
    exts: searchExts(db),
    folders: searchFolders(db, params.q, index),
    total: page.total,
  };
}
