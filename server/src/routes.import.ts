/** Эндпоинты импорта: drag&drop / ⌘V, контекстное меню, скриншоты, Folder Action, подтверждение. */
import fs from 'node:fs';
import path from 'node:path';
import type { Context, Hono } from 'hono';
import { MAX_FILE_BYTES, type ImportResponse, type SourceType } from '../../shared/api.js';
import { badRequest } from './errors.js';
import { confirmPending, importMany, summarize, type ImportInput } from './importer.js';
import { parseJsonBody } from './http.js';
import { log } from './logger.js';
import {
  importCaptureSchema,
  importConfirmSchema,
  importUrlSchema,
  importWatchSchema,
  syncSourceSchema,
} from './schemas.js';
import type { AppState } from './state.js';

const FETCH_TIMEOUT_MS = 20_000;

interface UploadedFile {
  buffer: Buffer;
  filename: string;
}

async function collectUploads(c: Context): Promise<{ files: UploadedFile[]; fields: Record<string, string> }> {
  let body: Record<string, unknown>;
  try {
    body = (await c.req.parseBody({ all: true })) as Record<string, unknown>;
  } catch {
    throw badRequest('Ожидается multipart/form-data с файлами', 'invalid_multipart');
  }
  const files: UploadedFile[] = [];
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(body)) {
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (item instanceof File) {
        files.push({ buffer: Buffer.from(await item.arrayBuffer()), filename: item.name || 'image' });
      } else if (typeof item === 'string') {
        fields[key] = item;
      }
    }
  }
  return { files, fields };
}

function emptyResponse(): ImportResponse {
  return { items: [], summary: summarize([]) };
}

function filenameFromUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const base = path.basename(decodeURIComponent(parsed.pathname));
    return base === '' || base === '/' ? 'image' : base;
  } catch {
    return 'image';
  }
}

export function registerImportRoutes(app: Hono, state: AppState): void {
  // CAP-03 / CAP-04 — синхронные пути: перетаскивание и вставка.
  app.post('/api/import', async (c) => {
    const { files, fields } = await collectUploads(c);
    if (files.length === 0) return c.json(emptyResponse());
    const parsedSource = syncSourceSchema.safeParse(fields['sourceType'] ?? 'drag_drop');
    const sourceType: SourceType = parsedSource.success ? parsedSource.data : 'drag_drop';
    const folderRaw = fields['folderId'];
    const folderId = folderRaw !== undefined && folderRaw !== '' ? Number(folderRaw) : null;
    const inputs: ImportInput[] = files.map((file) => ({
      buffer: file.buffer,
      filename: file.filename,
      sourceType,
      folderId: Number.isInteger(folderId) && folderId !== null && folderId > 0 ? folderId : null,
    }));
    return c.json(await importMany(state, inputs));
  });

  // CAP-01 — «Сохранить в Копирку» из контекстного меню: сервер сам скачивает картинку.
  app.post('/api/import/url', async (c) => {
    const body = await parseJsonBody(c, importUrlSchema);
    let target: URL;
    try {
      target = new URL(body.imageUrl);
    } catch {
      throw badRequest('Некорректный URL картинки', 'invalid_url');
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      throw badRequest('Поддерживаются только http и https', 'invalid_url');
    }
    const filename = filenameFromUrl(body.imageUrl);
    try {
      const response = await fetch(target, {
        redirect: 'follow',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok) {
        return c.json(errorResponse(filename, 'unreadable', `Источник ответил ${response.status}`));
      }
      const declared = Number(response.headers.get('content-length') ?? '0');
      if (Number.isFinite(declared) && declared > MAX_FILE_BYTES) {
        return c.json(errorResponse(filename, 'too_large', 'Картинка больше 50 МБ'));
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      return c.json(
        await importMany(state, [
          {
            buffer,
            filename,
            sourceType: 'context_menu',
            sourceUrl: body.pageUrl ?? body.imageUrl,
          },
        ]),
      );
    } catch (error) {
      log.error(`не удалось скачать ${body.imageUrl}`, error);
      return c.json(errorResponse(filename, 'unreadable', 'Не удалось скачать картинку'));
    }
  });

  // CAP-02 / CAP-08 — скриншоты вкладки и области приходят как data:URL.
  app.post('/api/import/capture', async (c) => {
    const body = await parseJsonBody(c, importCaptureSchema);
    const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(body.dataUrl);
    if (!match || match[2] !== ';base64') {
      throw badRequest('Ожидается data:URL в base64', 'invalid_data_url');
    }
    const buffer = Buffer.from(match[3] ?? '', 'base64');
    const filename = body.suggestedFilename && body.suggestedFilename.trim() !== ''
      ? body.suggestedFilename
      : `screenshot-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
    return c.json(
      await importMany(state, [
        { buffer, filename, sourceType: body.sourceType, sourceUrl: body.pageUrl ?? null },
      ]),
    );
  });

  // CAP-05 — приём файла от macOS Folder Action (асинхронный путь).
  app.post('/api/import/watch', async (c) => {
    const contentType = c.req.header('content-type') ?? '';
    const inputs: ImportInput[] = [];
    if (contentType.includes('multipart/form-data')) {
      const { files, fields } = await collectUploads(c);
      for (const file of files) {
        inputs.push({
          buffer: file.buffer,
          filename: fields['filename'] ?? file.filename,
          sourceType: 'folder_watch',
        });
      }
    } else if (contentType.includes('application/json')) {
      // Второй вариант клиента: список локальных путей вместо самих байтов.
      const body = await parseJsonBody(c, importWatchSchema);
      for (const filePath of body.paths) {
        if (!path.isAbsolute(filePath)) throw badRequest(`Ожидается абсолютный путь: ${filePath}`, 'invalid_path');
        try {
          const stat = fs.statSync(filePath);
          if (!stat.isFile()) throw new Error('это не файл');
          inputs.push({ buffer: fs.readFileSync(filePath), filename: path.basename(filePath), sourceType: 'folder_watch' });
        } catch (error) {
          log.error(`не удалось прочитать ${filePath}`, error);
          const items = [
            {
              originalFilename: path.basename(filePath),
              outcome: 'error' as const,
              errorCode: 'unreadable' as const,
              errorMessage: 'Файл не читается',
            },
          ];
          return c.json({ items, summary: summarize(items) } satisfies ImportResponse);
        }
      }
    } else {
      // Запасной путь: сырое тело + имя в query — так проще написать Folder Action на curl.
      const buffer = Buffer.from(await c.req.arrayBuffer());
      if (buffer.length > 0) {
        const url = new URL(c.req.url);
        inputs.push({
          buffer,
          filename: url.searchParams.get('filename') ?? 'screenshot.png',
          sourceType: 'folder_watch',
        });
      }
    }
    if (inputs.length === 0) return c.json(emptyResponse());
    return c.json(await importMany(state, inputs));
  });

  // Досохранение файла, отложенного модалкой «Похоже, уже есть».
  app.post('/api/import/confirm', async (c) => {
    const body = await parseJsonBody(c, importConfirmSchema);
    const item = await confirmPending(state, body.pendingToken);
    const response: ImportResponse = { items: [item], summary: summarize([item]) };
    return c.json(response);
  });
}

function errorResponse(
  filename: string,
  errorCode: 'unreadable' | 'too_large',
  errorMessage: string,
): ImportResponse {
  const items = [{ originalFilename: filename, outcome: 'error' as const, errorCode, errorMessage }];
  return { items, summary: summarize(items) };
}
