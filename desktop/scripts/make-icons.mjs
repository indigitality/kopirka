#!/usr/bin/env node
/**
 * Иконки приложения и строки меню. Рисуем SVG → PNG через sharp из корневых node_modules.
 *
 *   icons/source-1024.png — исходник для `tauri icon` (из него делаются .icns и .ico)
 *   icons/tray.png / tray@2x.png — шаблонная иконка строки меню (только альфа, цвет macOS
 *   подставляет сам: чёрный в светлой полосе, белый в тёмной)
 *
 * Знак — ребрендинг 02.09.2026: два path из web/src/assets/logo-mark.svg (viewBox
 * "2.913 0 14.659 29", лайм #c5fd63), вписаны по высоте через вложенный <svg> с тем же
 * viewBox — масштаб и сдвиг считает сам SVG, без ручной матрицы. Фон — сплошной #1c1d1f
 * (токен --color-panel, web/src/styles/tokens.css), без градиента: прежний мятный
 * градиент конфликтовал по цвету с новым лаймовым знаком.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ICONS = path.resolve(HERE, '..', 'src-tauri', 'icons');
const require = createRequire(path.resolve(HERE, '..', '..', 'package.json'));
const sharp = require('sharp');

// Знак: web/src/assets/logo-mark.svg — оба <path> перенесены дословно, меняется только fill.
const MARK_VIEWBOX = '2.913 0 14.659 29';
const MARK_PATHS = `
    <path d="M9.939 0C9.939 0 2.737 7.196 2.737 7.196 2.737 7.196 2.737 14.538 2.737 14.538 2.737 14.538 10.075 14.538 10.075 14.538 10.075 14.538 17.278 7.341 17.278 7.341 17.278 7.341 17.278 0 17.278 0 17.278 0 9.939 0 9.939 0Z" fill-rule="nonzero" fill="{{COLOR}}"/>
    <path d="M10.055 14.465C10.055 14.465 2.853 21.661 2.853 21.661 2.853 21.661 2.853 29.003 2.853 29.003 2.853 29.003 10.192 29.003 10.192 29.003 10.192 29.003 17.395 21.806 17.395 21.806 17.395 21.806 17.395 14.465 17.395 14.465 17.395 14.465 10.055 14.465 10.055 14.465Z" fill-rule="nonzero" fill="{{COLOR}}"/>`;

/**
 * Вписывает знак высотой targetH по центру (cx, cy). Вложенный <svg> со своим viewBox
 * сам растягивает содержимое — не нужно вручную считать translate/scale.
 */
function mark(color, cx, cy, targetH) {
  const scale = targetH / 29;
  const targetW = 14.659 * scale;
  const x = cx - targetW / 2;
  const y = cy - targetH / 2;
  const paths = MARK_PATHS.replaceAll('{{COLOR}}', color);
  return `<svg x="${x}" y="${y}" width="${targetW}" height="${targetH}" viewBox="${MARK_VIEWBOX}">${paths}
  </svg>`;
}

// Высота знака — 566px из 1024 (55.3% канвы). Проверено на тёмном фоне живьём: читается
// уверенно, увеличивать до потолка в 60% не потребовалось.
const APP_MARK_HEIGHT = 566;
// Трей — тот же мотив, 33px из 44 (75% канвы), как и до ребрендинга.
const TRAY_MARK_HEIGHT = 33;

/** Логотип: скруглённый квадрат #1c1d1f с лаймовым знаком по центру. */
const appIcon = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect x="100" y="100" width="824" height="824" rx="185" fill="#1c1d1f"/>
  ${mark('#c5fd63', 512, 512, APP_MARK_HEIGHT)}
</svg>`;

/** Иконка строки меню: тот же знак силуэтом — важна только альфа. */
const trayIcon = `
<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
  ${mark('#000000', 22, 22, TRAY_MARK_HEIGHT)}
</svg>`;

async function write(name, svg, size) {
  const file = path.join(ICONS, name);
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(file);
  process.stdout.write(`  ${name} ${size}×${size}\n`);
}

async function main() {
  fs.mkdirSync(ICONS, { recursive: true });
  await write('source-1024.png', appIcon, 1024);
  await write('tray.png', trayIcon, 22);
  await write('tray@2x.png', trayIcon, 44);
}

await main();
