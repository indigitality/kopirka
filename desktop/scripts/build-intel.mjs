#!/usr/bin/env node
/**
 * Сборка «Копирки» под Intel (x86_64) с машины на Apple Silicon.
 *
 * Обычный `npm run app:build` собирает под ту архитектуру, на которой запущен:
 * Rust берёт хостовый target, а `bundle-server.mjs` кладёт в payload тот самый Node,
 * которым его запустили. Для Intel-образа нужно подменить обе половины:
 *
 *   Rust     → --target x86_64-apple-darwin (кросс-компиляция средствами Xcode CLT);
 *   payload  → KOPIRKA_TARGET=darwin-x64, x64-бинарник Node, x64-пакеты sharp.
 *
 * Всё, что для этого нужно, скрипт готовит сам и складывает в desktop/.cache:
 *
 *   .cache/node/v22.14.0-darwin-x64/bin/node          — с nodejs.org, sha256 сверен
 *   .cache/platform-modules/darwin-x64/node_modules/  — @img/sharp-darwin-x64 и libvips
 *
 * Кэш переживает повторные запуски: второй прогон ничего не качает и не ставит.
 * Рабочее дерево (app/node_modules, package-lock.json) скрипт не трогает —
 * x64-пакеты живут отдельно и подсовываются сборщику через KOPIRKA_PLATFORM_MODULES.
 *
 * Запуск: `npm run app:build:intel` из app/ (или `npm run build:intel` из desktop/).
 * Флаг `--prepare-only` — подготовить кэш и не звать tauri build.
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.resolve(HERE, '..');
const APP = path.resolve(DESKTOP, '..');
const CACHE = path.join(DESKTOP, '.cache');

/** Цель Rust и цель payload'а — одно и то же железо, но именуется по-разному. */
const RUST_TARGET = 'x86_64-apple-darwin';
const PAYLOAD_TARGET = 'darwin-x64';

/** Версия Node в бандле. Совпадает с той, на которой собирается arm64-образ. */
const NODE_VERSION = 'v22.14.0';
const NODE_BUILD = 'darwin-x64';
const NODE_DIST = `https://nodejs.org/dist/${NODE_VERSION}`;

function log(message) {
  process.stdout.write(`${message}\n`);
}

function bytes(n) {
  return `${(n / 1024 / 1024).toFixed(1)} МБ`;
}

function dirSize(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += dirSize(full);
    else if (entry.isFile()) total += fs.lstatSync(full).size;
  }
  return total;
}

/** Прогон команды с выводом в консоль. Ненулевой код — остановка сборки. */
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} — код выхода ${result.status}`);
  }
}

/** То же, но вывод возвращается строкой (для проверок, а не для лога). */
function capture(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.error) throw result.error;
  return { status: result.status, stdout: (result.stdout ?? '').trim(), stderr: (result.stderr ?? '').trim() };
}

// ── Rust target ─────────────────────────────────────────────────────────────

function ensureRustTarget() {
  const installed = capture('rustup', ['target', 'list', '--installed']);
  if (installed.status !== 0) {
    throw new Error(
      'не найден rustup. Он обычно не в PATH неинтерактивной сессии — `export PATH="$HOME/.cargo/bin:$PATH"`',
    );
  }
  if (installed.stdout.split('\n').includes(RUST_TARGET)) {
    log(`  rust target ${RUST_TARGET}: уже есть`);
    return;
  }
  log(`  rust target ${RUST_TARGET}: ставлю`);
  run('rustup', ['target', 'add', RUST_TARGET]);
}

// ── Бинарник Node ───────────────────────────────────────────────────────────

/**
 * Архитектура Mach-O по заголовку файла. Возвращает 'x64' | 'arm64' | null.
 * Читаем сами, а не зовём `file`: так проверка не зависит от локали и формата вывода.
 */
function machoArch(file) {
  const header = Buffer.alloc(8);
  const fd = fs.openSync(file, 'r');
  try {
    if (fs.readSync(fd, header, 0, 8, 0) < 8) return null;
  } finally {
    fs.closeSync(fd);
  }
  // MH_MAGIC_64 в little-endian: cf fa ed fe. Универсальные бандлы (0xcafebabe) нам
  // не встречаются — и с nodejs.org, и от Xcode приходят однодуговые файлы.
  if (header.readUInt32LE(0) !== 0xfeedfacf) return null;
  const cpu = header.readUInt32LE(4);
  if (cpu === 0x01000007) return 'x64'; // CPU_TYPE_X86_64
  if (cpu === 0x0100000c) return 'arm64'; // CPU_TYPE_ARM64
  return null;
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/** Строка из SHASUMS256.txt для нужного файла. Формат: «<sha256>  <имя>». */
function expectedSha(sumsText, fileName) {
  for (const line of sumsText.split('\n')) {
    const [sum, name] = line.trim().split(/\s+/);
    if (name === fileName) return sum;
  }
  throw new Error(`в SHASUMS256.txt нет строки про ${fileName}`);
}

async function download(url, target) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} — HTTP ${response.status}`);
  fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
}

