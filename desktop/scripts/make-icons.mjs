#!/usr/bin/env node
/**
 * Иконки приложения и строки меню. Рисуем SVG → PNG через sharp из корневых node_modules.
 *
 *   icons/source-1024.png — исходник для `tauri icon` (из него делаются .icns и .ico)
 *   icons/tray.png / tray@2x.png — шаблонная иконка строки меню (только альфа, цвет macOS
 *   подставляет сам: чёрный в светлой полосе, белый в тёмной)
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ICONS = path.resolve(HERE, '..', 'src-tauri', 'icons');
const require = createRequire(path.resolve(HERE, '..', '..', 'package.json'));
const sharp = require('sharp');

/** Логотип: скруглённый квадрат с фирменным градиентом и стопкой карточек внутри. */
const appIcon = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3ddbb0"/>
      <stop offset="1" stop-color="#21c39b"/>
    </linearGradient>
  </defs>
  <rect x="100" y="100" width="824" height="824" rx="185" fill="url(#g)"/>
  <g fill="none" stroke="#04231b" stroke-width="42" stroke-linejoin="round">
    <rect x="290" y="250" width="330" height="410" rx="52" opacity="0.45"/>
    <rect x="404" y="364" width="330" height="410" rx="52" fill="#04231b" fill-opacity="0.14"/>
  </g>
</svg>`;

/** Иконка строки меню: тот же мотив стопки, но силуэтом — важна только альфа. */
const trayIcon = `
<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
  <g fill="none" stroke="#000000" stroke-width="3" stroke-linejoin="round">
    <rect x="9.5" y="7.5" width="19" height="24" rx="4"/>
    <rect x="15.5" y="13.5" width="19" height="24" rx="4" fill="#000000" fill-opacity="0.18"/>
  </g>
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
