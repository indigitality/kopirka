#!/usr/bin/env node
/**
 * Сборка «Копирки» под Windows x64 — NSIS-установщик.
 *
 * В отличие от Intel-сборки (scripts/build-intel.mjs) здесь нечего подменять:
 * хост и цель — одна и та же платформа. Бинарник Node в payload берётся тот,
 * которым запущен npm; prebuild better-sqlite3 под win32-x64 лежит в самом пакете;
 * @img/sharp-win32-x64 ставит обычный `npm ci`. Поэтому кросс-конвейера нет —
 * есть проверка, что мы действительно на Windows, и вызов tauri build.
 *
 * Штатное место запуска — .github/workflows/build-windows.yml на windows-latest:
 *
 *   npm run app:build:windows
 *
 * На macOS скрипт отказывается работать: Windows-бандл там не собрать (нет
 * makensis, нет MSVC, нельзя проверить ни один нативный модуль), и делать вид,
 * что собрал, — хуже, чем честно остановиться.
 *
 * Порядок:
 *   1. проверить платформу, архитектуру и мажорную версию Node;
 *   2. поставить devDependencies оболочки (@tauri-apps/cli);
 *   3. `tauri build --target x86_64-pc-windows-msvc` — web, server и payload
 *      соберёт beforeBuildCommand из tauri.conf.json;
 *   4. переименовать установщик в ASCII-имя: кириллица в имени файла переживает
 *      не всякую пересылку и не всякий распаковщик zip'а. Внутри установщика
 *      «Копирка» остаётся кириллицей — имя в «Пуске», путь установки и запись
 *      в «Установке и удалении программ» не меняются.
 *
 * Флаг `--skip-install` — не ставить devDependencies оболочки (в CI это отдельный шаг).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.resolve(HERE, '..');
const APP = path.resolve(DESKTOP, '..');

/** Цель Rust. Раздаём только x64: ARM64-Windows среди участников клуба не заявлен. */
const RUST_TARGET = 'x86_64-pc-windows-msvc';

/** Цель payload'а в терминах bundle-server.mjs. */
const PAYLOAD_TARGET = 'win32-x64';

/** Та же мажорная версия, что требует bundle-server.mjs — под неё собраны нативные модули. */
const NODE_MAJOR = 22;

/** Человеческое имя установщика: ASCII, чтобы дойти до участника без искажений. */
const INSTALLER_ASCII_PREFIX = 'Kopirka';

function log(message) {
  process.stdout.write(`${message}\n`);
}

function bytes(n) {
  return `${(n / 1024 / 1024).toFixed(1)} МБ`;
}