/** Бинарник рабочий и тот самый: и по архитектуре, и по версии. */
function verifyNode(binary) {
  const arch = machoArch(binary);
  if (arch !== 'x64') {
    throw new Error(`${binary}: ожидался Mach-O x86_64, а там ${arch ?? 'не Mach-O'}`);
  }
  const probe = capture('arch', ['-x86_64', binary, '--version']);
  if (probe.status !== 0 || probe.stdout !== NODE_VERSION) {
    throw new Error(
      `${binary}: под Rosetta не отвечает ${NODE_VERSION} (код ${probe.status}, вывод «${probe.stdout || probe.stderr}»). ` +
        'Проверьте, что Rosetta 2 установлена: `arch -x86_64 /usr/bin/true`',
    );
  }
}

async function ensureNodeBinary() {
  const dir = path.join(CACHE, 'node', `${NODE_VERSION}-${NODE_BUILD}`);
  const binary = path.join(dir, 'bin', 'node');
  if (fs.existsSync(binary)) {
    verifyNode(binary);
    log(`  node ${NODE_VERSION} ${NODE_BUILD}: из кэша (${bytes(fs.statSync(binary).size)})`);
    return binary;
  }

  const archiveName = `node-${NODE_VERSION}-${NODE_BUILD}.tar.gz`;
  const staging = path.join(CACHE, 'node', '.download');
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });
  const archive = path.join(staging, archiveName);

  log(`  node ${NODE_VERSION} ${NODE_BUILD}: качаю ${NODE_DIST}/${archiveName}`);
  await download(`${NODE_DIST}/${archiveName}`, archive);
  const sums = path.join(staging, 'SHASUMS256.txt');
  await download(`${NODE_DIST}/SHASUMS256.txt`, sums);

  const want = expectedSha(fs.readFileSync(sums, 'utf8'), archiveName);
  const got = sha256(archive);
  if (want !== got) {
    throw new Error(`${archiveName}: sha256 не сошлась.\n  ожидалось ${want}\n  получено  ${got}`);
  }
  log(`  node: sha256 сошлась (${want.slice(0, 16)}…)`);

  // Из архива нужен ровно один файл — сам бинарник, остальные 60 МБ это npm и заголовки.
  run('tar', ['-xzf', archive, '-C', staging, `node-${NODE_VERSION}-${NODE_BUILD}/bin/node`]);
  fs.mkdirSync(path.join(dir, 'bin'), { recursive: true });
  fs.copyFileSync(path.join(staging, `node-${NODE_VERSION}-${NODE_BUILD}`, 'bin', 'node'), binary);
  fs.chmodSync(binary, 0o755);
  fs.rmSync(staging, { recursive: true, force: true });

  verifyNode(binary);
  log(`  node: ${path.relative(APP, binary)} (${bytes(fs.statSync(binary).size)})`);
  return binary;
}

// ── x64-пакеты sharp ────────────────────────────────────────────────────────

/**
 * Версии платформенных пакетов берём из корневого package-lock.json, чтобы x64-половина
 * бандла не разъехалась с arm64-половиной при следующем обновлении sharp.
 */
function platformVersions() {
  const lock = JSON.parse(fs.readFileSync(path.join(APP, 'package-lock.json'), 'utf8'));
  const versions = {};
  for (const name of [`@img/sharp-${PAYLOAD_TARGET}`, `@img/sharp-libvips-${PAYLOAD_TARGET}`]) {
    const entry = lock.packages?.[`node_modules/${name}`];
    if (!entry?.version) throw new Error(`в package-lock.json нет ${name} — обновите lock`);
    versions[name] = entry.version;
  }
  return versions;
}

function installedVersion(modules, name) {
  const manifest = path.join(modules, name, 'package.json');
  if (!fs.existsSync(manifest)) return null;
  return JSON.parse(fs.readFileSync(manifest, 'utf8')).version ?? null;
}

