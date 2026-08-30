/** Служебные эндпоинты: здоровье, папки, теги, настройки, онбординг. */
import fs from 'node:fs';
import type { Hono } from 'hono';
import { SCHEMA_VERSION, type SettingsResponse } from '../../shared/api.js';
import { expandHome } from './config.js';
import { badRequest } from './errors.js';
import { createFolder, deleteFolder, listFolders, updateFolder } from './folders.js';
import { parseId, parseJsonBody } from './http.js';
import { log } from './logger.js';
import { directorySize } from './paths.js';
import { folderCreateSchema, folderUpdateSchema, settingsPatchSchema } from './schemas.js';
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
    if (body.serverPort !== undefined) patch.serverPort = body.serverPort;
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
