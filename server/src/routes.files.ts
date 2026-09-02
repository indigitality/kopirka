/** Эндпоинты файлов: список, карточка, отдача содержимого, организация, корзина. */
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { Hono } from 'hono';
import {
  ACCEPTED_EXTS,
  type FileExt,
  type FileListResponse,
  type RevealResponse,
} from '../../shared/api.js';
import { badRequest, notFound } from './errors.js';
import {
  getFile,
  getFileRow,
  hydrate,
  listFiles,
  moveFiles,
  purgeFiles,
  resolveSimilar,
  restoreFiles,
  softDeleteFiles,
  stats,
  trashFileIds,
  type ListQuery,
} from './files.js';
import { assertFolderExists } from './folders.js';
import { CONTENT_TYPES, toPngBuffer } from './images.js';
import { parseId, parseJsonBody, sendFile } from './http.js';
import { log } from './logger.js';
import { resolveInLibrary } from './paths.js';
import {
  boolFlagSchema,
  bulkMoveSchema,
  bulkTagSchema,
  fileIdsSchema,
  fileUpdateSchema,
  scopeSchema,
  sortSchema,
} from './schemas.js';
import type { AppState } from './state.js';
import { addTagsToFiles, normalizeTagList, removeTagsFromFiles, setFileTags } from './tags.js';

const execFileAsync = promisify(execFile);

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

function multiParam(values: string[] | undefined): string[] {
  if (!values) return [];
  return values.flatMap((value) => value.split(',')).map((value) => value.trim()).filter((value) => value !== '');
}

/** Дата без времени трактуется как весь день: `2026-08-30` → с 00:00:00.000Z по 23:59:59.999Z. */
function normalizeDate(raw: string | undefined, edge: 'start' | 'end'): string | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const value = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return edge === 'start' ? `${value}T00:00:00.000Z` : `${value}T23:59:59.999Z`;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw badRequest(`Некорректная дата: ${value}`, 'invalid_date');
  return parsed.toISOString();
}

function parseListQuery(url: URL): ListQuery {
  const params = url.searchParams;
  const scopeRaw = params.get('scope') ?? 'library';
  const scope = scopeSchema.safeParse(scopeRaw);
  if (!scope.success) throw badRequest(`Неизвестный раздел: ${scopeRaw}`, 'invalid_scope');

  const sortRaw = params.get('sort') ?? 'added_desc';
  const sort = sortSchema.safeParse(sortRaw);
  if (!sort.success) throw badRequest(`Неизвестная сортировка: ${sortRaw}`, 'invalid_sort');

  const query: ListQuery = {
    scope: scope.data,
    sort: sort.data,
    limit: DEFAULT_LIMIT,
  };

  const folderRaw = params.get('folderId');
  if (folderRaw !== null) {
    if (folderRaw === '' || folderRaw === 'null' || folderRaw === 'none') query.folderId = null;
    else {
      const folderId = Number(folderRaw);
      if (!Number.isInteger(folderId) || folderId <= 0) {
        throw badRequest(`Некорректная папка: ${folderRaw}`, 'invalid_folder');
      }
      query.folderId = folderId;
    }
  }

  // IMP-01 — фильтр «только возможные дубли». Отсутствие и `false` означают «не фильтровать».
  const hasSimilarRaw = params.get('hasSimilar');
  if (hasSimilarRaw !== null && hasSimilarRaw !== '') {
    const hasSimilar = boolFlagSchema.safeParse(hasSimilarRaw.toLowerCase());
    if (!hasSimilar.success) throw badRequest(`Некорректный hasSimilar: ${hasSimilarRaw}`, 'invalid_has_similar');
    if (hasSimilar.data) query.hasSimilar = true;
  }

  const text = params.get('query');
  if (text !== null && text.trim() !== '') query.query = text;

  const tags = normalizeTagList(multiParam(params.getAll('tags')));
  if (tags.length > 0) query.tags = tags;

  const exts = multiParam(params.getAll('exts')).map((value) => value.toLowerCase());
  const unknownExt = exts.find((value) => !(ACCEPTED_EXTS as readonly string[]).includes(value));
  if (unknownExt !== undefined) throw badRequest(`Неизвестный формат: ${unknownExt}`, 'invalid_ext');
  if (exts.length > 0) query.exts = exts as FileExt[];

  const dateFrom = normalizeDate(params.get('dateFrom') ?? undefined, 'start');
  if (dateFrom) query.dateFrom = dateFrom;
  const dateTo = normalizeDate(params.get('dateTo') ?? undefined, 'end');
  if (dateTo) query.dateTo = dateTo;

  const limitRaw = params.get('limit');
  if (limitRaw !== null) {
    const limit = Number(limitRaw);
    if (!Number.isInteger(limit) || limit <= 0) throw badRequest('Некорректный limit', 'invalid_limit');
    query.limit = Math.min(limit, MAX_LIMIT);
  }

  const cursor = params.get('cursor');
  if (cursor !== null && cursor !== '') query.cursor = cursor;

  return query;
}

