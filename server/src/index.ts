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

/**
 * Браузер открываем только при запуске сервера «сам по себе» (npm start): в десктопной
 * сборке оболочка сама рисует окно и ставит KOPIRKA_NO_OPEN.
 */
function openBrowser(url: string): void {
  if (process.env.KOPIRKA_NO_OPEN) return;
  const done = (error: Error | null) => {
    if (error) log.warn(`не удалось открыть браузер: ${error.message}`);
  };
  if (process.platform === 'darwin') {
    execFile('open', [url], done);
    return;
  }
  if (process.platform === 'win32') {
    // `start` — встроенная команда cmd, отдельного исполняемого файла нет. Первый
    // пустой аргумент — «заголовок окна», иначе start примет за него сам URL.
    // Аргументы уходят дословно, но пользовательских данных здесь нет: URL мы собрали
    // сами из 127.0.0.1 и номера порта.
    execFile('cmd.exe', ['/c', 'start', '""', url], { windowsVerbatimArguments: true, windowsHide: true }, done);
    return;
  }
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
    // Разовый запуск объясняем на языке той оболочки, в которой человек это читает.
    process.platform === 'win32'
      ? `  3) или запустить разово с другим портом: set KOPIRKA_PORT=${port + 1} && npm start`
      : `  3) или запустить разово с другим портом: KOPIRKA_PORT=${port + 1} npm start`,
  ].join('\n');
  process.stderr.write(`${message}\n`);
  log.error(`порт ${port} занят`);
}

const PARENT_POLL_MS = 5000;

/**
 * Жив ли ещё родитель — вторая страховка к поводку stdin, не зависящая от трубы.
 *
 * macOS: осиротевший процесс переходит к init (1).
 * Windows: ppid остаётся прежним (сироты как понятия нет), поэтому спрашиваем систему,
 * существует ли этот pid. Сигнал 0 ничего не посылает, только проверяет. «Умер» —
 * ровно один ответ, ESRCH; всё остальное (EPERM «есть, но чужой», странные коды,
 * непонятный ppid) трактуем как «жив»: страховка не должна гасить сервер по догадке,
 * на этот случай есть поводок stdin. Windows охотно переиспользует pid'ы — и это тоже
 * ошибка в сторону «жив».
 */
function parentGone(): boolean {
  if (process.platform === 'win32') {
    if (process.ppid <= 1) return false;
    try {
      process.kill(process.ppid, 0);
      return false;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'ESRCH';
    }
  }
  return process.ppid === 1;
}

/**
 * Десктопная оболочка (Tauri) отдаёт серверу свой stdin как поводок: когда родитель
 * умирает — хоть штатно, хоть по SIGKILL (на Windows — TerminateProcess), — труба
 * закрывается и сервер уходит следом. Без этого осиротевший Node продолжил бы держать
 * порт, и следующий запуск не состоялся бы. На Windows это ЕДИНСТВЕННЫЙ штатный путь
 * остановки: сигналов там нет, оболочка гасит процесс жёстко, и только поводок даёт
 * серверу закрыть базу самому.
 */
function watchParent(shutdown: (reason: string) => void): void {
  if (!process.env.KOPIRKA_PARENT_STDIN) return;
  let done = false;
  const bye = (reason: string) => {
    if (done) return;
    done = true;
    shutdown(reason);
  };
  process.stdin.resume();
  process.stdin.on('end', () => bye('закрытие stdin родителя'));
  process.stdin.on('close', () => bye('закрытие stdin родителя'));
  process.stdin.on('error', () => bye('закрытие stdin родителя'));

  const poll = setInterval(() => {
    if (parentGone()) bye('родитель умер');
  }, PARENT_POLL_MS);
  poll.unref();
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
  // На Windows настоящих сигналов нет: SIGINT приходит по Ctrl+C в консоли, а SIGTERM
  // Node только эмулирует (его поднимет process.kill из другого Node — например, из
  // smoke-теста). Подписка безопасна на обеих платформах, но на Windows штатный останов
  // из оболочки идёт не через сигналы, а через поводок stdin — см. watchParent.
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  watchParent(shutdown);
  process.on('uncaughtException', (error) => log.error('необработанное исключение', error));
  process.on('unhandledRejection', (reason) => log.error('необработанный rejection', reason));
}

void main();
