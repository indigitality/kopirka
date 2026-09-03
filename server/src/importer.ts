/**
 * Конвейер импорта — единственная точка входа для всех путей (IMP-01…05, SVC-02, SVC-03).
 * Порядок: валидация → sha256 → точный дубль → phash → похожий дубль → диск → превью → строка в БД.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  ACCEPTED_EXTS,
  MAX_FILE_BYTES,
  PHASH_MAX_DISTANCE,
  type FileExt,
  type FileRecord,
  type ImportResponse,
  type ImportResultItem,
  type SourceType,
} from '../../shared/api.js';
import type { Db } from './db.js';
import { getFile, getFileRow, findActiveBySha, findAnyBySha, mapFileRow } from './files.js';
import { folderExists, getFolderFlat } from './folders.js';
import {
  detectExt,
  hammingDistance,
  isRaster,
  normalizeExt,
  perceptualHash,
  readMeta,
  renderPreview,
  sha256 as sha256of,
} from './images.js';
import { log } from './logger.js';
import { ensureParentDir, previewRelpath, resolveInLibrary, storageRelpath } from './paths.js';
import type { PendingMeta } from './pending.js';
import type { AppState } from './state.js';
import { tagsForFiles } from './tags.js';

/** Пути, на которых пользователь смотрит в интерфейс и может ответить на модалку (05 §3.5). */
const SYNC_SOURCES: readonly SourceType[] = ['drag_drop', 'clipboard'];

export interface ImportInput {
  buffer: Buffer;
  filename: string;
  sourceType: SourceType;
  sourceUrl?: string | null;
  folderId?: number | null;
}

interface ValidationFailure {
  code: 'unsupported_format' | 'too_large' | 'unreadable';
  message: string;
}

function validate(buffer: Buffer, filename: string): { ext: FileExt } | ValidationFailure {
  if (buffer.length === 0) return { code: 'unreadable', message: `Файл «${filename}» пустой` };
  if (buffer.length > MAX_FILE_BYTES) {
    return {
      code: 'too_large',
      message: `Файл «${filename}» больше ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} МБ`,
    };
  }
  const ext = detectExt(buffer);
  if (ext === null) {
    return {
      code: 'unsupported_format',
      message: `Формат файла «${filename}» не поддерживается. Принимаются: ${ACCEPTED_EXTS.join(', ')}`,
    };
  }
  return { ext: normalizeExt(ext) };
}

/** Имя приходит снаружи: убираем путь, ограничиваем длину, дотягиваем расширение до фактического формата. */
function sanitizeFilename(raw: string, ext: FileExt): string {
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  const base = path.basename(cleaned === '' ? `image.${ext}` : cleaned);
  const safe = base.replace(/[/\\]/g, '_').slice(0, 200) || `image.${ext}`;
  const current = path.extname(safe).slice(1).toLowerCase();
  if (current === ext || (ext === 'jpg' && current === 'jpeg')) return safe;
  return `${safe}.${ext}`;
}

interface SimilarMatch {
  fileId: number;
  distance: number;
}

function findSimilar(db: Db, phash: string): SimilarMatch | null {
  const rows = db
    .prepare(`SELECT id, phash FROM files WHERE phash IS NOT NULL AND deleted_at IS NULL`)
    .all() as Array<{ id: number; phash: string }>;
  let best: SimilarMatch | null = null;
  for (const row of rows) {
    const distance = hammingDistance(phash, row.phash);
    if (distance <= PHASH_MAX_DISTANCE && (best === null || distance < best.distance)) {
      best = { fileId: row.id, distance };
    }
  }
  return best;
}

interface PersistInput {
  buffer: Buffer;
  filename: string;
  ext: FileExt;
  sha256: string;
  phash: string | null;
  sourceType: SourceType;
  sourceUrl: string | null;
  similarToFileId: number | null;
  folderId: number | null;
}

