#!/usr/bin/env node
/**
 * Прогон в настоящем WKWebView — движке Tauri/Safari, а не Blink. Дополняет
 * ../run.mjs: там headless Chrome сам компенсирует ошибку containing block у
 * Floating UI (см. README, «Зачем два движка»), и позиционные баги вроде
 * коммита 54c6287 в нём не ловятся принципиально — только структурной
 * проверкой. Здесь тот же баг ловится напрямую, по геометрии.
 *
 * Песочница и сид — те же помощники, что у Chrome-прогона (../lib/processes.mjs,
 * ../lib/seed.mjs), никакого отдельного стенда: два прогона идут
 * последовательно на одних и тех же портах.
 *
 * Запуск: node webkit/run.mjs [--keep] [--out <dir>] [--server-port N] [--web-port N]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { makeApiClient } from '../lib/helpers.mjs';
import { spawnServer, spawnVite, waitServerHealth, waitViteReady, stopAll } from '../lib/processes.mjs';
import { seedLibrary } from '../lib/seed.mjs';
import { HELPERS_SRC } from './inject.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const APP_DIR = path.resolve(HERE, '..', '..', '..');
const SWIFT_PROBE = path.join(HERE, 'wkprobe.swift');

const FORBIDDEN_PORTS = new Set([43117, 5173, 6006, 43118, 5174, 43120, 5176]);

// ── Сборка шагов для wkprobe.swift ──────────────────────────────────────────

function stepBuilder(outDir) {
  const steps = [];
  const js = (name, code) => steps.push({ op: 'js', name, code });
  const wait = (ms) => steps.push({ op: 'wait', ms });
  const waitFor = (sel, timeout = 15000) => steps.push({ op: 'waitFor', sel, timeout });
  const shot = (name) => steps.push({ op: 'shot', file: path.join(outDir, `${name}.png`) });
  const clickCenter = (name, sel) =>
    js(
      name,
      `var r = window.__p.rectOf(${JSON.stringify(sel)});
       if (!r) return { error: 'не нашёл ' + ${JSON.stringify(sel)} };
       return window.__p.clickAt(r.cx, r.cy);`,
    );
  return { steps, js, wait, waitFor, shot, clickCenter };
}

/** Селектор поля выбора папки — общий для диалога переноса и панели деталей. */
const FOLDER_TRIGGER = 'button[aria-haspopup="listbox"]';
const SORT_TRIGGER = '[aria-label^="Сортировка:"]';

function buildSpec({ webBaseUrl, outDir }) {
  const { steps, js, wait, waitFor, shot, clickCenter } = stepBuilder(outDir);

  steps.push({ op: 'goto', url: webBaseUrl });
  waitFor('[data-file-id]', 20000);
  wait(800);
  js('helpers', HELPERS_SRC);
  js('userAgent', 'return navigator.userAgent;');

  // ── «Переместить в папку»: позиция списка, wheel, высота, Esc/Esc ──────────
  clickCenter('selectCard', '[data-file-id]');
  waitFor('[role="toolbar"]');
  wait(400);
  js('openMoveDialog', `return window.__p.clickText('[role="toolbar"] button', 'В папку');`);
  waitFor('[role="dialog"]');
  wait(500);
  js('dialogRectBefore', `return window.__p.measure(null, null).dialog;`);
  clickCenter('openMoveSelect', FOLDER_TRIGGER);
  waitFor('[role="listbox"]');
  wait(500);
  js('moveList', `return window.__p.measure(${JSON.stringify(FOLDER_TRIGGER)}, '[role="listbox"]');`);
  shot('move-dialog-list');
  js('moveWheel', `return window.__p.wheelOnFirstOption(40);`);
  js('escList', `return window.__p.key('Escape');`);
  wait(400);
  js('layersAfterFirstEsc', `return window.__p.layers();`);
  js('escDialog', `return window.__p.key('Escape');`);
  wait(400);
  js('layersAfterSecondEsc', `return window.__p.layers();`);

  // ── Детальный просмотр: селект папки в панели деталей ───────────────────────
  // Обычный dblclick через CDP/pointer-протокол GridCard.tsx (см. README) тут
  // ни при чём — событие диспатчится напрямую, минуя pointerdown-цепочку.
  js(
    'openDetail',
    `var c = document.querySelector('[data-file-id]');
     if (!c) return { error: 'нет карточки' };
     c.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true, view: window }));
     return true;`,
  );
  waitFor('[role="dialog"]');
  wait(500);
  clickCenter('openDetailSelect', FOLDER_TRIGGER);
  waitFor('[role="listbox"]');
  wait(500);
  js('detailSelect', `return window.__p.measure(${JSON.stringify(FOLDER_TRIGGER)}, '[role="listbox"]');`);
  shot('detail-select');
  js('closeDetailSelect', `return window.__p.key('Escape');`);
  wait(300);
  js('closeDetail', `return window.__p.key('Escape');`);
  wait(400);

  // ── Поповер сортировки ───────────────────────────────────────────────────────
  clickCenter('openSort', SORT_TRIGGER);
  waitFor('[role="menuitemradio"]');
  wait(500);
  js('sortPopover', `return window.__p.measure(${JSON.stringify(SORT_TRIGGER)}, '[role="menuitemradio"]');`);
  shot('sort-popover');
  js('closeSort', `return window.__p.key('Escape');`);
  wait(300);

  return steps;
}

