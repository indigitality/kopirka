/** Эндпоинты файлов: список, карточка, отдача содержимого, организация, корзина. */
import { execFile, spawn } from 'node:child_process';
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
import { HttpError, badRequest, notFound } from './errors.js';
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

// ─────────────────────────────────────────────────────────────────────────────
// «Выход в работу» (LIB-06): показать файл в файловом менеджере и положить в буфер.
// Единственное место сервера, которое зовёт системные утилиты, — поэтому здесь
// собраны обе платформенные реализации.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Тестовый флаг: не звать системные утилиты. Smoke-прогон проверяет коды ответов
 * эндпоинтов, но не должен открывать окно Finder/Explorer и подменять буфер обмена
 * человеку, который запустил проверку.
 */
function shellSuppressed(): boolean {
  return Boolean(process.env.KOPIRKA_NO_SHELL);
}

function unsupportedPlatform(what: string): HttpError {
  return new HttpError(501, `${what} на платформе ${process.platform} не поддерживается`, 'unsupported_platform');
}

/** Системные бинарники ищем от %SystemRoot%: PATH у процесса-потомка бывает урезанным. */
function windowsSystemRoot(): string | null {
  const root = process.env['SystemRoot'] ?? process.env['windir'];
  return root !== undefined && root !== '' ? root : null;
}

function explorerPath(): string {
  const root = windowsSystemRoot();
  // explorer.exe лежит в самом %SystemRoot%, а не в System32.
  return root === null ? 'explorer.exe' : path.join(root, 'explorer.exe');
}

/**
 * Windows PowerShell 5.1 — он есть на любой чистой Windows 10/11, в отличие от pwsh
 * (PowerShell 7), который надо ставить отдельно.
 */
