#!/usr/bin/env node
/**
 * Сборка payload'а сервера для десктопной «Копирки».
 *
 * Кладёт в src-tauri/resources/backend всё, что нужно, чтобы поднять сервер
 * без npm и без devDependencies: бинарник Node, скомпилированный в JS сервер,
 * shared, собранный web/dist и минимальный срез node_modules.
 *
 * Раскладка payload'а (важна: сервер ищет соседей по относительным путям):
 *   backend/node                 — бинарник Node
 *   backend/server/src/index.js  — точка входа
 *   backend/server/package.json  — из него сервер читает версию
 *   backend/shared/api.js        — ../../shared/api.js от server/src
 *   backend/web/dist/…           — ../../web/dist/ от server/src
 *   backend/node_modules/…       — резолвится вверх от server/src
 *
 * Сборка под чужую архитектуру (Intel с машины на Apple Silicon, в перспективе Windows)
 * настраивается тремя переменными окружения:
 *
 *   KOPIRKA_TARGET           — платформа payload'а, например darwin-x64. По умолчанию хостовая;
 *                              от неё зависят prebuild better-sqlite3 и платформенные пакеты sharp.
 *   KOPIRKA_NODE_BINARY      — бинарник Node в бандл. По умолчанию тот, которым запущен скрипт.
 *   KOPIRKA_PLATFORM_MODULES — дополнительный корень node_modules, где лежат пакеты под TARGET
 *                              (npm ставит в app/node_modules только «свою» архитектуру).
 *
 * Готовит всё это desktop/scripts/build-intel.mjs — руками переменные задавать не нужно.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.resolve(HERE, '..');
const APP = path.resolve(DESKTOP, '..');
const OUT = path.join(DESKTOP, 'src-tauri', 'resources', 'backend');
const ROOT_MODULES = path.join(APP, 'node_modules');

/** Платформа целевой сборки — от неё зависит, какие нативные модули берём. */
const TARGET = process.env.KOPIRKA_TARGET ?? `${process.platform}-${process.arch}`;

/** Корень с пакетами под TARGET, если он подготовлен отдельно. Проверяется раньше остальных. */
const PLATFORM_MODULES = process.env.KOPIRKA_PLATFORM_MODULES ?? null;

/**
 * Мажорная версия Node, под которую собран и проверен payload. Жёстко, а не «22+»:
 * в PATH легко оказывается посторонний Node (свежий симлинк, nvm, brew), и без этой
 * проверки он молча уехал бы в бандл вместо проверенного.
 */
const NODE_MAJOR = 22;

/** Пакеты, с которых начинается обход. Всё остальное подтягивается транзитивно. */
const ROOT_DEPS = [
  '@hono/node-server',
  'better-sqlite3',
  'hono',
  'sharp',
  'sharp-phash',
  'zod',
];

/** Пакеты, которые не нужны в проде ни при каких условиях (wasm-сборки sharp). */
const EXCLUDE = new Set(['@img/sharp-wasm32', '@img/sharp-freebsd-wasm32', '@img/sharp-webcontainers-wasm32']);

/** Мусор внутри пакетов: документация, тесты, исходники нативных модулей. */
const DROP_DIRS = new Set(['test', 'tests', '__tests__', 'docs', 'doc', 'example', 'examples', '.github', 'benchmark']);
const DROP_EXTS = new Set(['.md', '.markdown', '.ts', '.map']);

function log(message) {
  process.stdout.write(`${message}\n`);
}

function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function bytes(n) {
  return `${(n / 1024 / 1024).toFixed(1)} МБ`;
}

function dirSize(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += dirSize(full);
    else if (entry.isFile()) total += fs.statSync(full).size;
  }
  return total;
}

// ── Поиск пакетов ───────────────────────────────────────────────────────────

/**
 * npm по умолчанию поднимает зависимости в корень, поэтому сначала смотрим туда,
 * а вложенный node_modules проверяем как запасной вариант (конфликт версий).
 *
 * Корень KOPIRKA_PLATFORM_MODULES идёт впереди всех: он собран под TARGET, а рабочее
 * дерево — под архитектуру машины сборки, и при кросс-сборке побеждать должен первый.
 */
function resolvePackage(name, fromDir) {
  const candidates = [];
  if (PLATFORM_MODULES) candidates.push(path.join(PLATFORM_MODULES, name));
  if (fromDir) candidates.push(path.join(fromDir, 'node_modules', name));
  candidates.push(path.join(ROOT_MODULES, name));
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
  }
  return null;
}

/**
 * Платформенные пакеты sharp называются `@img/sharp-<платформа>` и
 * `@img/sharp-libvips-<платформа>`. Чужие в payload не пускаем: на машине сборки лежат
 * пакеты её собственной архитектуры, и при кросс-сборке они бы поехали в бандл заодно
 * с целевыми — лишние 18 МБ и путаница в диагностике.
 *
 * Непортируемые пакеты того же скоупа (`@img/colour`) под шаблон не подходят и проходят.
 */