function requireFileRow(state: AppState, id: number) {
  const row = getFileRow(state.db, id);
  if (!row) throw notFound(`Файл ${id} не найден`, 'file_not_found');
  return row;
}

export function registerFileRoutes(app: Hono, state: AppState): void {
  app.get('/api/stats', (c) => c.json(stats(state.db)));

  app.get('/api/files', (c) => {
    const result: FileListResponse = listFiles(state.db, parseListQuery(new URL(c.req.url)));
    return c.json(result);
  });

  app.get('/api/files/:id', (c) => {
    const file = getFile(state.db, parseId(c.req.param('id')));
    if (!file) throw notFound('Файл не найден', 'file_not_found');
    return c.json(file);
  });

  app.patch('/api/files/:id', async (c) => {
    const id = parseId(c.req.param('id'));
    requireFileRow(state, id);
    const body = await parseJsonBody(c, fileUpdateSchema);
    if (body.folderId !== undefined) {
      if (body.folderId !== null) assertFolderExists(state.db, body.folderId);
      moveFiles(state.db, [id], body.folderId);
    }
    if (body.tags !== undefined) setFileTags(state.db, id, body.tags);
    return c.json(getFile(state.db, id));
  });

  app.on(['GET', 'HEAD'], '/api/files/:id/preview', (c) => {
    const row = requireFileRow(state, parseId(c.req.param('id')));
    if (!row.preview_relpath) throw notFound('Превью для этого файла нет', 'no_preview');
    const abs = resolveInLibrary(state.libraryPath, row.preview_relpath);
    if (!fs.existsSync(abs)) throw notFound('Файл превью пропал с диска', 'preview_missing');
    return sendFile(c, abs, { contentType: 'image/webp', etag: `${row.sha256}-preview`, sandbox: true });
  });

  app.on(['GET', 'HEAD'], '/api/files/:id/original', (c) => {
    const row = requireFileRow(state, parseId(c.req.param('id')));
    const abs = resolveInLibrary(state.libraryPath, row.storage_relpath);
    if (!fs.existsSync(abs)) throw notFound('Оригинал пропал с диска', 'original_missing');
    const contentType = CONTENT_TYPES[row.ext as FileExt] ?? 'application/octet-stream';
    return sendFile(c, abs, { contentType, etag: row.sha256, sandbox: true });
  });

  // LIB-06 — «Показать в Finder». execFile без shell: путь уходит аргументом.
  app.post('/api/files/:id/reveal', async (c) => {
    const row = requireFileRow(state, parseId(c.req.param('id')));
    const abs = resolveInLibrary(state.libraryPath, row.storage_relpath);
    if (!fs.existsSync(abs)) throw notFound('Оригинал пропал с диска', 'original_missing');
    await execFileAsync('open', ['-R', abs]);
    const response: RevealResponse = { ok: true };
    return c.json(response);
  });

  // LIB-06 — «Скопировать» в системный буфер обмена.
  app.post('/api/files/:id/copy', async (c) => {
    const row = requireFileRow(state, parseId(c.req.param('id')));
    const abs = resolveInLibrary(state.libraryPath, row.storage_relpath);
    if (!fs.existsSync(abs)) throw notFound('Оригинал пропал с диска', 'original_missing');

    if (row.ext === 'svg') {
      // Вектор кладём как текст: растрового представления у него нет.
      await new Promise<void>((resolve, reject) => {
        const child = execFile('pbcopy', [], (error) => (error ? reject(error) : resolve()));
        child.stdin?.end(fs.readFileSync(abs));
      });
      const response: RevealResponse = { ok: true };
      return c.json(response);
    }

    // Растр приводим к PNG во временный файл: AppleScript кладёт в буфер картинку, а не путь.
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kopirka-copy-'));
    const tmpFile = path.join(tmpDir, `${row.sha256}.png`);
    try {
      fs.writeFileSync(tmpFile, await toPngBuffer(fs.readFileSync(abs)));
      // Путь передаётся аргументом (argv), а не склейкой в текст скрипта.
      await execFileAsync('osascript', [
        '-e',
        'on run argv',
        '-e',
        'set f to POSIX file (item 1 of argv)',
        '-e',
        'set the clipboard to (read f as «class PNGf»)',
        '-e',
        'end run',
        tmpFile,
      ]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    const response: RevealResponse = { ok: true };
    return c.json(response);
  });

  // IMP-01 — снять пометку «возможный дубль».
  app.post('/api/files/:id/resolve-similar', (c) => {
    const id = parseId(c.req.param('id'));
    requireFileRow(state, id);
    resolveSimilar(state.db, id);
    return c.json(getFile(state.db, id));
  });

  app.post('/api/files/move', async (c) => {
    const body = await parseJsonBody(c, bulkMoveSchema);
    if (body.folderId !== null) assertFolderExists(state.db, body.folderId);
    const moved = moveFiles(state.db, body.fileIds, body.folderId);
    return c.json({ ok: true, moved, files: filesByIds(state, body.fileIds) });
  });

  app.post('/api/files/tag', async (c) => {
    const body = await parseJsonBody(c, bulkTagSchema);
    if (body.add) addTagsToFiles(state.db, body.fileIds, body.add);
    if (body.remove) removeTagsFromFiles(state.db, body.fileIds, body.remove);
    return c.json({ ok: true, files: filesByIds(state, body.fileIds) });
  });

  // ORG-05 — мягкое удаление: папка и теги остаются, чтобы восстановление было точным.
  app.post('/api/files/delete', async (c) => {
    const body = await parseJsonBody(c, fileIdsSchema);
    const deleted = softDeleteFiles(state.db, body.fileIds);
    return c.json({ ok: true, deleted, files: filesByIds(state, body.fileIds) });
  });

  app.post('/api/files/restore', async (c) => {
    const body = await parseJsonBody(c, fileIdsSchema);
    const restored = restoreFiles(state.db, body.fileIds);
    return c.json({ ok: true, restored, files: filesByIds(state, body.fileIds) });
  });

  app.post('/api/files/purge', async (c) => {
    const body = await parseJsonBody(c, fileIdsSchema);
    const purged = purgeFiles(state.db, state.libraryPath, body.fileIds);
    log.info(`окончательно удалено файлов: ${purged}`);
    return c.json({ ok: true, purged });
  });

  app.post('/api/trash/empty', (c) => {
    const purged = purgeFiles(state.db, state.libraryPath, trashFileIds(state.db));
    log.info(`корзина очищена, удалено файлов: ${purged}`);
    return c.json({ ok: true, purged });
  });
}

function filesByIds(state: AppState, ids: readonly number[]) {
  const rows = ids.map((id) => getFileRow(state.db, id)).filter((row) => row !== null);
  return hydrate(state.db, rows);
}
