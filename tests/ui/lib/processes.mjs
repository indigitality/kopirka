/**
 * Жизненный цикл процессов песочницы: сервер «Копирки» (tsx) и Vite.
 * Стиль — как в server/src/smoke.ts (spawn + сбор stdout/stderr + опрос health),
 * расширено под второй процесс (Vite) и более настойчивую остановку (SIGTERM → SIGKILL).
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { sleep } from './helpers.mjs';

/**
 * Node, которым запущен сам run.mjs — используем его же для дочерних процессов
 * (tsx и vite — обычные .mjs/.cli.mjs файлы, а не шелл-шимы из node_modules/.bin).
 * Так мы не зависим от того, какой именно `node` лежит в PATH у процесса-родителя.
 */
const NODE_BIN = process.execPath;

/** Обёртка над одним дочерним процессом: держит буфер логов и знает, как себя убить. */
function trackProcess(child, label) {
  let log = '';
  child.stdout?.on('data', (chunk) => (log += chunk.toString()));
  child.stderr?.on('data', (chunk) => (log += chunk.toString()));
  return {
    label,
    child,
    get log() {
      return log;
    },
  };
}

export function spawnServer({ appDir, configDir, libraryPath, port }) {
  const serverDir = path.join(appDir, 'server');
  const tsxCli = path.join(appDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const entry = path.join(serverDir, 'src', 'index.ts');
  const child = spawn(NODE_BIN, [tsxCli, entry], {
    cwd: serverDir,
    env: {
      ...process.env,
      KOPIRKA_CONFIG_DIR: configDir,
      KOPIRKA_LIBRARY_PATH: libraryPath,
      KOPIRKA_PORT: String(port),
      KOPIRKA_NO_OPEN: '1',
      KOPIRKA_QUIET: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return trackProcess(child, 'сервер');
}

export function spawnVite({ appDir, apiTarget, webPort }) {
  const webDir = path.join(appDir, 'web');
  const viteJs = path.join(appDir, 'node_modules', 'vite', 'bin', 'vite.js');
  const child = spawn(NODE_BIN, [viteJs], {
    cwd: webDir,
    env: {
      ...process.env,
      KOPIRKA_API_TARGET: apiTarget,
      KOPIRKA_WEB_PORT: String(webPort),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return trackProcess(child, 'vite');
}

/** Опрос до первого успешного ответа predicate или до таймаута. */
async function pollUntilReady(predicate, { timeoutMs, intervalMs = 150 }) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (await predicate()) return true;
    } catch {
      // сервер/Vite ещё не слушает порт — пробуем ещё раз
    }
    await sleep(intervalMs);
  }
  return false;
}

/**
 * /api/health с заголовком Origin (сервер пускает только свой origin —
 * server/src/app.ts::isAllowedOrigin; без заголовка проверка вообще не сработала бы,
 * но так мы заодно проверяем, что CORS-замок настроен на наш собственный порт).
 */
export function waitServerHealth(baseUrl, opts) {
  return pollUntilReady(async () => {
    const response = await fetch(`${baseUrl}/api/health`, { headers: { Origin: baseUrl } });
    return response.ok;
  }, opts);
}

export function waitViteReady(baseUrl, opts) {
  return pollUntilReady(async () => {
    const response = await fetch(baseUrl);
    return response.status === 200;
  }, opts);
}

/** SIGTERM, и если через paddingMs процесс жив — SIGKILL. Не бросает, даже если процесс уже мёртв. */
async function stopProcess(tracked, paddingMs = 2000) {
  if (!tracked || tracked.child.killed || tracked.child.exitCode !== null) return;
  const exited = new Promise((resolve) => tracked.child.once('exit', resolve));
  tracked.child.kill('SIGTERM');
  const result = await Promise.race([exited.then(() => 'exited'), sleep(paddingMs).then(() => 'timeout')]);
  if (result === 'timeout' && tracked.child.exitCode === null) {
    tracked.child.kill('SIGKILL');
    await exited;
  }
}

export async function stopAll(tracked) {
  await Promise.all(tracked.filter(Boolean).map((item) => stopProcess(item)));
}
