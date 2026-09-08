/** Сборка HTTP-приложения: CORS, API-роуты, статика веб-интерфейса, обработка ошибок. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import type { ApiError } from '../../shared/api.js';
import { HttpError } from './errors.js';
import { sendFile } from './http.js';
import { log } from './logger.js';
import { registerFileRoutes } from './routes.files.js';
import { registerImportRoutes } from './routes.import.js';
import { registerLibraryRoutes } from './routes.library.js';
import type { AppState } from './state.js';

/** Корень собранного интерфейса, уже без хвостового разделителя (на Windows он `\`). */
const WEB_DIST = path.resolve(fileURLToPath(new URL('../../web/dist/', import.meta.url)));

const STATIC_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * URL-путь запроса → файл внутри web/dist, либо null, если он оттуда выходит.
 *
 * Проверка «внутри» идёт через path.resolve и path.sep, а не через сравнение строк с
 * `/`: на Windows разделитель другой, и старое сравнение с корнем там не срабатывало.
 * resolve заодно съедает `..` в любом написании — как `..%2F`, так и `..%5C`
 * (обратный слэш на Windows тоже разделитель, на macOS это обычный символ имени).
 *
 * Чистая функция с внешними path и признаком Windows: обе раскладки проверяются на
 * macOS (см. smoke.ts), без подмены process.platform в рабочем коде.
 */
export function resolveStaticCandidate(
  root: string,
  pathname: string,
  p: path.PlatformPath = path,
  windows: boolean = process.platform === 'win32',
): string | null {
  if (pathname.includes('\0')) return null;
  // Windows: `app.js::$DATA` — альтернативный поток того же файла, отдавать его нельзя,
  // а двоеточию в пути статики делать нечего (диск в pathname не приходит).
  if (windows && pathname.includes(':')) return null;
  const candidate = p.resolve(root, `.${pathname}`);
  const prefix = root.endsWith(p.sep) ? root : `${root}${p.sep}`;
  if (candidate !== root && !candidate.startsWith(prefix)) return null;
  return candidate;
}

/**
 * Сервер слушает только 127.0.0.1, но браузер может принести запрос со стороннего сайта.
 * Пускаем расширение (chrome-extension://) и собственный веб-интерфейс; остальным — 403.
 */
function isAllowedOrigin(origin: string, port: number): boolean {
  if (origin.startsWith('chrome-extension://')) return true;
  return origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`;
}

export function createApp(state: AppState): Hono {
  const app = new Hono();

  app.use('*', async (c, next) => {
    const origin = c.req.header('origin');
    if (origin !== undefined) {
      if (!isAllowedOrigin(origin, state.boundPort ?? state.config.serverPort)) {
        log.warn(`отклонён запрос с origin ${origin}`);
        const error: ApiError = { error: 'Запросы с этого источника запрещены', code: 'forbidden_origin' };
        return c.json(error, 403);
      }
      c.header('Access-Control-Allow-Origin', origin);
      c.header('Vary', 'Origin');
      c.header('Access-Control-Allow-Credentials', 'false');
    }
    if (c.req.method === 'OPTIONS') {
      c.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, HEAD, OPTIONS');
      c.header('Access-Control-Allow-Headers', 'Content-Type, X-Kopirka-Client');
      c.header('Access-Control-Max-Age', '600');
      return c.body(null, 204);
    }
    await next();
  });

  registerLibraryRoutes(app, state);
  registerFileRoutes(app, state);
  registerImportRoutes(app, state);

  app.all('/api/*', (c) => {
    const error: ApiError = { error: `Неизвестный эндпоинт: ${c.req.method} ${new URL(c.req.url).pathname}`, code: 'not_found' };
    return c.json(error, 404);
  });

  // В проде отдаём собранный веб-интерфейс, на неизвестных путях — index.html (SPA-fallback).
  app.get('*', (c) => {
    if (!fs.existsSync(WEB_DIST)) {
      return c.text('Веб-интерфейс не собран: нет ../web/dist. В режиме разработки это нормально.', 404);
    }
    const pathname = decodeURIComponent(new URL(c.req.url).pathname);
    const candidate = resolveStaticCandidate(WEB_DIST, pathname);
    // statSync().isFile() отсекает и папки, и системные устройства Windows (`nul`, `con`),
    // которые открываются в любой директории.
    if (candidate !== null && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return sendFile(c, candidate, {
        contentType: STATIC_TYPES[path.extname(candidate).toLowerCase()] ?? 'application/octet-stream',
        etag: staticEtag(candidate),
        cacheControl: candidate.endsWith('.html') ? 'no-cache' : 'private, max-age=3600',
      });
    }
    const index = path.join(WEB_DIST, 'index.html');
    if (!fs.existsSync(index)) return c.text('index.html не найден в ../web/dist', 404);
    return sendFile(c, index, {
      contentType: 'text/html; charset=utf-8',
      etag: staticEtag(index),
      cacheControl: 'no-cache',
    });
  });

  app.onError((error, c) => {
    if (error instanceof HttpError) {
      const payload: ApiError = { error: error.message, code: error.code };
      return c.json(payload, error.status as 400);
    }
    log.error(`${c.req.method} ${new URL(c.req.url).pathname}`, error);
    const payload: ApiError = {
      error: error instanceof Error ? error.message : 'Внутренняя ошибка сервера',
      code: 'internal',
    };
    return c.json(payload, 500);
  });

  return app;
}

function staticEtag(absPath: string): string {
  const stat = fs.statSync(absPath);
  return `${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}`;
}
