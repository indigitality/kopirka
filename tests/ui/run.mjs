#!/usr/bin/env node
/**
 * Регрессионный UI-прогон «Копирки»: одна команда поднимает изолированную
 * песочницу (сервер + Vite + временная библиотека), засевает её через HTTP API,
 * прогоняет основные сценарии интерфейса headless Chrome (puppeteer-core) и
 * гасит всё за собой. Стиль отчёта — как у server/src/smoke.ts (✓/✗, код выхода).
 *
 * Запуск: node run.mjs [--keep] [--out <dir>] [--server-port N] [--web-port N] [--sandbox-dir <dir>]
 * Подробности и ограничения — см. README.md рядом.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

import { makeApiClient, cardIds, clearSearchAndFilters, clickScope, waitFor } from './lib/helpers.mjs';
import { spawnServer, spawnVite, waitServerHealth, waitViteReady, stopAll } from './lib/processes.mjs';
import { seedLibrary } from './lib/seed.mjs';

import gridLoad from './scenarios/01-grid-load.mjs';
import folderFilter from './scenarios/02-folder-filter.mjs';
import search from './scenarios/03-search.mjs';
import sortPopover from './scenarios/04-sort-popover.mjs';
import moveDialogPosition from './scenarios/05-move-dialog-position.mjs';
import moveDialogAction from './scenarios/06-move-dialog-action.mjs';
import addTag from './scenarios/07-add-tag.mjs';
import contextMenu from './scenarios/08-context-menu.mjs';
import detailView from './scenarios/09-detail-view.mjs';
import settings from './scenarios/10-settings.mjs';
import trash from './scenarios/11-trash.mjs';
import consoleErrorsScenario from './scenarios/12-console-errors.mjs';

const TESTS_DIR = fileURLToPath(new URL('.', import.meta.url));
const APP_DIR = path.resolve(TESTS_DIR, '..', '..');

// Ни при каких обстоятельствах не касаться настоящего приложения и чужих песочниц.
const FORBIDDEN_PORTS = new Set([43117, 5173, 6006, 43118, 5174, 43120, 5176]);

const CHROME_DEFAULT = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const SCENARIOS = [
  { name: 'Сетка загрузилась: число карточек и папки сайдбара', run: gridLoad },
  { name: 'Клик по папке фильтрует сетку, «Вся библиотека» возвращает всё', run: folderFilter },
  { name: 'Поиск-модалка: ⌘K, сужение выдачи, чип тега, ⌘↵ и Esc', run: search },
  { name: 'Поповер сортировки открывается под кнопкой и меняет порядок карточек', run: sortPopover },
  { name: '«Переместить в папку»: позиция списка, высота диалога, скролл, Esc/Esc', run: moveDialogPosition },
  { name: '«Переместить в папку»: выбор папки и сам перенос файла', run: moveDialogAction },
  { name: '«Добавить тег» из панели выделения', run: addTag },
  { name: 'Контекстное меню карточки открывается у курсора, Esc закрывает', run: contextMenu },
  { name: 'Детальный просмотр: открытие, список папок под полем, Esc/Esc', run: detailView },
  { name: 'Настройки: панель на всё окно, закрытие по Esc и по крестику', run: settings },
  { name: 'Корзина: удаление файла и восстановление обратно', run: trash },
  { name: 'Консоль браузера без ошибок за весь прогон', run: consoleErrorsScenario },
];

function parseArgs(argv) {
  const opts = { keep: false, out: null, serverPort: null, webPort: null, sandboxDir: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--keep') opts.keep = true;
    else if (arg === '--out') opts.out = argv[(i += 1)];
    else if (arg === '--server-port') opts.serverPort = Number(argv[(i += 1)]);
    else if (arg === '--web-port') opts.webPort = Number(argv[(i += 1)]);
    else if (arg === '--sandbox-dir') opts.sandboxDir = argv[(i += 1)];
    else if (arg === '--help' || arg === '-h') {
      process.stdout.write(
        'Использование: node run.mjs [--keep] [--out <dir>] [--server-port N] [--web-port N] [--sandbox-dir <dir>]\n',
      );
      process.exit(0);
    }
  }
  return opts;
}

async function main() {
  const startedAt = Date.now();
  const opts = parseArgs(process.argv.slice(2));

  const serverPort = opts.serverPort ?? Number(process.env.KOPIRKA_UI_TEST_SERVER_PORT ?? 43121);
  const webPort = opts.webPort ?? Number(process.env.KOPIRKA_UI_TEST_WEB_PORT ?? 5177);
  const outDir = path.resolve(opts.out ?? process.env.KOPIRKA_UI_TEST_OUT ?? path.join(TESTS_DIR, '.out'));
  const sandboxDir =
    opts.sandboxDir ?? process.env.KOPIRKA_UI_TEST_SANDBOX ?? fs.mkdtempSync(path.join(os.tmpdir(), 'kopirka-ui-test-'));

  for (const port of [serverPort, webPort]) {
    if (FORBIDDEN_PORTS.has(port)) {
      process.stderr.write(
        `✗ порт ${port} в списке запрещённых (настоящее приложение или чужая песочница) — прерываю запуск.\n`,
      );
      process.exit(1);
    }
  }

  const configDir = path.join(sandboxDir, 'config');
  const libraryPath = path.join(sandboxDir, 'library');
  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(libraryPath, { recursive: true });
  fs.writeFileSync(
    path.join(configDir, 'config.json'),
    `${JSON.stringify({ libraryPath, serverPort, firstRunCompleted: true }, null, 2)}\n`,
  );

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const baseUrl = `http://127.0.0.1:${serverPort}`;
  // Сервер «Копирки» слушает явно 127.0.0.1 (server/src/index.ts), а вот Vite без
  // указанного server.host слушает только [::1] — 127.0.0.1 к нему не достучится
  // (проверено curl'ом: connection refused на 127.0.0.1, 200 на localhost).
  const webBaseUrl = `http://localhost:${webPort}`;

  process.stdout.write(
    `Песочница: ${sandboxDir}\nСервер: ${baseUrl}\nVite: ${webBaseUrl}\nСкриншоты: ${outDir}\n\n`,
  );

  let serverProc = null;
  let viteProc = null;
  let browser = null;
  let cleanedUp = false;

  const cleanup = async () => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (browser) {
      await browser.close().catch(() => undefined);
    }
    if (!opts.keep) {
      await stopAll([serverProc, viteProc]);
      fs.rmSync(sandboxDir, { recursive: true, force: true });
    } else {
      process.stdout.write(
        `\n--keep: песочница и процессы оставлены.\n` +
          `  сервер PID ${serverProc?.child.pid ?? '—'} · vite PID ${viteProc?.child.pid ?? '—'}\n` +
          `  папка: ${sandboxDir}\n` +
          `  погасить вручную: kill ${serverProc?.child.pid ?? ''} ${viteProc?.child.pid ?? ''}\n`,
      );
    }
  };

  let onSignal;
  const registerSignalHandlers = () => {
    onSignal = (signal) => {
      process.stdout.write(`\nПолучен ${signal}, останавливаюсь…\n`);
      cleanup().finally(() => process.exit(signal === 'SIGINT' ? 130 : 143));
    };
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
  };
  registerSignalHandlers();

  let failures = 0;

  try {
    // ── Сервер ────────────────────────────────────────────────────────────────
    serverProc = spawnServer({ appDir: APP_DIR, configDir, libraryPath, port: serverPort });
    const serverUp = await waitServerHealth(baseUrl, { timeoutMs: 20000 });
    if (!serverUp) {
      process.stderr.write(`✗ сервер не поднялся на ${baseUrl}\n--- вывод сервера ---\n${serverProc.log}\n`);
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
      await cleanup();
      process.exit(1);
    }

    // ── Vite ──────────────────────────────────────────────────────────────────
    viteProc = spawnVite({ appDir: APP_DIR, apiTarget: baseUrl, webPort });
    const viteUp = await waitViteReady(webBaseUrl, { timeoutMs: 20000 });
    if (!viteUp) {
      process.stderr.write(`✗ Vite не поднялся на ${webBaseUrl}\n--- вывод Vite ---\n${viteProc.log}\n`);
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
      await cleanup();
      process.exit(1);
    }

    // ── Данные ────────────────────────────────────────────────────────────────
    const api = makeApiClient(baseUrl);
    process.stdout.write('Засеваю библиотеку…\n');
    const seed = await seedLibrary({ appDir: APP_DIR, api, baseUrl });
    process.stdout.write(
      `  папок: ${seed.totalFolders}, файлов: ${seed.totalFiles} (разложено ${seed.filedCount}, без папки ${seed.unfiledCount})\n\n`,
    );

    // ── Браузер ───────────────────────────────────────────────────────────────
    const chromePath = process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN) ? process.env.CHROME_BIN : CHROME_DEFAULT;
    if (!fs.existsSync(chromePath)) {
      throw new Error(`не найден Google Chrome по пути ${chromePath} (переопредели через CHROME_BIN)`);
    }
    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: true,
      defaultViewport: { width: 1280, height: 760, deviceScaleFactor: 2 },
      args: ['--force-color-profile=srgb', '--font-render-hinting=none'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 760, deviceScaleFactor: 2 });

    const consoleErrors = [];
    // В index.html нет <link rel="icon">, поэтому браузер сам разово запрашивает
    // /favicon.ico — у Vite-дева его нет, это честный 404, но не баг приложения.
    // Он приходит в консоль как безликое "Failed to load resource…" без URL в
    // тексте сообщения, поэтому ловим сам факт неудачного запроса на favicon
    // через network-события и гасим ровно одно совпавшее по времени сообщение.
    const failedFaviconRequests = [];
    /*
      Тот же запрос, но пойманный на отправке. Событие `response` и сообщение консоли
      приходят из CDP независимо, и порядок между ними не гарантирован: на одном прогоне
      из трёх фильтр ниже не находил ещё не записанного фаворита и считал безобидный 404
      ошибкой приложения. `request` же заведомо раньше обоих — по нему и страхуемся.
    */
    const faviconRequests = [];
    page.on('request', (request) => {
      if (/favicon/i.test(request.url())) faviconRequests.push(request.url());
    });
    page.on('response', (response) => {
      if (response.status() >= 400 && /favicon/i.test(response.url())) failedFaviconRequests.push(response.url());
    });
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      if (/favicon/i.test(text)) return;
      if (/failed to load resource/i.test(text) && (failedFaviconRequests.length > 0 || faviconRequests.length > 0)) {
        if (failedFaviconRequests.length > 0) failedFaviconRequests.pop();
        else faviconRequests.pop();
        return;
      }
      consoleErrors.push({ kind: 'console.error', text });
    });
    page.on('pageerror', (error) => {
      consoleErrors.push({ kind: 'pageerror', text: error instanceof Error ? (error.stack ?? error.message) : String(error) });
    });

    await page.goto(webBaseUrl, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.evaluate(() => document.fonts.ready).catch(() => undefined);

    const resetToLibraryRoot = async () => {
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      // Если предыдущий сценарий упал раньше, чем успел закрыть свой диалог сам
      // (например, сценарий 5 — на структурной проверке, до собственных Esc/Esc),
      // скрим модалки может ещё доигрывать exit-анимацию поверх сайдбара и
      // перехватывать следующий клик — тогда clickScope промахивался бы мимо
      // «Всей библиотеки» (поймано на прогоне на старом коде: сценарий 6 после
      // упавшего сценария 5 оставался на прежнем срезе с чужим файлом всё ещё
      // выделенным). Ждём, пока диалог действительно уйдёт из DOM, а не только
      // отправляем Esc и надеемся на лучшее.
      await waitFor(async () => (await page.$('[role="dialog"]')) === null, {
        timeout: 4000,
        message: 'не дождался закрытия диалога, оставшегося от предыдущего сценария',
      });
      await clickScope(page, 'Вся библиотека');
      // Поиска в верхней панели больше нет (NEW-02): запрос и чипы после «⌘↵ применить
      // как фильтр» снимаются кнопкой поиска и панелью фильтров.
      await clearSearchAndFilters(page);
      await waitFor(async () => (await cardIds(page)).length > 0, {
        timeout: 6000,
        message: 'сетка не вернулась к базовому состоянию (resetToLibraryRoot)',
      });
    };

    const shot = async (name) => {
      const file = path.join(outDir, `${name}.png`);
      await page.screenshot({ path: file });
      return file;
    };

    const ctx = { page, api, baseUrl, webBaseUrl, seed, outDir, shot, resetToLibraryRoot, consoleErrors };

    // ── Прогон сценариев ──────────────────────────────────────────────────────
    for (const [index, scenario] of SCENARIOS.entries()) {
      const number = String(index + 1).padStart(2, '0');
      const scenarioStart = Date.now();
      try {
        await scenario.run(ctx);
        const ms = Date.now() - scenarioStart;
        process.stdout.write(`✓ [${number}] ${scenario.name} (${ms}мс)\n`);
      } catch (error) {
        failures += 1;
        const ms = Date.now() - scenarioStart;
        const message = error instanceof Error ? error.message : String(error);
        process.stdout.write(`✗ [${number}] ${scenario.name} (${ms}мс)\n    ${message}\n`);
        try {
          await page.screenshot({ path: path.join(outDir, `FAIL-${number}.png`) });
        } catch {
          // страница могла уйти в совсем нерабочее состояние — скриншот необязателен
        }
      }
    }

    const elapsedMs = Date.now() - startedAt;
    process.stdout.write(
      `\n${failures === 0 ? 'Все сценарии прошли' : `Провалено сценариев: ${failures} из ${SCENARIOS.length}`} — ${(elapsedMs / 1000).toFixed(1)}s\n`,
    );
    process.exitCode = failures > 0 ? 1 : 0;
  } catch (error) {
    process.stderr.write(`✗ прогон упал: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    if (serverProc?.log) process.stderr.write(`\n--- вывод сервера ---\n${serverProc.log}\n`);
    if (viteProc?.log) process.stderr.write(`\n--- вывод Vite ---\n${viteProc.log}\n`);
    process.exitCode = 1;
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    await cleanup();
  }

  // Явный выход: puppeteer/undici иногда держат сокеты чуть дольше, чем нужно —
  // не хотим, чтобы агент, вызвавший npm run test:ui, завис в ожидании процесса.
  process.exit(process.exitCode ?? 0);
}

void main();