function powershellPath(): string {
  const root = windowsSystemRoot();
  return root === null
    ? 'powershell.exe'
    : path.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

/** Путь к файлу отдаём PowerShell переменной окружения, а не командной строкой. */
const CLIPBOARD_PATH_ENV = 'KOPIRKA_CLIPBOARD_PATH';

/** Текст (SVG) → буфер. ReadAllText сам снимает BOM, если он есть. */
const PS_COPY_TEXT = [
  `$ErrorActionPreference = 'Stop'`,
  'try {',
  `  $text = [System.IO.File]::ReadAllText($env:${CLIPBOARD_PATH_ENV}, [System.Text.Encoding]::UTF8)`,
  '  Set-Clipboard -Value $text',
  '  exit 0',
  '} catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }',
].join('\n');

/**
 * Картинка → буфер. Кладём сразу в двух видах:
 *  - формат «PNG» — его читают Chromium, Figma, современные редакторы, и в нём
 *    сохраняется прозрачность;
 *  - обычный SetImage (DIB) — для всех остальных (Word, Paint), но альфа там теряется.
 * Файл читаем байтами, а не Image::FromFile: тот держит файл открытым, и временную
 * папку потом не удалить.
 * Запятая перед $bytes обязательна: иначе PowerShell разложит массив байт по аргументам
 * конструктора MemoryStream. Position сбрасываем сами — поток уже прочитан GDI+.
 * SetDataObject с повторами: буфер обмена монопольный, его на миг может держать чужое окно.
 */
const PS_COPY_IMAGE = [
  `$ErrorActionPreference = 'Stop'`,
  'try {',
  '  Add-Type -AssemblyName System.Windows.Forms',
  '  Add-Type -AssemblyName System.Drawing',
  `  $bytes = [System.IO.File]::ReadAllBytes($env:${CLIPBOARD_PATH_ENV})`,
  '  $stream = New-Object System.IO.MemoryStream(,$bytes)',
  '  $image = [System.Drawing.Image]::FromStream($stream)',
  '  $stream.Position = 0',
  '  $data = New-Object System.Windows.Forms.DataObject',
  `  $data.SetData('PNG', $false, $stream)`,
  '  $data.SetImage($image)',
  '  [System.Windows.Forms.Clipboard]::SetDataObject($data, $true, 10, 100)',
  '  exit 0',
  '} catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }',
].join('\n');

/**
 * Скрипт уходит в -EncodedCommand (base64 от UTF-16LE) — командная строка получается
 * чисто ASCII, без кавычек и без зависимости от кодовой страницы консоли. Путь к файлу
 * едет переменной окружения, поэтому кириллица и пробелы не проходят ни через shell,
 * ни через разбор аргументов. -Sta нужен буферу обмена (для powershell.exe это и так
 * значение по умолчанию, но пусть будет видно), -NoProfile — чтобы чужой профиль не
 * ломал скрипт, -NonInteractive — чтобы скрипт ничего не спрашивал: отвечать некому.
 */
async function runPowerShell(script: string, filePath: string): Promise<void> {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  await execFileAsync(
    powershellPath(),
    ['-NoProfile', '-NonInteractive', '-Sta', '-EncodedCommand', encoded],
    { env: { ...process.env, [CLIPBOARD_PATH_ENV]: filePath }, windowsHide: true },
  );
}

/**
 * «Показать в Explorer». Тонкости, из-за которых здесь не execFile с обычными аргументами:
 *  - explorer.exe штатно возвращает НЕнулевой код выхода даже после успешного показа,
 *    а если оболочка ещё не запущена, он и вовсе не завершится — сам станет оболочкой.
 *    Поэтому ждём только события «процесс создан» (там ловится ENOENT), а код выхода
 *    не значит ничего; unref, чтобы висящий explorer не держал наш цикл событий;
 *  - командную строку explorer разбирает сам, и ключ должен выглядеть как
 *    `/select,"C:\путь\файл.png"` — Node без windowsVerbatimArguments закавычил бы
 *    аргумент целиком, вместе с ключом. Кавычки вокруг пути обязательны: в нём бывают
 *    и пробелы, и запятые, по которым explorer иначе обрежет путь.
 * Склейка безопасна: двойная кавычка в имени файла на Windows невозможна, shell в
 * цепочке не участвует (CreateProcess напрямую).
 */
function revealInExplorer(abs: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(explorerPath(), [`/select,"${abs}"`], {
      windowsVerbatimArguments: true,
      windowsHide: true,
      stdio: 'ignore',
    });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

async function revealInFileManager(abs: string): Promise<void> {
  if (shellSuppressed()) {
    log.info(`KOPIRKA_NO_SHELL: показ в папке пропущен (${abs})`);
    return;
  }
  if (process.platform === 'darwin') {
    // execFile без shell: путь уходит аргументом.
    await execFileAsync('open', ['-R', abs]);
    return;
  }
  if (process.platform === 'win32') {
    await revealInExplorer(abs);
    return;
  }
  throw unsupportedPlatform('Показ файла в папке');
}

/** Текстовое содержимое файла (SVG) в буфер обмена. */
async function copyTextFile(abs: string): Promise<void> {
  if (shellSuppressed()) {
    log.info(`KOPIRKA_NO_SHELL: копирование текста пропущено (${abs})`);
    return;
  }
  if (process.platform === 'darwin') {
    await new Promise<void>((resolve, reject) => {
      const child = execFile('pbcopy', [], (error) => (error ? reject(error) : resolve()));
      child.stdin?.end(fs.readFileSync(abs));
    });
    return;
  }
  if (process.platform === 'win32') {
    await runPowerShell(PS_COPY_TEXT, abs);
    return;
  }
  throw unsupportedPlatform('Копирование в буфер обмена');
}

/** Готовый PNG-файл в буфер обмена как картинку. */
async function copyImageFile(pngPath: string): Promise<void> {
  if (shellSuppressed()) {
    log.info(`KOPIRKA_NO_SHELL: копирование картинки пропущено (${pngPath})`);
    return;
  }
  if (process.platform === 'darwin') {
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
      pngPath,
    ]);
    return;
  }
  if (process.platform === 'win32') {
    await runPowerShell(PS_COPY_IMAGE, pngPath);
    return;
  }
  throw unsupportedPlatform('Копирование в буфер обмена');
}

/**
 * Временную папку убираем «мягко»: на Windows только что созданный файл может держать
 * антивирус, и упавшая уборка превратила бы удачное копирование в 500.
 */
function removeTempDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (error) {
    log.warn(`не удалось убрать временную папку ${dir}`, error);
  }
}

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

  // LIB-06 — «Показать в Finder» (macOS) / «Показать в проводнике» (Windows).
  app.post('/api/files/:id/reveal', async (c) => {
    const row = requireFileRow(state, parseId(c.req.param('id')));
    const abs = resolveInLibrary(state.libraryPath, row.storage_relpath);
    if (!fs.existsSync(abs)) throw notFound('Оригинал пропал с диска', 'original_missing');
    await revealInFileManager(abs);
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
      await copyTextFile(abs);
      const response: RevealResponse = { ok: true };
      return c.json(response);
    }

    // Растр приводим к PNG во временный файл: и AppleScript, и PowerShell кладут в буфер
    // картинку, а не путь, и оба читают её с диска.
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kopirka-copy-'));
    const tmpFile = path.join(tmpDir, `${row.sha256}.png`);
    try {
      fs.writeFileSync(tmpFile, await toPngBuffer(fs.readFileSync(abs)));
      await copyImageFile(tmpFile);
    } finally {
      removeTempDir(tmpDir);
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