// ── Проверки результата ──────────────────────────────────────────────────────

let failures = 0;

function check(name, fn) {
  try {
    fn();
    process.stdout.write(`✓ ${name}\n`);
  } catch (error) {
    failures += 1;
    process.stdout.write(`✗ ${name}\n    ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

function assertOk(condition, message) {
  if (!condition) throw new Error(message);
}

/**
 * left/top(+6)/width поля списка/поповера относительно триггера, ±2px.
 * Мерим `wrapper` — обёртку `[data-radix-popper-content-wrapper]`, реально
 * позиционируемую Floating UI, — а не `layer`: тот для поповера сортировки
 * указывает на первый ПУНКТ списка (`layerSel` там — `[role="menuitemradio"]`,
 * своей роли у самого контейнера нет), а у пункта есть свой отступ от края
 * контейнера (`p-1.5` слоя) — сравнение съезжало на те же ~6px, что и отступ,
 * и путало паддинг с настоящим смещением позиционирования.
 */
function assertUnderTrigger(m, label, { edge = 'left' } = {}) {
  assertOk(m && m.trigger && m.wrapper, `${label}: измерение не собралось (${JSON.stringify(m)})`);
  const dTop = m.wrapper.top - (m.trigger.bottom + 6);
  assertOk(Math.abs(dTop) <= 2, `${label}: top списка/поповера отличается от низа поля+6 на ${dTop.toFixed(1)}px`);
  if (edge === 'left') {
    const dLeft = m.wrapper.left - m.trigger.left;
    assertOk(Math.abs(dLeft) <= 2, `${label}: left отличается от поля на ${dLeft.toFixed(1)}px`);
    const dWidth = m.wrapper.width - m.trigger.width;
    assertOk(Math.abs(dWidth) <= 2, `${label}: ширина отличается от поля на ${dWidth.toFixed(1)}px`);
  } else {
    // align="end" (поповер сортировки) — совпадают правые края, а не левые.
    const dRight = m.wrapper.right - m.trigger.right;
    assertOk(Math.abs(dRight) <= 2, `${label}: right отличается от поля на ${dRight.toFixed(1)}px`);
  }
}

/** Структурная проверка containing block — см. inject.mjs::measure и lib/helpers.mjs::checkContainingBlock. */
function assertContainingBlockClean(m, label) {
  assertOk(m && m.wrapper, `${label}: обёртка [data-radix-popper-content-wrapper] не найдена`);
  assertOk(m.parentIsBody === true, `${label}: обёртка портализована в <${m.parentTag}>, а не в document.body`);
  assertOk(
    m.offending === null,
    `${label}: между обёрткой и <html> есть <${m.offending?.tag} class="${m.offending?.cls}"> с ${(m.offending?.reasons ?? []).join(', ')} — containing block для position:fixed`,
  );
}

function runChecks(results) {
  check('движок — настоящий WebKit, не Chrome', () => {
    const ua = results.userAgent ?? '';
    assertOk(/AppleWebKit/.test(ua) && !/Chrome|Chromium|HeadlessChrome/.test(ua), `неожиданный User-Agent: "${ua}"`);
  });

  check('«Переместить в папку»: список стоит под полем (±2px)', () => {
    assertUnderTrigger(results.moveList, 'список папок');
  });
  check('«Переместить в папку»: containing block чист', () => {
    assertContainingBlockClean(results.moveList, 'список папок');
  });
  check('«Переместить в папку»: высота диалога не прыгает при открытии списка', () => {
    const before = results.dialogRectBefore;
    const after = results.moveList?.dialog;
    assertOk(before && after, 'геометрия диалога не собралась');
    const delta = after.height - before.height;
    assertOk(Math.abs(delta) <= 1, `высота диалога изменилась на ${delta.toFixed(1)}px при открытии списка`);
  });
  check('«Переместить в папку»: синтетический wheel не defaultPrevented', () => {
    const w = results.moveWheel;
    assertOk(w && !w.error, `wheel: ${w?.error ?? 'нет данных'}`);
    assertOk(w.defaultPrevented === false, 'synthetic WheelEvent на пункте списка оказался defaultPrevented');
  });
  check('«Переместить в папку»: Esc закрывает список, второй Esc — диалог', () => {
    const first = results.layersAfterFirstEsc;
    const second = results.layersAfterSecondEsc;
    assertOk(first && first.listbox === false && first.dialog === true, `после первого Esc: ${JSON.stringify(first)}`);
    assertOk(second && second.listbox === false && second.dialog === false, `после второго Esc: ${JSON.stringify(second)}`);
  });

  check('панель деталей: селект папки стоит под полем (±2px)', () => {
    assertUnderTrigger(results.detailSelect, 'селект в панели деталей');
  });
  check('панель деталей: containing block чист', () => {
    assertContainingBlockClean(results.detailSelect, 'селект в панели деталей');
  });

  check('поповер сортировки стоит под кнопкой (±2px, align="end")', () => {
    assertUnderTrigger(results.sortPopover, 'поповер сортировки', { edge: 'right' });
  });
  check('поповер сортировки: containing block чист', () => {
    assertContainingBlockClean(results.sortPopover, 'поповер сортировки');
  });
}

// ── main ──────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = { keep: false, out: null, serverPort: null, webPort: null, sandboxDir: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--keep') opts.keep = true;
    else if (arg === '--out') opts.out = argv[(i += 1)];
    else if (arg === '--server-port') opts.serverPort = Number(argv[(i += 1)]);
    else if (arg === '--web-port') opts.webPort = Number(argv[(i += 1)]);
    else if (arg === '--sandbox-dir') opts.sandboxDir = argv[(i += 1)];
  }
  return opts;
}

async function main() {
  const startedAt = Date.now();
  const opts = parseArgs(process.argv.slice(2));

  const serverPort = opts.serverPort ?? Number(process.env.KOPIRKA_UI_TEST_SERVER_PORT ?? 43121);
  const webPort = opts.webPort ?? Number(process.env.KOPIRKA_UI_TEST_WEB_PORT ?? 5177);
  const outDir = path.resolve(opts.out ?? path.join(HERE, '.out'));
  const sandboxDir = opts.sandboxDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'kopirka-ui-webkit-'));

  for (const port of [serverPort, webPort]) {
    if (FORBIDDEN_PORTS.has(port)) {
      process.stderr.write(`✗ порт ${port} в списке запрещённых — прерываю запуск.\n`);
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
  // Как и в Chrome-прогоне: Vite без явного server.host слушает [::1], не 127.0.0.1.
  const webBaseUrl = `http://localhost:${webPort}`;

  process.stdout.write(`Песочница: ${sandboxDir}\nСервер: ${baseUrl}\nVite: ${webBaseUrl}\nСкриншоты: ${outDir}\n\n`);

  let serverProc = null;
  let viteProc = null;
  let cleanedUp = false;
  const cleanup = async () => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (!opts.keep) {
      await stopAll([serverProc, viteProc]);
      fs.rmSync(sandboxDir, { recursive: true, force: true });
    } else {
      process.stdout.write(
        `\n--keep: песочница и процессы оставлены.\n  сервер PID ${serverProc?.child.pid ?? '—'} · vite PID ${viteProc?.child.pid ?? '—'}\n  папка: ${sandboxDir}\n`,
      );
    }
  };

  try {
    serverProc = spawnServer({ appDir: APP_DIR, configDir, libraryPath, port: serverPort });
    if (!(await waitServerHealth(baseUrl, { timeoutMs: 20000 }))) {
      process.stderr.write(`✗ сервер не поднялся на ${baseUrl}\n--- вывод сервера ---\n${serverProc.log}\n`);
      await cleanup();
      process.exit(1);
    }

    viteProc = spawnVite({ appDir: APP_DIR, apiTarget: baseUrl, webPort });
    if (!(await waitViteReady(webBaseUrl, { timeoutMs: 20000 }))) {
      process.stderr.write(`✗ Vite не поднялся на ${webBaseUrl}\n--- вывод Vite ---\n${viteProc.log}\n`);
      await cleanup();
      process.exit(1);
    }

    const api = makeApiClient(baseUrl);
    process.stdout.write('Засеваю библиотеку…\n');
    const seed = await seedLibrary({ appDir: APP_DIR, api, baseUrl });
    process.stdout.write(`  папок: ${seed.totalFolders}, файлов: ${seed.totalFiles}\n\n`);

    const spec = buildSpec({ webBaseUrl, outDir });
    const specPath = path.join(sandboxDir, 'spec.json');
    const outJsonPath = path.join(sandboxDir, 'out.json');
    fs.writeFileSync(specPath, JSON.stringify(spec, null, 2));

    process.stdout.write(`Запускаю WKWebView (swift ${path.basename(SWIFT_PROBE)})…\n`);
    let swiftLog = '';
    try {
      swiftLog = execFileSync('/usr/bin/swift', [SWIFT_PROBE, specPath, outJsonPath], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 120000,
      });
    } catch (error) {
      // wkprobe.swift сам выходит с кодом 1, если хоть один шаг записал ошибку —
      // это не значит, что прогон непригоден для разбора: out.json всё равно пишется.
      swiftLog = error.stdout ?? '';
      process.stdout.write(`  (swift завершился ненулевым кодом — разбираю out.json, это ожидаемо при ошибках шагов)\n`);
      if (error.stderr) process.stderr.write(String(error.stderr).slice(0, 2000));
    }

    if (!fs.existsSync(outJsonPath)) {
      throw new Error(`wkprobe.swift не записал ${outJsonPath}. Вывод:\n${swiftLog}`);
    }
    const raw = JSON.parse(fs.readFileSync(outJsonPath, 'utf8'));
    if (Array.isArray(raw.__errors) && raw.__errors.length > 0) {
      process.stdout.write(`  шаги wkprobe.swift сообщили об ошибках:\n${raw.__errors.map((e) => `    - ${e}`).join('\n')}\n`);
    }

    runChecks(raw.results ?? {});

    const elapsedMs = Date.now() - startedAt;
    process.stdout.write(
      `\n${failures === 0 ? 'Все проверки прошли' : `Провалено проверок: ${failures}`} — ${(elapsedMs / 1000).toFixed(1)}s\n`,
    );
    await cleanup();
    process.exit(failures > 0 ? 1 : 0);
  } catch (error) {
    process.stderr.write(`✗ прогон упал: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    await cleanup();
    process.exit(1);
  }
}

void main();