function isForeignPlatformPackage(name) {
  const match = /^@img\/sharp-(?:libvips-)?(.+)$/.exec(name);
  return match !== null && match[1] !== TARGET;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Обход графа зависимостей: dependencies обязательны, optionalDependencies — если установлены. */
function collectPackages() {
  const found = new Map(); // name → абсолютный путь
  const queue = ROOT_DEPS.map((name) => ({ name, from: null }));

  while (queue.length > 0) {
    const { name, from } = queue.shift();
    if (found.has(name) || EXCLUDE.has(name) || isForeignPlatformPackage(name)) continue;
    const dir = resolvePackage(name, from);
    if (dir === null) {
      // Платформенный optional-пакет под другую ОС просто не установлен — это норма.
      continue;
    }
    found.set(name, dir);
    const manifest = readJson(path.join(dir, 'package.json'));
    for (const dep of Object.keys(manifest.dependencies ?? {})) queue.push({ name: dep, from: dir });
    for (const dep of Object.keys(manifest.optionalDependencies ?? {})) queue.push({ name: dep, from: dir });
  }
  return found;
}

// ── Обрезка ─────────────────────────────────────────────────────────────────

/**
 * better-sqlite3 кладёт prebuild'ы всех восьми платформ по ~2 МБ.
 * Нужна ровно одна — та, под которую собираем.
 */
function trimBetterSqlite(dir) {
  const prebuilds = path.join(dir, 'prebuilds');
  if (fs.existsSync(prebuilds)) {
    const keep = `${TARGET}.node`;
    for (const entry of fs.readdirSync(prebuilds)) {
      if (entry !== keep) rmrf(path.join(prebuilds, entry));
    }
    if (!fs.existsSync(path.join(prebuilds, keep))) {
      throw new Error(`better-sqlite3: нет prebuild'а ${keep} — сборка под ${TARGET} невозможна`);
    }
  }
  // Исходники C/C++ и амальгамация SQLite нужны только для сборки из исходников.
  rmrf(path.join(dir, 'deps'));
  rmrf(path.join(dir, 'src'));
  rmrf(path.join(dir, 'binding.gyp'));
}

function shouldSkip(src, name, isDir) {
  if (isDir) return DROP_DIRS.has(name);
  if (name === 'package.json' || name === 'LICENSE' || name.startsWith('LICENSE')) return false;
  const ext = path.extname(name).toLowerCase();
  // .d.ts и прочие типы в рантайме не нужны, но .node — нужен всегда.
  if (ext === '.node') return false;
  return DROP_EXTS.has(ext);
}

function copyPackage(name, from, to) {
  fs.cpSync(from, to, {
    recursive: true,
    dereference: true,
    filter: (src) => {
      if (src === from) return true;
      const base = path.basename(src);
      let isDir = false;
      try {
        isDir = fs.statSync(src).isDirectory();
      } catch {
        return false;
      }
      return !shouldSkip(src, base, isDir);
    },
  });
}

// ── Сборка ──────────────────────────────────────────────────────────────────

/** Архитектура целевой платформы: darwin-x64 → x64, linuxmusl-arm64 → arm64. */
function targetArch() {
  return TARGET.slice(TARGET.indexOf('-') + 1);
}

/**
 * Архитектура Mach-O по заголовку файла: 'x64' | 'arm64' | null.
 * Читаем сами, а не зовём `file`: проверка не зависит ни от локали, ни от формата вывода.
 */
function machoArch(file) {
  const header = Buffer.alloc(8);
  const fd = fs.openSync(file, 'r');
  try {
    if (fs.readSync(fd, header, 0, 8, 0) < 8) return null;
  } finally {
    fs.closeSync(fd);
  }
  if (header.readUInt32LE(0) !== 0xfeedfacf) return null; // MH_MAGIC_64, little-endian
  const cpu = header.readUInt32LE(4);
  if (cpu === 0x01000007) return 'x64'; // CPU_TYPE_X86_64
  if (cpu === 0x0100000c) return 'arm64'; // CPU_TYPE_ARM64
  return null;
}

/** `node --version` целевого бинарника. Чужую архитектуру на macOS запускает Rosetta. */
function nodeVersion(binary, arch) {
  const rosetta = { x64: 'x86_64', arm64: 'arm64' }[arch];
  const [command, args] =
    process.platform === 'darwin' && rosetta
      ? ['arch', [`-${rosetta}`, binary, '--version']]
      : [binary, ['--version']];
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) return null;
  return (result.stdout ?? '').trim();
}

/**
 * Бинарник Node — это то, на чём приложение будет жить у человека, и подменить его
 * проще простого: достаточно другого симлинка в PATH. Проверяем до копирования, чтобы
 * не оставить в payload'е заведомо негодный файл.
 *
 * Архитектура: чужая — сервер на целевой машине просто не запустится.
 * Мажорная версия: payload собирается и проверяется только на Node 22.
 */
