/** Служебные эндпоинты: здоровье, папки, теги, настройки, онбординг. */
import fs from 'node:fs';
import net from 'node:net';
import type { Hono } from 'hono';
import {
  SCHEMA_VERSION,
  type EventsResponse,
  type NotifyResponse,
  type SettingsResponse,
} from '../../shared/api.js';
import { expandHome } from './config.js';
import { badRequest } from './errors.js';
import { createFolder, deleteFolder, listFolders, updateFolder } from './folders.js';
import { parseId, parseJsonBody } from './http.js';
import { log } from './logger.js';
import { directorySize } from './paths.js';
import {
  folderCreateSchema,
  folderUpdateSchema,
  notifySchema,
  settingsPatchSchema,
} from './schemas.js';
import type { AppState } from './state.js';
import { listTags } from './tags.js';

function appVersion(): string {
  try {
    const raw = fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8');
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const VERSION = appVersion();

/**
 * SVC-06 — порт проверяем до записи в конфиг: иначе после перезапуска сервер не поднимется,
 * а вернуть порт будет уже неоткуда — интерфейса не будет.
 */
function portIsFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', (error: NodeJS.ErrnoException) => {
      resolve(error.code !== 'EADDRINUSE' && error.code !== 'EACCES');
    });
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
  });
}

function settingsPayload(state: AppState): SettingsResponse {
  return {
    libraryPath: state.libraryPath,
    serverPort: state.config.serverPort,
    firstRunCompleted: state.config.firstRunCompleted,
    schemaVersion: state.schemaVersion,
    logPath: log.path(),
    appVersion: VERSION,
    librarySizeBytes: directorySize(state.libraryPath),
  };
}

export function registerLibraryRoutes(app: Hono, state: AppState): void {
  app.get('/api/health', (c) =>
    c.json({ ok: true, appVersion: VERSION, schemaVersion: SCHEMA_VERSION, libraryPath: state.libraryPath }),
  );

  /**
   * Лента событий. Без `after` отдаём только номер последнего:
   * так новый клиент запоминает точку отсчёта и не получает залпом всё накопившееся.
   */
  app.get('/api/events', (c) => {
    const raw = c.req.query('after');
    const after = raw === undefined ? null : Number(raw);
    const payload: EventsResponse = {
      events: after !== null && Number.isInteger(after) && after >= 0 ? state.events.since(after) : [],
      last: state.events.last,
    };
    return c.json(payload);
  });

  /**
   * Сказать уведомлением от имени приложения. Сервер сам ничего не показывает — он
   * кладёт запись в ту же ленту, а системное уведомление рисует оболочка: только у неё
   * есть иконка «Копирки». Так обработчик быстрой команды Finder перестаёт звать
   * `osascript` и приносить пользователю иконку Script Editor.
   *
   * Доступ — как у всех: сервер слушает 127.0.0.1, а сторонний origin отсекает общий
   * middleware в app.ts. Скрипт с локальной машины ходит без Origin либо со своим.
   */
  app.post('/api/notify', async (c) => {
    const body = await parseJsonBody(c, notifySchema);
    const stored = state.events.push({
      kind: 'notice',
      title: body.title ?? null,
      body: body.body,
    });
    const payload: NotifyResponse = { ok: true, seq: stored.seq };
    return c.json(payload);
  });

  // Возвращаем голый массив: такой формат объявлен в клиенте (web/src/lib/api.ts).
  app.get('/api/folders', (c) => c.json(listFolders(state.db)));

  app.post('/api/folders', async (c) => {
    const body = await parseJsonBody(c, folderCreateSchema);
    return c.json(createFolder(state.db, body.name, body.parentFolderId ?? null), 201);
  });

  app.patch('/api/folders/:id', async (c) => {
    const id = parseId(c.req.param('id'));
    const body = await parseJsonBody(c, folderUpdateSchema);
    return c.json(updateFolder(state.db, id, body));
  });

  // 5.4 — папка удаляется со всем поддеревом, файлы живут дальше с folder_id = NULL.
  app.delete('/api/folders/:id', (c) => {
    const id = parseId(c.req.param('id'));
    const result = deleteFolder(state.db, id);
    return c.json({ ok: true, ...result });
  });

  app.get('/api/tags', (c) => c.json(listTags(state.db)));

  app.get('/api/settings', (c) => c.json(settingsPayload(state)));

  app.patch('/api/settings', async (c) => {
    const body = await parseJsonBody(c, settingsPatchSchema);
    const previousPort = state.config.serverPort;
    const patch: Parameters<AppState['patchConfig']>[0] = {};
    if (body.libraryPath !== undefined) {
      const resolved = expandHome(body.libraryPath);
      if (fs.existsSync(resolved) && !fs.statSync(resolved).isDirectory()) {
        throw badRequest('Путь библиотеки должен быть папкой', 'invalid_library_path');
      }
      // SET-02: файлы не переносятся, приложение просто начинает работать с новой директорией.
      patch.libraryPath = resolved;
    }
    if (body.serverPort !== undefined) {
      // Свой же порт — это «без изменений», занимать его повторно нельзя и не нужно.
      const own = body.serverPort === previousPort || body.serverPort === state.boundPort;
      if (!own && !(await portIsFree(body.serverPort))) {
        throw badRequest(`Порт ${body.serverPort} занят другой программой`, 'port_busy');
      }
      patch.serverPort = body.serverPort;
    }
    if (body.firstRunCompleted !== undefined) patch.firstRunCompleted = body.firstRunCompleted;
    state.patchConfig(patch);
    if (body.serverPort !== undefined) {
      log.info(`порт изменён на ${body.serverPort}, применится после перезапуска`);
    }
    return c.json({
      ...settingsPayload(state),
      // Порт применится только после перезапуска — переподнимать слушателя на лету незачем.
      restartRequired: body.serverPort !== undefined && body.serverPort !== previousPort,
    });
  });

  app.post('/api/onboarding/complete', (c) => {
    state.patchConfig({ firstRunCompleted: true });
    return c.json(settingsPayload(state));
  });
}
