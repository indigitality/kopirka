/** Запросы и операции над файлами: список, срезы, корзина, окончательное удаление. */
import fs from 'node:fs';
import type {
  FileExt,
  FileListResponse,
  FileRecord,
  LibraryScope,
  SortKey,
  SourceType,
  StatsResponse,
} from '../../shared/api.js';
import type { Db } from './db.js';
import { subtreeIds } from './folders.js';
import { preview2xRelpath, resolveInLibrary, safeUnlink } from './paths.js';
import { pruneOrphanTags, tagsForFiles } from './tags.js';

export interface FileRow {
  id: number;
  sha256: string;
  phash: string | null;
  similar_to_file_id: number | null;
  original_filename: string;
  storage_relpath: string;
  preview_relpath: string | null;
  ext: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  folder_id: number | null;
  source_type: string;
  source_url: string | null;
  is_broken: number;
  added_at: string;
  deleted_at: string | null;
}

const FILE_COLUMNS = `
  id, sha256, phash, similar_to_file_id, original_filename, storage_relpath, preview_relpath,
  ext, size_bytes, width, height, folder_id, source_type, source_url, is_broken, added_at, deleted_at`;

export function mapFileRow(row: FileRow, tags: string[]): FileRecord {
  return {
    id: row.id,
    sha256: row.sha256,
    phash: row.phash,
    similarToFileId: row.similar_to_file_id,
    originalFilename: row.original_filename,
    ext: row.ext as FileExt,
    sizeBytes: row.size_bytes,
    width: row.width,
    height: row.height,
    folderId: row.folder_id,
    sourceType: row.source_type as SourceType,
    sourceUrl: row.source_url,
    isBroken: row.is_broken === 1,
    hasPreview: row.preview_relpath !== null,
    addedAt: row.added_at,
    deletedAt: row.deleted_at,
    tags,
    previewUrl: row.preview_relpath === null ? null : `/api/files/${row.id}/preview`,
    originalUrl: `/api/files/${row.id}/original`,
  };
}

export function getFileRow(db: Db, id: number): FileRow | null {
  const row = db.prepare(`SELECT ${FILE_COLUMNS} FROM files WHERE id = ?`).get(id) as FileRow | undefined;
  return row ?? null;
}

export function getFile(db: Db, id: number): FileRecord | null {
  const row = getFileRow(db, id);
  if (!row) return null;
  return mapFileRow(row, tagsForFiles(db, [id]).get(id) ?? []);
}

export function hydrate(db: Db, rows: FileRow[]): FileRecord[] {
  const tagMap = tagsForFiles(db, rows.map((row) => row.id));
  return rows.map((row) => mapFileRow(row, tagMap.get(row.id) ?? []));
}

export function findActiveBySha(db: Db, sha256: string): FileRow | null {
  const row = db
    .prepare(`SELECT ${FILE_COLUMNS} FROM files WHERE sha256 = ? AND deleted_at IS NULL`)
    .get(sha256) as FileRow | undefined;
  return row ?? null;
}

export function findAnyBySha(db: Db, sha256: string): FileRow | null {
  const row = db.prepare(`SELECT ${FILE_COLUMNS} FROM files WHERE sha256 = ?`).get(sha256) as
    | FileRow
    | undefined;
  return row ?? null;
}

// ─── Список ──────────────────────────────────────────────────────────────────

export interface ListQuery {
  scope: LibraryScope;
  /** Папка и всё её поддерево (решение 02.09.2026). null — файлы без папки. */
  folderId?: number | null;
  /** IMP-01 — только файлы с непринятой пометкой похожести. */
  hasSimilar?: boolean;
  query?: string;
  tags?: string[];
  exts?: FileExt[];
  dateFrom?: string;
  dateTo?: string;
  sort: SortKey;
  limit: number;
  cursor?: string | null;
}

interface Cursor {
  k: string;
  id: number;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(raw: string): Cursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Partial<Cursor>;
    if (typeof parsed.k !== 'string' || typeof parsed.id !== 'number') return null;
    return { k: parsed.k, id: parsed.id };
  } catch {
    return null;
  }
}

function likePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

/**
 * Условие среза библиотеки. «Не разобрано» — SET-05 в редакции 02.09.2026: файл без папки.
 * Теги не учитываются. Корзина в срез не попадает.
 */