async function persist(state: AppState, input: PersistInput): Promise<FileRecord> {
  const relOriginal = storageRelpath(input.sha256, input.ext);
  const absOriginal = resolveInLibrary(state.libraryPath, relOriginal);
  ensureParentDir(absOriginal);
  fs.writeFileSync(absOriginal, input.buffer);

  const meta = await readMeta(input.buffer);

  // SVC-03: не сгенерировалось превью — файл всё равно принят, помечен как битый.
  let relPreview: string | null = null;
  let isBroken = false;
  if (isRaster(input.ext)) {
    try {
      const preview = await renderPreview(input.buffer);
      relPreview = previewRelpath(input.sha256);
      const absPreview = resolveInLibrary(state.libraryPath, relPreview);
      ensureParentDir(absPreview);
      fs.writeFileSync(absPreview, preview);
    } catch (error) {
      relPreview = null;
      isBroken = true;
      log.error(`не удалось сгенерировать превью для «${input.filename}»`, error);
    }
  }

  const info = state.db
    .prepare(
      `INSERT INTO files (
         sha256, phash, similar_to_file_id, original_filename, storage_relpath, preview_relpath,
         ext, size_bytes, width, height, folder_id, source_type, source_url, is_broken, added_at, deleted_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    )
    .run(
      input.sha256,
      input.phash,
      input.similarToFileId,
      input.filename,
      relOriginal,
      relPreview,
      input.ext,
      input.buffer.length,
      meta.width,
      meta.height,
      input.folderId,
      input.sourceType,
      input.sourceUrl,
      isBroken ? 1 : 0,
      new Date().toISOString(),
    );

  const record = getFile(state.db, Number(info.lastInsertRowid));
  if (!record) throw new Error('Файл не записался в базу');
  return record;
}

/**
 * Отметить исход импорта в ленте — это единственный сигнал для оболочки и окна.
 * Зовётся на всех путях конвейера, включая возврат из корзины и досохранение после
 * модалки «Похоже, уже есть».
 *
 * `duplicate` попадает сюда наравне с успехами: пользователю, который позвал импорт
 * мимо окна (быстрая команда Finder, автоимпорт папки), «это уже было» — такой же
 * ответ на его действие, как «добавлено». Без записи в ленте приложение молчало бы,
 * а сказать вместо него мог бы только сторонний скрипт — с чужой иконкой.
 * В событии дубля лежит существующий файл: `fileId` в ленте всегда указывает на
 * файл, который в библиотеке действительно есть.
 */
function noteImport(
  state: AppState,
  file: FileRecord,
  outcome: 'added' | 'added_similar' | 'duplicate',
  /**
   * Путь текущей попытки, а не поле файла: у дубля и у возвращённого из корзины
   * в строке БД записан источник самого первого импорта. Оболочка решает по этому
   * полю, показывать ли уведомление, — и решать она должна по тому, что человек
   * сделал сейчас.
   */
  sourceType: SourceType,
): void {
  const folderName =
    file.folderId === null ? null : (getFolderFlat(state.db, file.folderId)?.name ?? null);
  state.events.push({
    kind: 'import',
    fileId: file.id,
    sourceType,
    folderId: file.folderId,
    folderName,
    outcome,
  });
}

function recordFor(db: Db, fileId: number): FileRecord | undefined {
  const row = getFileRow(db, fileId);
  if (!row) return undefined;
  return mapFileRow(row, tagsForFiles(db, [fileId]).get(fileId) ?? []);
}

export async function importOne(state: AppState, input: ImportInput): Promise<ImportResultItem> {
  const rawName = input.filename || 'image';
  try {
    const validated = validate(input.buffer, rawName);
    if ('code' in validated) {
      return {
        originalFilename: rawName,
        outcome: 'error',
        errorCode: validated.code,
        errorMessage: validated.message,
      };
    }
    const ext = validated.ext;
    const filename = sanitizeFilename(rawName, ext);
    const sha256 = sha256of(input.buffer);

    // 1. Точный дубль блокирует импорт на всех путях.
    const exact = findActiveBySha(state.db, sha256);
    if (exact) {
      const existingFile = mapFileRow(
        exact,
        tagsForFiles(state.db, [exact.id]).get(exact.id) ?? [],
      );
      noteImport(state, existingFile, 'duplicate', input.sourceType);
      return { originalFilename: filename, outcome: 'duplicate', existingFile };
    }
    // Тот же файл лежит в корзине: sha256 уникален, поэтому возвращаем его в библиотеку.
    const inTrash = findAnyBySha(state.db, sha256);
    if (inTrash) {
      state.db.prepare(`UPDATE files SET deleted_at = NULL WHERE id = ?`).run(inTrash.id);
      const restored = recordFor(state.db, inTrash.id);
      if (restored) {
        noteImport(state, restored, 'added', input.sourceType);
        return { originalFilename: filename, outcome: 'added', file: restored };
      }
    }

    // 2. Похожий дубль. SVG участвует только в проверке точного дубля.
    const phash = isRaster(ext) ? await perceptualHash(input.buffer) : null;
    const similar = phash === null ? null : findSimilar(state.db, phash);

    if (similar !== null && SYNC_SOURCES.includes(input.sourceType)) {
      // Синхронный путь: файл НЕ сохраняем, ждём решения пользователя.
      const meta: PendingMeta = {
        filename,
        ext,
        sha256,
        phash,
        sourceType: input.sourceType,
        sourceUrl: input.sourceUrl ?? null,
        similarToFileId: null,
        folderId: input.folderId ?? null,
      };
      const pendingToken = state.pending.put(input.buffer, meta);
      return {
        originalFilename: filename,
        outcome: 'needs_confirmation',
        pendingToken,
        existingFile: recordFor(state.db, similar.fileId),
      };
    }

    const file = await persist(state, {
      buffer: input.buffer,
      filename,
      ext,
      sha256,
      phash,
      sourceType: input.sourceType,
      sourceUrl: input.sourceUrl ?? null,
      // Асинхронный путь не блокируется: помечаем ссылкой на похожий файл (IMP-01).
      similarToFileId: similar?.fileId ?? null,
      folderId: input.folderId ?? null,
    });

    if (similar !== null) {
      noteImport(state, file, 'added_similar', input.sourceType);
      return {
        originalFilename: filename,
        outcome: 'added_similar',
        file,
        existingFile: recordFor(state.db, similar.fileId),
      };
    }
    noteImport(state, file, 'added', input.sourceType);
    return { originalFilename: filename, outcome: 'added', file };
  } catch (error) {
    log.error(`импорт «${rawName}» упал`, error);
    const code = (error as NodeJS.ErrnoException).code;
    const isDisk = typeof code === 'string' && ['ENOSPC', 'EACCES', 'EPERM', 'EROFS', 'EIO'].includes(code);
    return {
      originalFilename: rawName,
      outcome: 'error',
      errorCode: isDisk ? 'disk_error' : 'internal',
      errorMessage: error instanceof Error ? error.message : 'Неизвестная ошибка импорта',
    };
  }
}

export async function importMany(state: AppState, inputs: ImportInput[]): Promise<ImportResponse> {
  const items: ImportResultItem[] = [];
  for (const input of inputs) {
    items.push(await importOne(state, input));
  }
  return { items, summary: summarize(items) };
}

/** Досохранение файла, отложенного как 'needs_confirmation'. */
export async function confirmPending(state: AppState, token: string): Promise<ImportResultItem> {
  const pending = state.pending.take(token);
  if (!pending) {
    return {
      originalFilename: '',
      outcome: 'error',
      errorCode: 'internal',
      errorMessage: 'Подтверждение просрочено или уже использовано',
    };
  }
  const { meta, buffer } = pending;
  // Пока пользователь думал, точный дубль мог появиться другим путём.
  const exact = findActiveBySha(state.db, meta.sha256);
  if (exact) {
    const existingFile = mapFileRow(exact, tagsForFiles(state.db, [exact.id]).get(exact.id) ?? []);
    noteImport(state, existingFile, 'duplicate', meta.sourceType);
    return { originalFilename: meta.filename, outcome: 'duplicate', existingFile };
  }
  try {
    const file = await persist(state, {
      buffer,
      filename: meta.filename,
      ext: meta.ext,
      sha256: meta.sha256,
      phash: meta.phash,
      sourceType: meta.sourceType,
      sourceUrl: meta.sourceUrl,
      // Пользователь уже решил, что файл нужен — бейдж «возможный дубль» не ставим.
      similarToFileId: null,
      // Папка берётся из исходного запроса: файл, брошенный в подпапку, там и остаётся.
      // Пока пользователь думал, папку могли удалить — тогда файл ложится без папки.
      folderId: meta.folderId !== null && folderExists(state.db, meta.folderId) ? meta.folderId : null,
    });
    noteImport(state, file, 'added', meta.sourceType);
    return { originalFilename: meta.filename, outcome: 'added', file };
  } catch (error) {
    log.error(`подтверждённый импорт «${meta.filename}» упал`, error);
    return {
      originalFilename: meta.filename,
      outcome: 'error',
      errorCode: 'internal',
      errorMessage: error instanceof Error ? error.message : 'Неизвестная ошибка импорта',
    };
  }
}

export function summarize(items: readonly ImportResultItem[]): ImportResponse['summary'] {
  return {
    added: items.filter((item) => item.outcome === 'added').length,
    duplicates: items.filter((item) => item.outcome === 'duplicate').length,
    similar: items.filter((item) => item.outcome === 'added_similar').length,
    errors: items.filter((item) => item.outcome === 'error').length,
  };
}
