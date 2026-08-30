/**
 * Генерирует иконки расширения: мятный квадрат с градиентом акцента —
 * тот же логотип, что в сайдбаре приложения (DESIGN-SPEC §1).
 *
 * Запуск: node tools/make-icons.mjs
 * Внешних зависимостей нет: PNG собирается вручную через zlib.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ACCENT = [0x3d, 0xdb, 0xb0]; // --color-accent
const ACCENT_DEEP = [0x21, 0xc3, 0x9b]; // --color-accent-deep
const RADIUS_RATIO = 0.22;
const INSET_RATIO = 0.0625; // поля вокруг квадрата, чтобы иконка не липла к краям
const SUPERSAMPLE = 4;

function main() {
  const outputDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
  mkdirSync(outputDir, { recursive: true });

  for (const size of [16, 32, 48, 128]) {
    writeFileSync(join(outputDir, `icon${size}.png`), encodePng(size, size, renderIcon(size)));
    console.log(`icons/icon${size}.png`);
  }
}

/**
 * @param {number} size
 * @returns {Uint8Array} RGBA
 */
function renderIcon(size) {
  const pixels = new Uint8Array(size * size * 4);
  const inset = size * INSET_RATIO;
  const x0 = inset;
  const y0 = inset;
  const x1 = size - inset;
  const y1 = size - inset;
  const radius = (x1 - x0) * RADIUS_RATIO;
  const span = (x1 - x0) + (y1 - y0);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let covered = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const px = x + (sx + 0.5) / SUPERSAMPLE;
          const py = y + (sy + 0.5) / SUPERSAMPLE;
          if (insideRoundedRect(px, py, x0, y0, x1, y1, radius)) covered += 1;
        }
      }

      const alpha = covered / (SUPERSAMPLE * SUPERSAMPLE);
      const t = Math.min(Math.max(((x + 0.5 - x0) + (y + 0.5 - y0)) / span, 0), 1);
      const offset = (y * size + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        pixels[offset + channel] = Math.round(
          ACCENT[channel] + (ACCENT_DEEP[channel] - ACCENT[channel]) * t,
        );
      }
      pixels[offset + 3] = Math.round(alpha * 255);
    }
  }

  return pixels;
}

function insideRoundedRect(px, py, x0, y0, x1, y1, r) {
  const cx = Math.min(Math.max(px, x0 + r), x1 - r);
  const cy = Math.min(Math.max(py, y0 + r), y1 - r);
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

/**
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array} rgba
 * @returns {Buffer}
 */
function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // фильтр строки: none
    Buffer.from(rgba.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // бит на канал
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

main();