function scopeCondition(scope: LibraryScope): string {
  if (scope === 'trash') return `files.deleted_at IS NOT NULL`;
  if (scope === 'untagged') return `files.deleted_at IS NULL AND files.folder_id IS NULL`;
  return `files.deleted_at IS NULL`;
}

function buildFilters(db: Db, query: ListQuery): { sql: string; params: unknown[] } {
  const clauses: string[] = [scopeCondition(query.scope)];
  const params: unknown[] = [];

  if (query.folderId !== undefined) {
    if (query.folderId === null) clauses.push(`files.folder_id IS NULL`);
    else {
      // Решение 02.09.2026: папка показывает всё своё поддерево.
      const ids = subtreeIds(db, query.folderId);
      if (ids.length === 0) {
        // Папки нет — как и раньше, пустой результат, а не ошибка.
        clauses.push(`1 = 0`);
      } else {
        clauses.push(`files.folder_id IN (${ids.map(() => '?').join(',')})`);
        params.push(...ids);
      }
    }
  }
  if (query.hasSimilar === true) {
    // IMP-01 — только файлы с непринятой пометкой похожести.
    clauses.push(`files.similar_to_file_id IS NOT NULL`);
  }
  if (query.query !== undefined && query.query.trim() !== '') {
    clauses.push(`kp_lower(files.original_filename) LIKE kp_lower(?) ESCAPE '\\'`);
    params.push(likePattern(query.query.trim()));
  }
  if (query.tags && query.tags.length > 0) {
    // И-логика: файл должен иметь ВСЕ перечисленные теги (SEARCH-01).
    const placeholders = query.tags.map(() => '?').join(',');
    clauses.push(`(SELECT COUNT(DISTINCT t.id) FROM file_tags ft JOIN tags t ON t.id = ft.tag_id
                    WHERE ft.file_id = files.id AND t.name IN (${placeholders})) = ?`);
    params.push(...query.tags, query.tags.length);
  }
  if (query.exts && query.exts.length > 0) {
    const placeholders = query.exts.map(() => '?').join(',');
    clauses.push(`files.ext IN (${placeholders})`);
    params.push(...query.exts);
  }
  if (query.dateFrom) {
    clauses.push(`files.added_at >= ?`);
    params.push(query.dateFrom);
  }
  if (query.dateTo) {
    clauses.push(`files.added_at <= ?`);
    params.push(query.dateTo);
  }
  return { sql: clauses.join(' AND '), params };
}

function sortParts(sort: SortKey): { expr: string; direction: 'ASC' | 'DESC' } {
  switch (sort) {
    case 'added_asc':
      return { expr: 'files.added_at', direction: 'ASC' };
    case 'name_asc':
      return { expr: 'kp_lower(files.original_filename)', direction: 'ASC' };
    case 'name_desc':
      return { expr: 'kp_lower(files.original_filename)', direction: 'DESC' };
    case 'added_desc':
    default:
      return { expr: 'files.added_at', direction: 'DESC' };
  }
}

function cursorKey(row: FileRow, sort: SortKey): string {
  return sort === 'name_asc' || sort === 'name_desc'
    ? row.original_filename.toLowerCase()
    : row.added_at;
}