function verifyNodeBinary(binary) {
  const arch = targetArch();
  if (process.platform === 'darwin') {
    const actual = machoArch(binary);
    if (actual !== arch) {
      throw new Error(
        `${binary}: не та архитектура — нужен ${arch}, а это ${actual ?? 'не Mach-O'}. ` +
          'Задайте KOPIRKA_NODE_BINARY подходящим бинарником (для Intel это делает scripts/build-intel.mjs)',
      );
    }
  }
  const version = nodeVersion(binary, arch);
  if (version === null) {
    throw new Error(`${binary}: не отвечает на --version`);
  }
  const major = Number.parseInt(version.replace(/^v/, ''), 10);
  if (major !== NODE_MAJOR) {
    throw new Error(
      `выбран Node ${version}, а в payload нужен ${NODE_MAJOR}.x (${binary}). ` +
        'Скорее всего в PATH оказался посторонний Node — поправьте PATH или задайте ' +
        'KOPIRKA_NODE_BINARY путём к нужному бинарнику',
    );
  }
  log(`  node: ${version} ${arch} — проверен`);
}

/**
 * По умолчанию берём тот же Node, которым запущен скрипт: он заведомо рабочий
 * и той же мажорной версии, под которую собраны нативные модули.
 */
function nodeSource() {
  return process.env.KOPIRKA_NODE_BINARY ?? fs.realpathSync(process.execPath);
}

function copyNodeBinary(source) {
  const target = path.join(OUT, 'node');
  const stat = fs.statSync(source);
  let reusable = false;
  if (fs.existsSync(target)) {
    const existing = fs.statSync(target);
    // 104 МБ копируются заметное время — не повторяем без нужды. Архитектуру сверяем
    // отдельно: payload общий для всех целей, и от прошлой сборки там мог остаться чужой Node.
    const sameArch = process.platform !== 'darwin' || machoArch(target) === targetArch();
    if (existing.size === stat.size && existing.mtimeMs >= stat.mtimeMs && sameArch) {
      log(`  node: без изменений (${bytes(stat.size)})`);
      reusable = true;
    }
  }
  if (!reusable) {
    fs.copyFileSync(source, target);
    fs.chmodSync(target, 0o755);
    log(`  node: ${source} → ${bytes(stat.size)}`);
  }
}

function copyServer() {
  const dist = path.join(APP, 'server', 'dist');
  if (!fs.existsSync(path.join(dist, 'server', 'src', 'index.js'))) {
    throw new Error('Нет server/dist/server/src/index.js — сначала `npm run build --workspace=server`');
  }
  fs.cpSync(path.join(dist, 'server', 'src'), path.join(OUT, 'server', 'src'), { recursive: true });
  // Смоук-тест в прод-сборке не нужен, а тянет за собой ещё код.
  rmrf(path.join(OUT, 'server', 'src', 'smoke.js'));
  fs.cpSync(path.join(dist, 'shared'), path.join(OUT, 'shared'), { recursive: true });

  // Корневой манифест payload'а: без него Node считает shared/*.js «безтиповыми»
  // и каждый раз перепарсивает их как ESM, ругаясь в stderr.
  fs.writeFileSync(
    path.join(OUT, 'package.json'),
    `${JSON.stringify({ name: 'kopirka-backend', private: true, type: 'module' }, null, 2)}\n`,
  );

  // Сервер читает ../package.json ради номера версии. Кладём урезанный манифест:
  // dependencies в проде не резолвятся npm'ом, а type: module обязателен.
  const manifest = readJson(path.join(APP, 'server', 'package.json'));
  fs.writeFileSync(
    path.join(OUT, 'server', 'package.json'),
    `${JSON.stringify({ name: manifest.name, version: manifest.version, private: true, type: 'module', main: 'src/index.js' }, null, 2)}\n`,
  );
}

function copyWeb() {
  const dist = path.join(APP, 'web', 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    throw new Error('Нет web/dist/index.html — сначала `npm run build --workspace=web`');
  }
  fs.cpSync(dist, path.join(OUT, 'web', 'dist'), { recursive: true });
}

function copyModules() {
  const packages = collectPackages();
  const names = [...packages.keys()].sort();
  for (const name of names) {
    const from = packages.get(name);
    const to = path.join(OUT, 'node_modules', name);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    copyPackage(name, from, to);
    if (name === 'better-sqlite3') trimBetterSqlite(to);
  }
  log(`  node_modules: ${names.length} пакетов — ${names.join(', ')}`);
}

function main() {
  log(`Payload сервера → ${path.relative(APP, OUT)} (цель ${TARGET})`);
  if (PLATFORM_MODULES) log(`  доп. корень модулей: ${PLATFORM_MODULES}`);
  // Бинарник Node проверяем до того, как снесём старый payload: негодная цель не должна
  // оставлять после себя развороченный каталог.
  const node = nodeSource();
  verifyNodeBinary(node);

  // Всё, кроме бинарника Node: его копирование дорогое, а содержимое не меняется.
  for (const entry of ['server', 'shared', 'web', 'node_modules']) rmrf(path.join(OUT, entry));
  fs.mkdirSync(OUT, { recursive: true });

  copyNodeBinary(node);
  copyServer();
  copyWeb();
  copyModules();

  log(`Готово: ${bytes(dirSize(OUT))}`);
}

main();