/** Прогон команды с выводом в консоль. Ненулевой код — остановка сборки. */
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} — код выхода ${result.status}`);
  }
}

/**
 * Ни npm, ни tauri не зовём шимами из node_modules/.bin: на Windows это `.cmd`,
 * а Node с 18.20.2 отказывается запускать `.cmd` через spawn без shell —
 * `spawnSync npm.cmd EINVAL` (CVE-2024-27980). Так уже сделано в tests/ui и в
 * дымовом прогоне сервера: зовём сам Node и передаём ему js-файл команды.
 *
 * npm_execpath задаёт npm, когда скрипт запущен через `npm run` (в CI — всегда).
 * Запасной путь — npm-cli.js рядом с бинарником Node: так лежит npm и в дистрибутиве
 * с nodejs.org, и в образе раннера.
 */
function npmCli() {
  const fromEnv = process.env.npm_execpath;
  if (fromEnv !== undefined && fromEnv !== '' && fromEnv.endsWith('.js')) return fromEnv;
  const beside = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (fs.existsSync(beside)) return beside;
  throw new Error(
    'не нашёл npm-cli.js — ни в npm_execpath, ни рядом с Node. ' +
      'Запускайте сборку через `npm run app:build:windows`',
  );
}

/** Точка входа CLI Tauri: bin «tauri» в @tauri-apps/cli указывает на tauri.js. */
function tauriCli() {
  const cli = path.join(DESKTOP, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
  if (!fs.existsSync(cli)) {
    throw new Error(
      `нет ${path.relative(APP, cli)} — devDependencies оболочки не установлены. ` +
        'В CI это отдельный шаг «Зависимости оболочки», локально — прогон без --skip-install',
    );
  }
  return cli;
}

function assertHost() {
  if (process.platform !== 'win32') {
    throw new Error(
      `эта машина — ${process.platform}, а Windows-бандл собирается только на Windows. ` +
        'Штатный путь: ветка в indigitality/kopirka → Actions → «Сборка Windows» ' +
        '(.github/workflows/build-windows.yml). На macOS собирайте npm run app:build',
    );
  }
  if (process.arch !== 'x64') {
    throw new Error(
      `архитектура хоста ${process.arch}, а собираем под x64. Бинарник Node в payload берётся ` +
        'хостовый, и на ARM-Windows он приедет не той дуги. Нужен x64-раннер (windows-latest)',
    );
  }
  const major = Number.parseInt(process.versions.node.split('.')[0], 10);
  if (major !== NODE_MAJOR) {
    throw new Error(
      `запущен Node ${process.versions.node}, а в payload нужен ${NODE_MAJOR}.x. ` +
        'В CI это делает actions/setup-node с node-version: 22',
    );
  }
  log(`Windows-сборка «Копирки»: rust ${RUST_TARGET}, payload ${PAYLOAD_TARGET}, node ${process.versions.node}`);
}

/** Каталог бандла Tauri для нашей цели (target-dir переопределён в src-tauri/.cargo/config.toml). */
function bundleDir() {
  return path.join(DESKTOP, 'src-tauri', 'target.noindex', RUST_TARGET, 'release', 'bundle');
}

/**
 * Payload после сборки: оболочка на Rust ищет ровно `node.exe`, и постороннего
 * бинарника от прошлой цели рядом быть не должно.
 */
function verifyPayload() {
  const backend = path.join(DESKTOP, 'src-tauri', 'resources', 'backend');
  const exe = path.join(backend, 'node.exe');
  if (!fs.existsSync(exe)) {
    throw new Error(`в payload нет ${path.relative(APP, exe)} — оболочка не найдёт, чем поднимать сервер`);
  }
  const stray = path.join(backend, 'node');
  if (fs.existsSync(stray)) {
    throw new Error(`в payload остался ${path.relative(APP, stray)} от сборки под другую платформу`);
  }
  log(`  payload: node.exe на месте (${bytes(fs.statSync(exe).size)})`);
}

/** Версия приложения — из того же конфига, из которого её берёт Tauri. */
function appVersion() {
  const config = JSON.parse(fs.readFileSync(path.join(DESKTOP, 'src-tauri', 'tauri.conf.json'), 'utf8'));
  return config.version;
}

/**
 * Tauri называет установщик по productName, то есть «Копирка_0.2.0_x64-setup.exe».
 * Внутри установщика кириллица уместна, а в имени файла — нет: её ломают и старые
 * распаковщики zip'а (в том числе тот, что отдаёт артефакты GitHub Actions),
 * и пересылка мессенджерами. Переименовываем в ASCII, содержимое не трогаем.
 */
/**
 * Каталог nsis лежит внутри target.noindex, а тот в CI восстанавливается из кэша.
 * Значит от прошлого прогона там остаётся установщик — и уже переименованный,
 * с ASCII-именем, которого Tauri в этот раз не создаст. Дальше renameInstaller
 * видит два .exe и не может понять, какой из них свежий. Чистим каталог до
 * сборки: после неё в нём обязан лежать ровно один файл, и это надёжнее любых
 * догадок по имени или времени изменения.
 */
function clearNsisDir() {
  const nsis = path.join(bundleDir(), 'nsis');
  if (!fs.existsSync(nsis)) return;
  const stale = fs.readdirSync(nsis).filter((name) => name.toLowerCase().endsWith('.exe'));
  for (const name of stale) fs.rmSync(path.join(nsis, name), { force: true });
  if (stale.length > 0) log(`Из ${path.relative(APP, nsis)} убраны установщики прошлого прогона: ${stale.join(', ')}`);
}

function renameInstaller() {
  const nsis = path.join(bundleDir(), 'nsis');
  if (!fs.existsSync(nsis)) throw new Error(`нет каталога ${path.relative(APP, nsis)} — установщик не собрался`);
  const found = fs.readdirSync(nsis).filter((name) => name.toLowerCase().endsWith('.exe'));
  if (found.length !== 1) {
    throw new Error(`в ${path.relative(APP, nsis)} ожидался один .exe, а лежит ${found.length}: ${found.join(', ')}`);
  }
  const from = path.join(nsis, found[0]);
  const to = path.join(nsis, `${INSTALLER_ASCII_PREFIX}_${appVersion()}_x64-setup.exe`);
  if (from !== to) {
    fs.rmSync(to, { force: true });
    fs.renameSync(from, to);
  }
  log(`  ${path.relative(APP, to)} — ${bytes(fs.statSync(to).size)}`);
  return to;
}

function main() {
  assertHost();
  if (!process.argv.includes('--skip-install')) {
    run(process.execPath, [npmCli(), 'install', '--no-audit', '--no-fund', '--silent'], { cwd: DESKTOP });
  }
  clearNsisDir();
  // Минуя npm-скрипт `build` в desktop/package.json: он тоже ушёл бы в шим tauri.cmd.
  run(process.execPath, [tauriCli(), 'build', '--target', RUST_TARGET], { cwd: DESKTOP });
  log('Готово:');
  verifyPayload();
  renameInstaller();
}

try {
  main();
} catch (error) {
  process.stderr.write(`\nWindows-сборка не состоялась: ${error.message}\n`);
  process.exit(1);
}