export function listFiles(db: Db, query: ListQuery): FileListResponse {
  // total, страница и курсор считаются по одному и тому же условию.
  const filters = buildFilters(db, query);
  const { expr, direction } = sortParts(query.sort);

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS total FROM files WHERE ${filters.sql}`)
    .get(...filters.params) as { total: number };

  const where: string[] = [filters.sql];
  const params: unknown[] = [...filters.params];
  const cursor = query.cursor ? decodeCursor(query.cursor) : null;
  if (cursor) {
    const cmp = direction === 'ASC' ? '>' : '<';
    where.push(`((${expr} ${cmp} ?) OR (${expr} = ? AND files.id ${cmp} ?))`);
    params.push(cursor.k, cursor.k, cursor.id);
  }

  // limit + 1 — чтобы понять, есть ли следующая страница.
  const rows = db
    .prepare(
      `SELECT ${FILE_COLUMNS} FROM files
        WHERE ${where.join(' AND ')}
        ORDER BY ${expr} ${direction}, files.id ${direction}
        LIMIT ?`,
    )
    .all(...params, query.limit + 1) as FileRow[];

  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  const nextCursor =
    rows.length > query.limit && last ? encodeCursor({ k: cursorKey(last, query.sort), id: last.id }) : null;

  return { files: hydrate(db, page), total: totalRow.total, nextCursor };
}

export function stats(db: Db): StatsResponse {
  const count = (scope: LibraryScope): number =>
    (db.prepare(`SELECT COUNT(*) AS c FROM files WHERE ${scopeCondition(scope)}`).get() as { c: number }).c;
  // IMP-01 — не срез, а счётчик: раздел «Возможные дубли» исчезает, когда дублей нет.
  const similar = (
    db
      .prepare(`SELECT COUNT(*) AS c FROM files WHERE deleted_at IS NULL AND similar_to_file_id IS NOT NULL`)
      .get() as { c: number }
  ).c;
  return { library: count('library'), untagged: count('untagged'), trash: count('trash'), similar };
}

// ─── Мутации ─────────────────────────────────────────────────────────────────

export function moveFiles(db: Db, fileIds: readonly number[], folderId: number | null): number {
  if (fileIds.length === 0) return 0;
  const update = db.prepare(`UPDATE files SET folder_id = ? WHERE id = ?`);
  return db.transaction(() => {
    let changed = 0;
    for (const id of fileIds) changed += update.run(folderId, id).changes;
    return changed;
  })();
}

/** Мягкое удаление (ORG-05): папка и теги не трогаются, файлы на диске не двигаются. */
export function softDeleteFiles(db: Db, fileIds: readonly number[]): number {
  if (fileIds.length === 0) return 0;
  const now = new Date().toISOString();
  const update = db.prepare(`UPDATE files SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`);
  return db.transaction(() => {
    let changed = 0;
    for (const id of fileIds) changed += update.run(now, id).changes;
    return changed;
  })();
}

export function restoreFiles(db: Db, fileIds: readonly number[]): number {
  if (fileIds.length === 0) return 0;
  const update = db.prepare(`UPDATE files SET deleted_at = NULL WHERE id = ?`);
  return db.transaction(() => {
    let changed = 0;
    for (const id of fileIds) changed += update.run(id).changes;
    return changed;
  })();
}

/** Окончательное удаление: сначала файлы с диска, затем строка (file_tags уходит каскадом). */
export function purgeFiles(db: Db, libraryPath: string, fileIds: readonly number[]): number {
  if (fileIds.length === 0) return 0;
  const select = db.prepare(`SELECT sha256, storage_relpath, preview_relpath FROM files WHERE id = ?`);
  const del = db.prepare(`DELETE FROM files WHERE id = ?`);
  let purged = 0;
  for (const id of fileIds) {
    const row = select.get(id) as
      | { sha256: string; storage_relpath: string; preview_relpath: string | null }
      | undefined;
    if (!row) continue;
    // Оригинал и превью — каждый своей попыткой: на Windows заблокированный файл
    // (открыт в просмотрщике, читает антивирус) не должен уносить с собой и второй.
    // Строку удаляем в любом случае: файла на диске может уже не быть.
    // Крупное превью (FDB-04) в базе не хранится — путь выводим из sha256; его
    // может и не быть вовсе, если файл ни разу не смотрели крупной плиткой.
    const previews = row.preview_relpath === null ? [] : [row.preview_relpath, preview2xRelpath(row.sha256)];
    for (const relpath of [row.storage_relpath, ...previews]) {
      if (!relpath) continue;
      try {
        safeUnlink(resolveInLibrary(libraryPath, relpath));
      } catch {
        // Не удалилось — в библиотеке останется сирота, но карточка уходит.
      }
    }
    purged += del.run(id).changes;
  }
  pruneOrphanTags(db);
  return purged;
}

export function trashFileIds(db: Db): number[] {
  return (db.prepare(`SELECT id FROM files WHERE deleted_at IS NOT NULL`).all() as Array<{ id: number }>).map(
    (row) => row.id,
  );
}

/** Автоочистка корзины: файлы, удалённые более `days` дней назад. */
export function expiredTrashIds(db: Db, days: number): number[] {
  const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  return (
    db.prepare(`SELECT id FROM files WHERE deleted_at IS NOT NULL AND deleted_at < ?`).all(threshold) as Array<{
      id: number;
    }>
  ).map((row) => row.id);
}

export function resolveSimilar(db: Db, fileId: number): boolean {
  return db.prepare(`UPDATE files SET similar_to_file_id = NULL WHERE id = ?`).run(fileId).changes > 0;
}

export function fileExistsOnDisk(libraryPath: string, relpath: string): boolean {
  try {
    return fs.existsSync(resolveInLibrary(libraryPath, relpath));
  } catch {
    return false;
  }
}
