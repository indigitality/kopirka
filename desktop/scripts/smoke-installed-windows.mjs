#!/usr/bin/env node
/**
 * Дымовой прогон УСТАНОВЛЕННОЙ «Копирки» под Windows: поставить собранный NSIS-установщик
 * молча, посмотреть, что легло на диск, запустить приложение и погонять его сервер по HTTP.
 *
 * Зачем это нужно. У владельца проекта только Mac, участника с Windows под рукой нет,
 * а `cargo test` и `npm run smoke --workspace=server` проверяют дерево сборки, а не бандл:
 * они не видят ни установщика, ни payload'а в том виде, в каком он приедет человеку.
 * Между «собралось» и «работает у человека» остаётся ровно то, что проверяет этот скрипт:
 *   — установщик отрабатывает без диалогов и кладёт файлы туда, куда обещал;
 *   — в каталоге установки есть оболочка, node.exe и точка входа сервера;
 *   — ярлык в «Пуске» на месте (без него в Windows нет AUMID, а значит нет тостов);
 *   — оболочка поднимает сервер, и он отвечает на /api/health по порту из своего конфига;
 *   — sharp и better-sqlite3 из payload'а работают именно в установленном виде:
 *     импорт настоящей картинки и выдача превью идут через живой HTTP.
 *
 * Штатное место запуска — .github/workflows/build-windows.yml, шаг после выгрузки
 * установщика артефактом: провал проверки не должен лишать нас файла для ручной установки.
 *
 * Что скрипт НЕ проверяет и почему:
 *   — тост-уведомления: WinRT-тост принадлежит AUMID и показывается живому сеансу;
 *     на раннере это нечем увидеть, поэтому даже не пробуем — только проверяем ярлык,
 *     от которого AUMID зависит;
 *   — отрисовку окна: снимок экрана снимаем и выкладываем, но провалом не считаем.
 *     Раннеры GitHub с 2023 года держат сеанс в интерактивном режиме (actions/runner-images#7227),
 *     то есть картинка обычно есть, но чёрный кадр на CI ничего не доказывает про живую машину;
 *   — удаление: uninstall.exe только проверяем на наличие, не запускаем.
 *
 * Раскладка, которую ждём (NSIS, installMode: currentUser — desktop/src-tauri/tauri.windows.conf.json).
 * Шаблон установщика Tauri: crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi.
 *   %LOCALAPPDATA%\Копирка\                        — $INSTDIR ($LOCALAPPDATA\${PRODUCTNAME})
 *   %LOCALAPPDATA%\Копирка\kopirka-desktop.exe     — оболочка (${MAINBINARYNAME}.exe)
 *   %LOCALAPPDATA%\Копирка\backend\node.exe        — payload сервера
 *   %LOCALAPPDATA%\Копирка\uninstall.exe           — деинсталлятор
 *   %APPDATA%\Microsoft\Windows\Start Menu\Programs\Копирка.lnk — ярлык с AppUserModelID
 *   %APPDATA%\Kopirka\config.json                  — конфиг сервера, оттуда берём порт
 *
 * Ключи установщика: `/S` — тихая установка (штатный ключ NSIS), `/D=` — свой каталог,
 * `/NS` — не класть ярлыки, `/R` — запустить приложение после установки. Мы ставим только
 * `/S`: каталог нужен ровно тот, что по умолчанию, ярлыки нужны, а запускать приложение
 * будем сами — так у нас есть его pid, и в конце его есть чем погасить.
 *
 * Запуск: node desktop/scripts/smoke-installed-windows.mjs
 * Переменные:
 *   KOPIRKA_SMOKE_TIMEOUT_MS — сколько ждать ответа сервера после запуска (по умолчанию 120000).
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.resolve(HERE, '..');
const APP = path.resolve(DESKTOP, '..');

/** Куда складываем всё, что потом уезжает артефактом: дерево установки, снимок, журналы. */
const OUT = path.join(APP, 'installed-smoke');

/** Та же цель, что у desktop/scripts/build-windows.mjs — оттуда берём бандл. */
const RUST_TARGET = 'x86_64-pc-windows-msvc';

/**
 * Порт по умолчанию. Дубль `DEFAULT_PORT` из shared/api.ts: тащить TypeScript в скрипт,
 * который может запуститься до сборки сервера, дороже, чем держать здесь одно число.
 * Настоящий порт всё равно читаем из config.json — это только запасной вариант.
 */
const DEFAULT_PORT = 43117;

/**
 * Картинки для импорта — настоящие файлы из репозитория, а не сгенерённый шум.
 * Вторая нужна отдельная: тот же файл повторно ушёл бы в дубли, и проверка имени
 * с кириллицей ничего бы не проверила.
 */
const SAMPLE_IMAGE = path.join(DESKTOP, 'src-tauri', 'icons', 'source-1024.png');
const SAMPLE_IMAGE_2 = path.join(DESKTOP, 'src-tauri', 'icons', 'icon.png');

