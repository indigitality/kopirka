/**
 * Генерирует иконки расширения: тёмный скруглённый квадрат #1c1d1f (--color-panel,
 * см. web/src/styles/tokens.css) с лаймовым знаком #c5fd63 по центру — ребрендинг
 * 02.09.2026, знак взят из web/src/assets/logo-mark.svg (viewBox "2.913 0 14.659 29").
 * До ребрендинга иконка была просто мятной заливкой без знака — тот же логотип, что
 * тогда был в сайдбаре приложения (DESIGN-SPEC §1); теперь у знака есть форма, и он
 * встал в композицию, как в десктопной иконке (desktop/scripts/make-icons.mjs).
 *
 * Запуск: node tools/make-icons.mjs
 * Внешних зависимостей нет: PNG собирается вручную через zlib, знак — через
 * point-in-polygon (крестовый тест чётности), фон — через SDF скруглённого прямоугольника.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BG = [0x1c, 0x1d, 0x1f]; // --color-panel
const MARK_COLOR = [0xc5, 0xfd, 0x63]; // знак, web/src/assets/logo-mark.svg
const RADIUS_RATIO = 0.22;
const INSET_RATIO = 0.0625; // поля вокруг квадрата, чтобы иконка не липла к краям
const MARK_HEIGHT_RATIO = 0.6; // высота знака от канвы — потолок, заданный 02.09.2026
const SUPERSAMPLE = 4;

// Знак: web/src/assets/logo-mark.svg, viewBox "2.913 0 14.659 29". Оба <path> в исходнике
// используют C-сегменты с вырожденными контрольными точками (совпадают с опорными) —
// по факту это прямые, поэтому знак сведён к двум 6-вершинным многоугольникам.
const MARK_VIEWBOX = { minX: 2.913, minY: 0, width: 14.659, height: 29 };
const MARK_POLYGONS = [
  [[9.939, 0], [2.737, 7.196], [2.737, 14.538], [10.075, 14.538], [17.278, 7.341], [17.278, 0]],
  [[10.055, 14.465], [2.853, 21.661], [2.853, 29.003], [10.192, 29.003], [17.395, 21.806], [17.395, 14.465]],
];

function main() {
  const outputDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
  mkdirSync(outputDir, { recursive: true });

  for (const size of [16, 32, 48, 128]) {
    writeFileSync(join(outputDir, `icon${size}.png`), encodePng(size, size, renderIcon(size)));
    console.log(`icons/icon${size}.png`);
  }
}

/**
 * Знак, вписанный по высоте targetH в центр (cx, cy), в виде многоугольников в пиксельных
 * координатах канвы — тот же приём, что вложенный <svg viewBox> в десктопном генераторе,
 * только руками: масштаб от родного viewBox знака, потом сдвиг к центру.
 */
function positionedMarkPolygons(cx, cy, targetH) {
  const scale = targetH / MARK_VIEWBOX.height;
  const targetW = MARK_VIEWBOX.width * scale;
  const originX = cx - targetW / 2;
  const originY = cy - targetH / 2;
  return MARK_POLYGONS.map((poly) => poly.map(([px, py]) => [
    originX + (px - MARK_VIEWBOX.minX) * scale,
    originY + (py - MARK_VIEWBOX.minY) * scale,
  ]));
}

/** Крестовый тест чётности (even-odd rule) — стандартный point-in-polygon без зависимостей. */
function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const crosses = yi > y !== yj > y;
    if (crosses && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
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
  const markPolygons = positionedMarkPolygons(size / 2, size / 2, size * MARK_HEIGHT_RATIO);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let coveredBg = 0;
      let coveredMark = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const px = x + (sx + 0.5) / SUPERSAMPLE;
          const py = y + (sy + 0.5) / SUPERSAMPLE;
          if (markPolygons.some((poly) => pointInPolygon(px, py, poly))) {
            coveredMark += 1;
          } else if (insideRoundedRect(px, py, x0, y0, x1, y1, radius)) {
            coveredBg += 1;
          }
        }
      }

      const total = SUPERSAMPLE * SUPERSAMPLE;
      const covered = coveredBg + coveredMark;
      const offset = (y * size + x) * 4;
      if (covered > 0) {
        for (let channel = 0; channel < 3; channel += 1) {
          pixels[offset + channel] = Math.round(
            (BG[channel] * coveredBg + MARK_COLOR[channel] * coveredMark) / covered,
          );
        }
      }
      pixels[offset + 3] = Math.round((covered / total) * 255);
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
