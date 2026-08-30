/**
 * Проверка целостности расширения без запуска Chrome:
 * манифест — валидный JSON, все упомянутые файлы на месте, ссылки внутри
 * HTML и импорты внутри JS ведут в существующие файлы, синтаксис js разбирается.
 *
 * Запуск: node tools/verify.mjs
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const checked = [];

function requireFile(path, why) {
  const absolute = join(root, path);
  if (existsSync(absolute) && statSync(absolute).isFile()) {
    checked.push(path);
  } else {
    problems.push(`${why}: нет файла ${path}`);
  }
}

// ── manifest.json ────────────────────────────────────────────────────────────
let manifest;
try {
  manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
} catch (error) {
  console.error(`manifest.json не разбирается: ${error.message}`);
  process.exit(1);
}

if (manifest.manifest_version !== 3) problems.push('manifest_version должен быть 3');

requireFile(manifest.background?.service_worker, 'background.service_worker');
if (manifest.background?.type !== 'module') {
  problems.push('background.type должен быть "module" — service worker импортирует lib/');
}

requireFile(manifest.action?.default_popup, 'action.default_popup');
requireFile(manifest.options_ui?.page, 'options_ui.page');

for (const [size, path] of Object.entries(manifest.icons ?? {})) requireFile(path, `icons.${size}`);
for (const [size, path] of Object.entries(manifest.action?.default_icon ?? {})) {
  requireFile(path, `action.default_icon.${size}`);
}

// Порт в match pattern Chrome не поддерживает — такой манифест не загрузится.
for (const pattern of manifest.host_permissions ?? []) {
  const host = pattern.replace(/^[a-z-]+:\/\//, '').split('/')[0];
  if (host.includes(':')) problems.push(`host_permissions: порт в шаблоне не поддерживается — ${pattern}`);
}

const ALLOWED_PERMISSIONS = ['activeTab', 'scripting', 'contextMenus', 'storage', 'notifications'];
for (const permission of manifest.permissions ?? []) {
  if (!ALLOWED_PERMISSIONS.includes(permission)) {
    problems.push(`лишнее разрешение: ${permission}`);
  }
}

// ── Обход всех файлов расширения ─────────────────────────────────────────────
const SKIP_DIRS = new Set(['tools', 'icons', 'node_modules', '.git']);

function walk(directory) {
  const entries = [];
  for (const name of readdirSync(directory)) {
    const absolute = join(directory, name);
    if (statSync(absolute).isDirectory()) {
      if (!SKIP_DIRS.has(name)) entries.push(...walk(absolute));
    } else {
      entries.push(absolute);
    }
  }
  return entries;
}

const files = walk(root);
const htmlFiles = files.filter((file) => file.endsWith('.html'));
const jsFiles = files.filter((file) => file.endsWith('.js'));

// ── Ссылки в HTML ────────────────────────────────────────────────────────────
for (const file of htmlFiles) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const reference = match[1];
    if (/^(https?:|data:|#)/.test(reference)) continue;
    const target = resolve(dirname(file), reference);
    if (!existsSync(target)) {
      problems.push(`${relative(root, file)}: ссылка на несуществующий ${reference}`);
    }
  }
}

// ── Импорты в JS ─────────────────────────────────────────────────────────────
for (const file of jsFiles) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/from\s+'([^']+)'/g)) {
    const reference = match[1];
    if (!reference.startsWith('.')) continue;
    const target = resolve(dirname(file), reference);
    if (!existsSync(target)) {
      problems.push(`${relative(root, file)}: импорт несуществующего ${reference}`);
    }
  }

  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    problems.push(`${relative(root, file)}: синтаксическая ошибка — ${String(error.stderr).trim()}`);
  }
}

// Скрипт, который инжектится в страницу, в манифесте не упомянут — проверяем отдельно.
requireFile('content/area-select.js', 'content script для CAP-08');
const workerSource = readFileSync(join(root, manifest.background.service_worker), 'utf8');
if (!workerSource.includes('content/area-select.js')) {
  problems.push('service worker не ссылается на content/area-select.js');
}

// ── Итог ─────────────────────────────────────────────────────────────────────
console.log(`Проверено файлов из манифеста: ${checked.length}`);
console.log(`HTML: ${htmlFiles.length}, JS: ${jsFiles.length}`);

if (problems.length > 0) {
  console.error('\nПроблемы:');
  for (const problem of problems) console.error(`  · ${problem}`);
  process.exit(1);
}

console.log('\nВсё на месте.');