/** Ключ «Установки и удаления программ», который пишет установщик Tauri (UNINSTKEY в installer.nsi). */
const UNINSTALL_KEY_PREFIX = 'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\';

// ─────────────────────────────────────────────────────────────────────────────
// Ведение протокола
// ─────────────────────────────────────────────────────────────────────────────

const checks = [];

function log(message = '') {
  process.stdout.write(`${message}\n`);
}

function section(title) {
  log(`\n── ${title} ${'─'.repeat(Math.max(0, 72 - title.length))}`);
}

/**
 * Проверка. `required: true` — провал красит прогон; `false` — только строка в протоколе.
 * Деление не косметическое: отсутствие окна на раннере ничего не говорит о живой машине,
 * а неответивший health говорит всё.
 */
async function check(name, run, { required = true } = {}) {
  try {
    const note = await run();
    checks.push({ name, ok: true, required, note });
    log(`✓ ${name}${note ? ` — ${note}` : ''}`);
    return true;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    checks.push({ name, ok: false, required, note: reason });
    log(`${required ? '✗' : '!'} ${name} — ${reason}`);
    return false;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/**
 * Заключительная фаза со страховкой: её осечка попадает в лог справочной строкой,
 * но не отменяет следующие. Красить прогон такие осечки не должны — обязательные
 * проверки к этому моменту уже отработали.
 */
async function attempt(label, run) {
  try {
    await run();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    checks.push({ name: label, ok: false, required: false, note: reason });
    log(`! ${label} — не удалось: ${reason}`);
  }
}

function mb(n) {
  return `${(n / 1024 / 1024).toFixed(1)} МБ`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Чистые функции: их проверяет отдельный прогон на macOS, без установки
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Порт сервера из его же config.json. Оболочка читает это поле точно так же
 * (desktop/src-tauri/src/backend.rs, `configured_port`), поэтому угадывать порт нельзя:
 * человек мог сменить его в настройках, и тогда health надо спрашивать по новому адресу.
 * Битый или пустой конфиг — не ошибка скрипта: возвращаем null, наверху будет запасной порт.
 */
export function parseServerPort(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const raw = parsed?.serverPort;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw <= 0 || raw > 65535) return null;
  return raw;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Ожидание с крайним сроком. `probe` возвращает готовое значение или null/undefined,
 * если ещё рано. Истёк срок — внятное исключение, а не молчаливое зависание job'а:
 * двадцать минут раннера дороже, чем строчка «сервер не ответил за 120 с».
 */
export async function waitFor({ what, probe, timeoutMs, intervalMs = 500, onGiveUp }) {
  const deadline = Date.now() + timeoutMs;
  let attempts = 0;
  for (;;) {
    attempts += 1;
    const value = await probe();
    if (value !== null && value !== undefined && value !== false) return value;
    if (Date.now() >= deadline) {
      const extra = onGiveUp ? ` ${await onGiveUp()}` : '';
      const seconds = (timeoutMs / 1000).toFixed(timeoutMs < 10_000 ? 1 : 0);
      throw new Error(`${what}: не дождались за ${seconds} с (${attempts} попыток).${extra}`);
    }
    await sleep(intervalMs);
  }
}

/** Один опрос /api/health. Ответ разбираем полностью: 200 недостаточно, нужен ok: true. */
export async function probeHealth(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const body = await response.json();
    return body?.ok === true ? body : null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Вспомогательное: процессы, реестр, PowerShell
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PowerShell — единственный вменяемый способ снять скриншот, посмотреть окна и добить
 * процессы по пути. Все входные данные передаём переменными окружения, а не аргументами:
 * в путях кириллица («%LOCALAPPDATA%\Копирка»), и через кавычки командной строки она
 * доезжает не всегда. Сам скрипт кладём во временный каталог одним файлом с режимом
 * первым аргументом — так на диске не появляется четырёх почти одинаковых .ps1.
 */
const POWERSHELL_SCRIPT = `param([string]$Mode)
# Служебный скрипт дымового прогона «Копирки». Пишет в UTF-8: в логе Actions иначе
# кириллица превращается в мусор.
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

function Show-Registry {
  # Запись в «Установке и удалении программ» — её пишет установщик Tauri.
  $key = 'HKCU:\\' + $env:KOPIRKA_UNINSTKEY
  $entry = Get-ItemProperty -Path $key -ErrorAction SilentlyContinue
  if ($null -eq $entry) {
    Write-Output "реестр: ключа $key нет — установщик не оставил записи об установке"
  } else {
    foreach ($name in @('DisplayName','DisplayVersion','Publisher','InstallLocation','MainBinaryName','UninstallString')) {
      Write-Output ("реестр: " + $name + " = " + $entry.$name)
    }
  }
  # WebView2 Evergreen: ровно те ключи, по которым установщик Tauri решает,
  # ставить ли бутстраппер (installer.nsi, WEBVIEW2APPGUID).
  $guid = '{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
  $paths = @(
    'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\' + $guid,
    'HKLM:\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\' + $guid,
    'HKCU:\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\' + $guid,
    'HKCU:\\Software\\Microsoft\\EdgeWebView\\BLBeacon'
  )
  $seen = $false
  foreach ($p in $paths) {
    $item = Get-ItemProperty -Path $p -ErrorAction SilentlyContinue
    if ($null -ne $item) {
      $version = if ($item.pv) { $item.pv } else { $item.version }
      Write-Output ("webview2: " + $p + " → " + $version)
      $seen = $true
    }
  }
  if (-not $seen) { Write-Output 'webview2: рантайм в реестре не найден — окно, скорее всего, не отрисуется' }
}

function Show-Windows {
  # Есть ли у процессов вообще окна. На раннере это единственное дешёвое свидетельство
  # того, что оболочка дошла до создания окна, — снимок экрана может быть и чёрным.
  $windows = @(Get-Process | Where-Object { $_.MainWindowHandle -ne 0 })
  if ($windows.Count -eq 0) {
    Write-Output 'окно: ни одного окна в сеансе нет'
  } else {
    foreach ($w in $windows) {
      Write-Output ("окно: pid=" + $w.Id + " процесс=" + $w.ProcessName + " заголовок=«" + $w.MainWindowTitle + "»")
    }
  }
  $id = [int]$env:KOPIRKA_APP_PID
  $app = Get-Process -Id $id -ErrorAction SilentlyContinue
  if ($null -eq $app) {
    Write-Output ("приложение: процесс " + $id + " уже не жив")
  } else {
    Write-Output ("приложение: pid=" + $id + " окно=" + $app.MainWindowHandle + " заголовок=«" + $app.MainWindowTitle + "» отвечает=" + $app.Responding)
  }
}

function Save-Screenshot {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
  if ($bounds.Width -le 0 -or $bounds.Height -le 0) {
    throw 'виртуальный экран нулевого размера — интерактивного сеанса рабочего стола нет'
  }
  Write-Output ("экран: " + $bounds.Width + "x" + $bounds.Height + " от (" + $bounds.X + "," + $bounds.Y + ")")
  $bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.CopyFromScreen($bounds.X, $bounds.Y, 0, 0, $bitmap.Size)
  $bitmap.Save($env:KOPIRKA_SHOT_PATH, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
  Write-Output ("снимок: " + $env:KOPIRKA_SHOT_PATH)
}

function Stop-Strays {
  # Добиваем всё, что запущено из каталога установки. Именно по пути, а не по имени:
  # node.exe на раннере — это ещё и сам runner с его actions, их трогать нельзя.
  $dir = $env:KOPIRKA_INSTDIR
  $found = @(Get-Process | Where-Object {
    try { $_.Path -and $_.Path.StartsWith($dir, [StringComparison]::OrdinalIgnoreCase) } catch { $false }
  })
  if ($found.Count -eq 0) {
    Write-Output 'остатков: ни одного процесса из каталога установки не осталось'
    return
  }
  foreach ($p in $found) {
    Write-Output ("остаток: pid=" + $p.Id + " " + $p.Path + " — гасим")
    Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
  }
}

switch ($Mode) {
  'registry'   { Show-Registry }
  'windows'    { Show-Windows }
  'screenshot' { Save-Screenshot }
  'stop'       { Stop-Strays }
  default      { throw ('неизвестный режим: ' + $Mode) }
}
`;

let powershellScriptPath = null;

function powershell(mode, env = {}, { timeoutMs = 60_000 } = {}) {
  if (powershellScriptPath === null) {
    powershellScriptPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kopirka-smoke-')), 'smoke.ps1');
    fs.writeFileSync(powershellScriptPath, POWERSHELL_SCRIPT, 'utf8');
  }
  const result = spawnSync(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', powershellScriptPath, mode],
    { encoding: 'utf8', timeout: timeoutMs, env: { ...process.env, ...env } },
  );
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  return { status: result.status, out };
}

/** Вывод PowerShell в лог с отбивкой — чтобы в длинном логе было видно, чей это текст. */
function logPowershell(mode, env, options) {
  const { status, out } = powershell(mode, env, options);
  for (const line of out.split(/\r?\n/)) if (line.trim() !== '') log(`  ${line.trim()}`);
  return status;
}

// ─────────────────────────────────────────────────────────────────────────────
// Пути и файлы
// ─────────────────────────────────────────────────────────────────────────────

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** productName и версия — из того же конфига, из которого их берёт Tauri. */
function tauriConfig() {
  const base = readJson(path.join(DESKTOP, 'src-tauri', 'tauri.conf.json'));
  const windows = readJson(path.join(DESKTOP, 'src-tauri', 'tauri.windows.conf.json'));
  return {
    productName: base.productName,
    version: base.version,
    installMode: windows.bundle?.windows?.nsis?.installMode ?? 'currentUser',
  };
}

/** Единственный .exe в каталоге бандла NSIS. Имя ему уже сменил build-windows.mjs. */
function findInstaller() {
  const nsis = path.join(DESKTOP, 'src-tauri', 'target.noindex', RUST_TARGET, 'release', 'bundle', 'nsis');
  assert(fs.existsSync(nsis), `нет каталога ${path.relative(APP, nsis)} — установщик не собран`);
  const found = fs.readdirSync(nsis).filter((name) => name.toLowerCase().endsWith('.exe'));
  assert(found.length === 1, `в ${path.relative(APP, nsis)} ожидался один .exe, а лежит ${found.length}: ${found.join(', ')}`);
  return path.join(nsis, found[0]);
}

/** Рекурсивный обход каталога установки: и полное дерево в файл, и сводка в лог. */
export function walk(dir, base = dir, rows = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full);
    if (entry.isDirectory()) {
      rows.push({ rel, dir: true, size: 0 });
      walk(full, base, rows);
    } else {
      let size = 0;
      try {
        size = fs.statSync(full).size;
      } catch {
        size = -1;
      }
      rows.push({ rel, dir: false, size });
    }
  }
  return rows;
}

/**
 * Дерево установки в лог. Целиком его печатать нельзя — в payload'е несколько тысяч
 * файлов node_modules, — поэтому в лог идёт верхний уровень с итогами по каталогам
 * и полный список нативных модулей, а всё дерево уезжает файлом в артефакт.
 */
export function describeTree(instdir) {
  const rows = walk(instdir);
  fs.writeFileSync(
    path.join(OUT, 'installed-tree.txt'),
    [
      `# ${instdir}`,
      `# файлов: ${rows.filter((r) => !r.dir).length}, каталогов: ${rows.filter((r) => r.dir).length}`,
      '',
      ...rows.map((r) => (r.dir ? `${r.rel}${path.sep}` : `${r.rel}\t${r.size}`)),
    ].join('\n'),
    'utf8',
  );

  const top = fs.readdirSync(instdir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of top) {
    if (entry.isDirectory()) {
      const inside = rows.filter((r) => !r.dir && r.rel.startsWith(`${entry.name}${path.sep}`));
      const size = inside.reduce((sum, r) => sum + Math.max(0, r.size), 0);
      log(`  ${entry.name}${path.sep} — ${inside.length} файлов, ${mb(size)}`);
    } else {
      log(`  ${entry.name} — ${mb(fs.statSync(path.join(instdir, entry.name)).size)}`);
    }
  }

  const native = rows.filter((r) => !r.dir && /\.(node|dll)$/i.test(r.rel));
  log(`  нативные модули (${native.length}):`);
  for (const row of native) log(`    ${row.rel} — ${mb(row.size)}`);

  const total = rows.filter((r) => !r.dir).reduce((sum, r) => sum + Math.max(0, r.size), 0);
  log(`  итого: ${rows.filter((r) => !r.dir).length} файлов, ${mb(total)}`);
  return rows;
}

/** Ярлык в «Пуске» ищем поиском, а не по одному ожидаемому пути: NSIS кладёт его либо
 *  прямо в Programs, либо в подпапку (STARTMENUFOLDER), и оба варианта штатные. */
export function findShortcut(root, name) {
  if (!fs.existsSync(root)) return null;
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name.toLowerCase() === name.toLowerCase()) return full;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Фазы
// ─────────────────────────────────────────────────────────────────────────────

function assertHost() {
  if (process.platform !== 'win32') {
    throw new Error(
      `эта машина — ${process.platform}, а проверять установленную «Копирку» можно только на Windows. ` +
        'Штатный путь: Actions → «Сборка Windows» (.github/workflows/build-windows.yml)',
    );
  }
}

/** Молчаливая установка + осмотр диска. Возвращает описание установки или null. */
async function phaseInstall(config) {
  section('Установка');
  const installer = findInstaller();
  log(`установщик: ${path.basename(installer)} — ${mb(fs.statSync(installer).size)}`);
  log(`режим установки: ${config.installMode} → ожидаем %LOCALAPPDATA%\\${config.productName}`);

  const localAppData = process.env.LOCALAPPDATA;
  const appData = process.env.APPDATA;
  assert(localAppData, 'в окружении нет %LOCALAPPDATA% — некуда ставить');
  assert(appData, 'в окружении нет %APPDATA% — негде искать конфиг и ярлык');
  const instdir = path.join(localAppData, config.productName);

  const installed = await check('тихая установка (ключ /S) отрабатывает без диалогов', () => {
    // NSIS-установщик — GUI-программа, но spawnSync ждёт именно её процесс и получает
    // её код выхода: подсказки вида `start /wait` тут не нужны, это забота cmd.
    const started = Date.now();
    const result = spawnSync(installer, ['/S'], { stdio: 'inherit', timeout: 10 * 60_000 });
    if (result.error) throw result.error;
    assert(result.status === 0, `установщик вышел с кодом ${result.status}`);
    assert(fs.existsSync(instdir), `после установки нет каталога ${instdir}`);
    return `${((Date.now() - started) / 1000).toFixed(1)} с, каталог ${instdir}`;
  });
  if (!installed) return null;

  section('Что легло на диск');
  log(`каталог установки: ${instdir}`);
  describeTree(instdir);
  logPowershell('registry', { KOPIRKA_UNINSTKEY: `${UNINSTALL_KEY_PREFIX}${config.productName}` });

  // Имя оболочки задаётся Cargo-манифестом ([[bin]] name), а не productName, поэтому
  // берём его поиском: единственный .exe в корне, кроме деинсталлятора.
  const exes = fs
    .readdirSync(instdir)
    .filter((name) => name.toLowerCase().endsWith('.exe') && name.toLowerCase() !== 'uninstall.exe');
  let mainExe = null;

  await check('в каталоге установки лежит оболочка (.exe)', () => {
    assert(exes.length === 1, `ожидался один .exe кроме uninstall.exe, а лежит ${exes.length}: ${exes.join(', ') || '—'}`);
    mainExe = path.join(instdir, exes[0]);
    return `${exes[0]} — ${mb(fs.statSync(mainExe).size)}`;
  });

  await check('payload сервера на месте: backend\\node.exe и точка входа', () => {
    const node = path.join(instdir, 'backend', 'node.exe');
    const entry = path.join(instdir, 'backend', 'server', 'src', 'index.js');
    assert(fs.existsSync(node), `нет ${node} — оболочке нечем поднимать сервер`);
    assert(fs.existsSync(entry), `нет ${entry} — сервер не собран в payload`);
    const stray = path.join(instdir, 'backend', 'node');
    assert(!fs.existsSync(stray), `рядом лежит ${stray} от сборки под другую платформу`);
    return `node.exe ${mb(fs.statSync(node).size)}`;
  });

  await check('нативные модули payload\'а внутри установки', () => {
    const sqlite = path.join(instdir, 'backend', 'node_modules', 'better-sqlite3', 'prebuilds', 'win32-x64.node');
    const sharpDir = path.join(instdir, 'backend', 'node_modules', '@img');
    assert(fs.existsSync(sqlite), `нет ${sqlite} — библиотека не откроется`);
    assert(fs.existsSync(sharpDir), `нет ${sharpDir} — превью нечем делать`);
    const platform = fs.readdirSync(sharpDir).filter((name) => name.includes('win32'));
    assert(platform.length > 0, `в ${sharpDir} нет пакета под win32 — приехал sharp не той платформы`);
    return `better-sqlite3 prebuild + ${platform.join(', ')}`;
  });

  await check('ярлык в меню «Пуск» (без него в Windows нет AUMID, а значит нет тостов)', () => {
    const programs = path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs');
    const shortcut = findShortcut(programs, `${config.productName}.lnk`);
    assert(shortcut !== null, `в ${programs} нет ${config.productName}.lnk`);
    return shortcut;
  });

  await check(
    'деинсталлятор и ярлык на рабочем столе',
    () => {
      const uninstall = path.join(instdir, 'uninstall.exe');
      assert(fs.existsSync(uninstall), `нет ${uninstall}`);
      const desktop = path.join(os.homedir(), 'Desktop', `${config.productName}.lnk`);
      // Ярлык на рабочем столе тихая установка кладёт всегда (installer.nsi: страницу
      // «Готово» с галочкой в этом режиме пропускают). Его отсутствие — не поломка ядра.
      return `uninstall.exe на месте, ярлык на столе ${fs.existsSync(desktop) ? 'есть' : 'не найден'}`;
    },
    { required: false },
  );

  return { instdir, mainExe, appData };
}

/** Запуск установленного приложения и ожидание его сервера. */
async function phaseLaunch({ instdir, mainExe, appData }) {
  section('Запуск установленного приложения');
  assert(mainExe, 'нечего запускать: оболочка не найдена');

  const configPath = path.join(appData, 'Kopirka', 'config.json');
  // На чистом раннере конфига быть не должно: дымовой прогон сервера выше работает
  // на своём KOPIRKA_CONFIG_DIR во временной папке. Если он всё же есть — не беда,
  // порт из него читают и оболочка, и мы, но знать об этом в логе полезно.
  log(`конфиг сервера ждём в ${configPath} (${fs.existsSync(configPath) ? 'уже существует' : 'ещё нет'})`);

  // Запускаем из каталога установки, окружение — как у человека: ни KOPIRKA_PORT,
  // ни KOPIRKA_CONFIG_DIR, ни KOPIRKA_LIBRARY_PATH не задаём намеренно. Проверять надо
  // именно стандартные пути, включая библиотеку в %USERPROFILE%\Pictures\Копирка —
  // кириллица в пути к библиотеке и есть один из рисков Windows-версии.
  const child = spawn(mainExe, [], { cwd: instdir, stdio: 'ignore', windowsHide: false });
  // unref обязателен: иначе живой дочерний процесс держит цикл событий, и скрипт
  // не завершится, даже дойдя до конца отчёта. Гасим приложение мы всё равно сами.
  child.unref();
  let exited = null;
  child.on('exit', (code, signal) => {
    exited = { code, signal };
  });
  child.on('error', (error) => {
    exited = { code: null, signal: null, error: error.message };
  });
  const appPid = child.pid;
  log(`оболочка запущена, pid=${appPid}`);

  const timeoutMs = Number(process.env.KOPIRKA_SMOKE_TIMEOUT_MS ?? 120_000);
  let port = DEFAULT_PORT;

  // Конфиг появляется, когда сервер уже стартовал (server/src/config.ts, loadConfig).
  // Не дождались — не повод сдаваться: порт по умолчанию тот же, что берёт оболочка.
  await check(
    `порт сервера прочитан из ${path.basename(configPath)}`,
    async () => {
      const text = await waitFor({
        what: 'появление config.json',
        timeoutMs: Math.min(timeoutMs, 90_000),
        probe: () => {
          if (exited !== null) throw new Error(`оболочка завершилась раньше времени: код ${exited.code}${exited.error ? `, ${exited.error}` : ''}`);
          try {
            return fs.readFileSync(configPath, 'utf8');
          } catch {
            return null;
          }
        },
      });
      const parsed = parseServerPort(text);
      assert(parsed !== null, `в ${configPath} нет годного serverPort: ${text.slice(0, 200)}`);
      port = parsed;
      return `порт ${port}`;
    },
    { required: false },
  );

  const healthy = await check(`сервер ответил на GET /api/health (порт ${port})`, async () => {
    const body = await waitFor({
      what: 'ответ сервера на /api/health',
      timeoutMs,
      probe: () => {
        if (exited !== null) throw new Error(`оболочка завершилась раньше времени: код ${exited.code}${exited.error ? `, ${exited.error}` : ''}`);
        return probeHealth(port);
      },
      onGiveUp: () => 'Дальше в логе — хвосты kopirka.log и kopirka-shell.log из %APPDATA%\\Kopirka.',
    });
    fs.writeFileSync(path.join(OUT, 'health.json'), `${JSON.stringify(body, null, 2)}\n`, 'utf8');
    return `версия ${body.appVersion}, схема ${body.schemaVersion}, библиотека ${body.libraryPath}`;
  });

  return { appPid, port, healthy };
}

/** Настоящие операции через живой HTTP: импорт картинки и превью. */
async function phaseApi(port) {
  section('Живые операции по HTTP');
  const base = `http://127.0.0.1:${port}`;

  const get = async (pathname, init) => {
    const response = await fetch(`${base}${pathname}`, { signal: AbortSignal.timeout(30_000), ...init });
    return response;
  };
  const json = async (pathname) => {
    const response = await get(pathname);
    const text = await response.text();
    assert(response.ok, `GET ${pathname} → ${response.status}: ${text.slice(0, 200)}`);
    return JSON.parse(text);
  };

  await check(
    'GET /api/settings — библиотека и журнал по стандартным путям',
    async () => {
      const settings = await json('/api/settings');
      return `библиотека ${settings.libraryPath}, журнал ${settings.logPath}, порт ${settings.serverPort}`;
    },
    { required: false },
  );

  const bytes = fs.readFileSync(SAMPLE_IMAGE);
  let fileId = 0;

  const imported = await check('POST /api/import — настоящая картинка ложится в библиотеку', async () => {
    const form = new FormData();
    form.append('sourceType', 'drag_drop');
    form.append('files', new Blob([new Uint8Array(bytes)]), 'kopirka-windows-check.png');
    const response = await get('/api/import', { method: 'POST', body: form });
    const text = await response.text();
    assert(response.ok, `POST /api/import → ${response.status}: ${text.slice(0, 300)}`);
    const result = JSON.parse(text);
    assert(
      result.summary.added === 1,
      `added=${result.summary.added}: ${JSON.stringify(result.items.map((i) => [i.outcome, i.errorCode, i.errorMessage]))}`,
    );
    const file = result.items[0].file;
    fileId = file.id;
    // Размеры читает sharp — значит, нативный модуль из payload'а ожил.
    assert(file.width === 1024 && file.height === 1024, `размеры прочитались как ${file.width}×${file.height}`);
    assert(file.hasPreview && file.previewUrl !== null && !file.isBroken, 'превью не сгенерировалось');
    return `id=${fileId}, ${file.width}×${file.height}, sha256 ${file.sha256.slice(0, 12)}…`;
  });

  if (imported) {
    await check('GET /api/files/:id/preview — sharp из payload\'а отдаёт webp', async () => {
      const response = await get(`/api/files/${fileId}/preview`);
      assert(response.status === 200, `превью отдалось со статусом ${response.status}`);
      assert(response.headers.get('content-type') === 'image/webp', `тип ${response.headers.get('content-type')}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      // Разбирать webp нечем (sharp в скрипт не тащим) — сверяем сигнатуру контейнера.
      assert(
        buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP',
        'в ответе не webp-контейнер',
      );
      return `${buffer.length} байт, RIFF/WEBP`;
    });

    await check('GET /api/files/:id/original — файл читается с диска целиком', async () => {
      const response = await get(`/api/files/${fileId}/original`);
      assert(response.status === 200, `оригинал отдался со статусом ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      assert(buffer.length === bytes.length, `${buffer.length} байт вместо ${bytes.length}`);
      return `${buffer.length} байт`;
    });

    await check(
      'повторный импорт того же файла → duplicate (better-sqlite3 помнит sha256)',
      async () => {
        const form = new FormData();
        form.append('sourceType', 'drag_drop');
        form.append('files', new Blob([new Uint8Array(bytes)]), 'kopirka-windows-check-copy.png');
        const response = await get('/api/import', { method: 'POST', body: form });
        const result = JSON.parse(await response.text());
        assert(result.summary.duplicates === 1, `duplicates=${result.summary.duplicates}`);
        return 'дубль распознан';
      },
      { required: false },
    );

    await check(
      'импорт файла с кириллицей в имени',
      async () => {
        const other = fs.readFileSync(SAMPLE_IMAGE_2);
        const form = new FormData();
        form.append('sourceType', 'drag_drop');
        form.append('files', new Blob([new Uint8Array(other)]), 'проверка-кириллицы.png');
        const response = await get('/api/import', { method: 'POST', body: form });
        const result = JSON.parse(await response.text());
        const item = result.items[0];
        // Иконка — та же картинка, что и первая, только меньше, поэтому штатным ответом
        // будет и 'added', и 'needs_confirmation' (IMP-01, похожий файл). Нас здесь
        // интересует не судьба файла, а имя: доехало ли оно через multipart целым.
        assert(
          ['added', 'added_similar', 'needs_confirmation'].includes(item.outcome),
          `outcome=${item.outcome} (${item.errorCode ?? ''} ${item.errorMessage ?? ''})`,
        );
        assert(item.originalFilename === 'проверка-кириллицы.png', `имя вернулось как «${item.originalFilename}»`);
        return `«${item.originalFilename}», ответ ${item.outcome}`;
      },
      { required: false },
    );

    await check(
      'GET /api/stats — счётчики библиотеки',
      async () => {
        const stats = await json('/api/stats');
        return `библиотека ${stats.library}, не разобрано ${stats.untagged}, корзина ${stats.trash}`;
      },
      { required: false },
    );
  }
}

/** Окно и снимок экрана. Ни одна проверка здесь не красит прогон — см. шапку файла. */
async function phaseScreen(appPid) {
  section('Окно и экран раннера');
  if (appPid === null) {
    log('  приложение не запускалось — смотреть нечего');
    return;
  }
  logPowershell('windows', { KOPIRKA_APP_PID: String(appPid) });
  await check(
    'снимок экрана раннера снят (окно на CI — не показатель)',
    () => {
      const shot = path.join(OUT, 'installed-screen.png');
      const { status, out } = powershell('screenshot', { KOPIRKA_SHOT_PATH: shot });
      for (const line of out.split(/\r?\n/)) if (line.trim() !== '') log(`  ${line.trim()}`);
      assert(status === 0 && fs.existsSync(shot), 'PowerShell не отдал PNG');
      return `${path.relative(APP, shot)} — ${mb(fs.statSync(shot).size)}`;
    },
    { required: false },
  );
}

/**
 * Журналы приложения — главный источник правды, если сервер не поднялся: оболочка на
 * Windows собрана без консоли и пишет диагностику только в файл рядом с конфигом
 * (kopirka-shell.log), сервер — в kopirka.log. Снимаем их после остановки приложения:
 * закрытый файл копируется без сюрпризов, и в хвосте видно, как всё завершалось.
 */
function phaseLogs(appData) {
  section('Журналы приложения');
  const dir = path.join(appData ?? process.env.APPDATA ?? '', 'Kopirka');
  for (const name of ['kopirka.log', 'kopirka-shell.log', 'config.json']) {
    const from = path.join(dir, name);
    if (!fs.existsSync(from)) {
      log(`  ${from} — нет`);
      continue;
    }
    try {
      fs.copyFileSync(from, path.join(OUT, name));
      const lines = fs.readFileSync(from, 'utf8').split(/\r?\n/).filter((line) => line !== '');
      log(`  ${from} — ${lines.length} строк, последние ${Math.min(30, lines.length)}:`);
      for (const line of lines.slice(-30)) log(`    ${line}`);
    } catch (error) {
      log(`  ${from} — не прочитался: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/** Гасим приложение. Висящий процесс не даст job'у завершиться и займёт порт. */
async function phaseShutdown({ appPid, instdir, port }) {
  section('Гасим приложение');
  if (appPid !== null) {
    // /T — вместе с деревом: Node-сервер запущен оболочкой как дочерний процесс.
    // /F обязателен: закрытие окна «Копирка» перехватывает и просто прячет его
    // (main.rs, WindowEvent::CloseRequested), вежливый WM_CLOSE процесс не завершит.
    const result = spawnSync('taskkill', ['/PID', String(appPid), '/T', '/F'], { encoding: 'utf8', timeout: 30_000 });
    const out = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
    log(`  taskkill /PID ${appPid} /T /F → код ${result.status}${out ? `: ${out.split(/\r?\n/)[0]}` : ''}`);
  }
  if (instdir !== null) {
    await sleep(1500);
    logPowershell('stop', { KOPIRKA_INSTDIR: instdir });
  }
  if (port !== null) {
    const alive = await probeHealth(port);
    log(`  порт ${port} после остановки: ${alive === null ? 'свободен' : 'на нём всё ещё кто-то отвечает'}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Итог
// ─────────────────────────────────────────────────────────────────────────────

function report() {
  section('Итог');
  const failedRequired = checks.filter((c) => !c.ok && c.required);
  const failedOptional = checks.filter((c) => !c.ok && !c.required);
  log(`проверок: ${checks.length}, обязательных провалов: ${failedRequired.length}, справочных: ${failedOptional.length}`);
  for (const c of failedRequired) log(`  ✗ ${c.name} — ${c.note}`);
  for (const c of failedOptional) log(`  ! ${c.name} — ${c.note}`);

  // Та же таблица уезжает в сводку прогона: смотреть её удобнее, чем листать лог.
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    // В таблице Markdown ни вертикальной черты, ни переводов строки быть не должно —
    // иначе разъезжается вся сводка прогона.
    const cell = (text) => String(text ?? '').replace(/\|/g, '/').replace(/\r?\n/g, ' ');
    const rows = checks.map((c) => `| ${c.ok ? '✓' : c.required ? '✗' : '!'} | ${cell(c.name)} | ${cell(c.note)} |`);
    fs.appendFileSync(
      summary,
      ['', '### Установленное приложение (Windows)', '', '| | проверка | подробности |', '| --- | --- | --- |', ...rows, ''].join('\n'),
      'utf8',
    );
  }

  if (failedRequired.length > 0) {
    log('\nУстановленная «Копирка» проверку не прошла.');
    process.exitCode = 1;
  } else {
    log('\nУстановленная «Копирка» ставится, запускается и отвечает по HTTP.');
  }
}

async function main() {
  assertHost();
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const config = tauriConfig();
  log(`«${config.productName}» ${config.version} — дымовой прогон установленного приложения`);

  let install = null;
  let launch = null;
  try {
    install = await phaseInstall(config);
    // Оболочки нет — запускать нечего, и провал уже записан обязательной проверкой.
    if (install !== null && install.mainExe !== null) {
      launch = await phaseLaunch(install);
      if (launch.healthy) await phaseApi(launch.port);
    }
  } catch (error) {
    // Неожиданная ошибка — тоже провал обязательной проверки, но снимок, журналы
    // и остановку приложения она отменять не должна.
    const reason = error instanceof Error ? (error.stack ?? error.message) : String(error);
    checks.push({ name: 'прогон дошёл до конца', ok: false, required: true, note: reason.split('\n')[0] });
    log(`✗ прогон оборвался: ${reason}`);
  } finally {
    // Каждая заключительная фаза — со своей страховкой: осечка на снимке или на копии
    // журнала не должна отменить остановку приложения. Висящий процесс не даст
    // завершиться job'у, и следующий прогон найдёт занятый порт.
    await attempt('снимок экрана', () => phaseScreen(launch?.appPid ?? null));
    await attempt('остановка приложения', () =>
      phaseShutdown({
        appPid: launch?.appPid ?? null,
        instdir: install?.instdir ?? null,
        port: launch?.port ?? null,
      }),
    );
    await attempt('журналы приложения', () => phaseLogs(install?.appData ?? null));
  }

  report();
}

// Запуск только при прямом вызове: так разбор конфига, ожидание health и обход дерева
// проверяются импортом из отдельного прогона на любой платформе, без установки.
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`\nПроверка установленного приложения не состоялась: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
