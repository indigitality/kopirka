/** Точка входа: конфиг → библиотека → HTTP-сервер на 127.0.0.1 → автоочистка корзины → браузер. */
import { execFile } from 'node:child_process';
import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { appPaths, loadConfig } from './config.js';
import { expiredTrashIds, purgeFiles } from './files.js';
import { log } from './logger.js';
import { AppState } from './state.js';

const TRASH_TTL_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface RunningServer {
  port: number;
  state: AppState;
  close: () => Promise<void>;
}

/** Автоочистка корзины: при старте и далее раз в сутки (05 §3.2). */
function runTrashCleanup(state: AppState): void {
  try {
    const ids = expiredTrashIds(state.db, TRASH_TTL_DAYS);
    if (ids.length === 0) return;
    const purged = purgeFiles(state.db, state.libraryPath, ids);
    log.info(`автоочистка корзины: удалено ${purged} файлов старше ${TRASH_TTL_DAYS} дней`);
  } catch (error) {
    log.error('автоочистка корзины упала', error);
  }
}

export async function start(): Promise<RunningServer> {
  const config = loadConfig();
  const state = new AppState(config);
  log.info(`библиотека: ${state.libraryPath} (схема ${state.schemaVersion})`);

  runTrashCleanup(state);
  const cleanupTimer = setInterval(() => runTrashCleanup(state), DAY_MS);
  cleanupTimer.unref();

  const app = createApp(state);
  const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: config.serverPort });

  await new Promise<void>((resolve, reject) => {
    server.once('listening', () => resolve());
    server.once('error', (error: NodeJS.ErrnoException) => reject(error));
  });

  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : config.serverPort;
  state.boundPort = port;
  log.info(`Копирка слушает http://127.0.0.1:${port}`);

  return {
    port,
    state,
    close: async () => {
      clearInterval(cleanupTimer);
      await new Promise<void>((resolve) => server.close(() => resolve()));
      state.close();
    },
  };
}

function openBrowser(url: string): void {
  if (process.env.KOPIRKA_NO_OPEN) return;
  if (process.platform !== 'darwin') return;
  execFile('open', [url], (error) => {
    if (error) log.warn(`не удалось открыть браузер: ${error.message}`);
  });
}

// SVC-06 — занятый порт объясняем словами, а не стектрейсом.
function reportPortBusy(port: number): void {
  const { configPath } = appPaths();
  const message = [
    `Порт ${port} уже занят — Копирка не может запуститься.`,
    'Скорее всего, уже запущен другой экземпляр приложения.',
    'Что делать:',
    '  1) закрыть другой экземпляр Копирки;',
    `  2) или сменить порт в ${configPath} (поле "serverPort");`,
    `  3) или запустить разово с другим портом: KOPIRKA_PORT=${port + 1} npm start`,
  ].join('\n');
  process.stderr.write(`${message}\n`);
  log.error(`порт ${port} занят`);
}

/**
 * Десктопная оболочка (Tauri) отдаёт серверу свой stdin как поводок: когда родитель
 * умирает — хоть штатно, хоть по SIGKILL, — труба закрывается и сервер уходит следом.
 * Без этого осиротевший Node продолжил бы держать порт, и следующий запуск не состоялся бы.
 */
function watchParent(shutdown: (reason: string) => void): void {
  if (!process.env.KOPIRKA_PARENT_STDIN) return;
  let done = false;
  const bye = () => {
    if (done) return;
    done = true;
    shutdown('закрытие stdin родителя');
  };
  process.stdin.resume();
  process.stdin.on('end', bye);
  process.stdin.on('close', bye);
  process.stdin.on('error', bye);
}

async function main(): Promise<void> {
  let running: RunningServer;
  try {
    running = await start();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EADDRINUSE') {
      reportPortBusy(loadConfig().serverPort);
    } else {
      process.stderr.write(`Копирка не запустилась: ${(error as Error).message}\n`);
      log.error('запуск не удался', error);
    }
    process.exit(1);
    return;
  }

  openBrowser(`http://127.0.0.1:${running.port}`);

  const shutdown = (signal: string) => {
    log.info(`останов по ${signal}`);
    void running.close().then(() => process.exit(0));
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  watchParent(shutdown);
  process.on('uncaughtException', (error) => log.error('необработанное исключение', error));
  process.on('unhandledRejection', (reason) => log.error('необработанный rejection', reason));
}

void main();