async function ensurePlatformModules() {
  const dir = path.join(CACHE, 'platform-modules', PAYLOAD_TARGET);
  const modules = path.join(dir, 'node_modules');
  const versions = platformVersions();
  const list = Object.entries(versions)
    .map(([name, version]) => `${name}@${version}`)
    .join(', ');

  const fresh = Object.entries(versions).every(([name, version]) => installedVersion(modules, name) === version);
  if (fresh) {
    log(`  sharp ${PAYLOAD_TARGET}: из кэша (${list})`);
    return modules;
  }

  fs.mkdirSync(dir, { recursive: true });
  // Отдельный манифест вместо правки рабочего: npm ставит сюда только то, что перечислено,
  // и ни app/node_modules, ни package-lock.json при этом не меняются.
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    `${JSON.stringify(
      {
        name: `kopirka-platform-modules-${PAYLOAD_TARGET}`,
        private: true,
        version: '0.0.0',
        description: 'Платформенные пакеты sharp под чужую архитектуру — только для сборки бандла',
        optionalDependencies: versions,
      },
      null,
      2,
    )}\n`,
  );

  log(`  sharp ${PAYLOAD_TARGET}: ставлю ${list}`);
  // --os/--cpu переопределяют проверку платформы: без них npm молча пропустил бы
  // пакеты «не для этой машины» — они ведь optional.
  run('npm', ['install', '--os=darwin', '--cpu=x64', '--no-package-lock', '--no-audit', '--no-fund'], { cwd: dir });

  for (const [name, version] of Object.entries(versions)) {
    const got = installedVersion(modules, name);
    if (got !== version) {
      throw new Error(
        `${name}: ожидалась версия ${version}, установлено ${got ?? 'ничего'}. ` +
          'Скорее всего npm пропустил пакет как optional — проверьте поддержку --os/--cpu в вашей версии npm',
      );
    }
  }

  // Нативные файлы должны быть x86_64: иначе на Intel бандл просто не поднимет sharp.
  for (const file of nativeFiles(modules)) {
    const arch = machoArch(file);
    if (arch !== 'x64') {
      throw new Error(`${file}: ожидался Mach-O x86_64, а там ${arch ?? 'не Mach-O'}`);
    }
  }
  log(`  sharp ${PAYLOAD_TARGET}: готово (${bytes(dirSize(modules))})`);
  return modules;
}

/** Все .node и .dylib внутри дерева — то, что реально исполняется на целевой машине. */
function nativeFiles(root) {
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && /\.(node|dylib)$/.test(entry.name)) found.push(full);
    }
  };
  walk(root);
  return found;
}

// ── Сборка ──────────────────────────────────────────────────────────────────

function build(nodeBinary, platformModules) {
  // Тот же порядок, что у app:build: сначала devDependencies оболочки (@tauri-apps/cli),
  // потом сама сборка. beforeBuildCommand из tauri.conf.json сам соберёт web, server и payload.
  run('npm', ['install', '--no-audit', '--no-fund', '--silent'], { cwd: DESKTOP });
  run('npm', ['run', 'build', '--', '--target', RUST_TARGET], {
    cwd: DESKTOP,
    env: {
      ...process.env,
      KOPIRKA_TARGET: PAYLOAD_TARGET,
      KOPIRKA_NODE_BINARY: nodeBinary,
      KOPIRKA_PLATFORM_MODULES: platformModules,
    },
  });
}

function report() {
  const bundle = path.join(DESKTOP, 'src-tauri', 'target.noindex', RUST_TARGET, 'release', 'bundle');
  const app = path.join(bundle, 'macos', 'Копирка.app');
  if (fs.existsSync(app)) log(`  ${path.relative(APP, app)} — ${bytes(dirSize(app))}`);
  const dmgDir = path.join(bundle, 'dmg');
  if (fs.existsSync(dmgDir)) {
    for (const entry of fs.readdirSync(dmgDir)) {
      if (!entry.endsWith('.dmg')) continue;
      const full = path.join(dmgDir, entry);
      log(`  ${path.relative(APP, full)} — ${bytes(fs.statSync(full).size)}`);
    }
  }
}

async function main() {
  const prepareOnly = process.argv.includes('--prepare-only');
  log(`Intel-сборка «Копирки»: rust ${RUST_TARGET}, payload ${PAYLOAD_TARGET}`);
  ensureRustTarget();
  const nodeBinary = await ensureNodeBinary();
  const platformModules = await ensurePlatformModules();
  if (prepareOnly) {
    log('Подготовка закончена, сборку не запускаю (--prepare-only).');
    log(`  KOPIRKA_NODE_BINARY=${nodeBinary}`);
    log(`  KOPIRKA_PLATFORM_MODULES=${platformModules}`);
    return;
  }
  build(nodeBinary, platformModules);
  log('Готово:');
  report();
}

main().catch((error) => {
  process.stderr.write(`\nIntel-сборка не состоялась: ${error.message}\n`);
  process.exit(1);
});
