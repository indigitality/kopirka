/** Определение формата по содержимому, хэши и превью (IMP-02, IMP-05). */
import crypto from 'node:crypto';
import sharp from 'sharp';
import rawPhash from 'sharp-phash';
import { RASTER_EXTS, type FileExt } from '../../shared/api.js';

export const PREVIEW_MAX_SIDE = 600;
/**
 * FDB-04 — второй размер превью. Колонка «L» — 560 CSS px, на Retina это 1120
 * физических: 600-пиксельная картинка растягивалась почти вдвое и мылила.
 * 1400 закрывает и колонку L, и её же на дисплее с масштабом 2,5×.
 */
export const PREVIEW_2X_MAX_SIDE = 1400;
export const PREVIEW_QUALITY = 80;

export function sha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function isRaster(ext: FileExt): boolean {
  return (RASTER_EXTS as readonly string[]).includes(ext);
}

/**
 * Формат определяется по magic bytes, а не по расширению имени:
 * имя приходит снаружи и врать может как угодно.
 */
export function detectExt(buffer: Buffer): FileExt | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'png';
  }
  if (buffer.length >= 6) {
    const head = buffer.subarray(0, 6).toString('latin1');
    if (head === 'GIF87a' || head === 'GIF89a') return 'gif';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'webp';
  }
  if (looksLikeSvg(buffer)) return 'svg';
  return null;
}

function looksLikeSvg(buffer: Buffer): boolean {
  const head = buffer.subarray(0, Math.min(buffer.length, 4096)).toString('utf8').replace(/^﻿/, '').trimStart();
  if (!head.startsWith('<')) return false;
  return /<svg[\s>]/i.test(head) || (head.startsWith('<?xml') && /<svg[\s>]/i.test(head));
}

/** Расширение хранения: jpeg → jpg, чтобы на диске был один вариант. */
export function normalizeExt(ext: FileExt): FileExt {
  return ext === 'jpeg' ? 'jpg' : ext;
}

export interface ImageMeta {
  width: number | null;
  height: number | null;
}

export async function readMeta(buffer: Buffer): Promise<ImageMeta> {
  try {
    const meta = await sharp(buffer).metadata();
    return { width: meta.width ?? null, height: meta.height ?? null };
  } catch {
    return { width: null, height: null };
  }
}

/** 64-битный перцептивный хэш в hex. null — если посчитать не удалось (битый файл, SVG). */
export async function perceptualHash(buffer: Buffer): Promise<string | null> {
  try {
    const bits = await rawPhash(buffer);
    if (typeof bits !== 'string' || bits.length !== 64) return null;
    let hex = '';
    for (let i = 0; i < 64; i += 4) {
      hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
    }
    return hex;
  } catch {
    return null;
  }
}

/** Расстояние Хэмминга между hex-хэшами. Возвращает Infinity, если хэши несопоставимы. */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  let distance = 0;
  for (let i = 0; i < a.length; i += 1) {
    const left = parseInt(a[i] as string, 16);
    const right = parseInt(b[i] as string, 16);
    if (Number.isNaN(left) || Number.isNaN(right)) return Number.POSITIVE_INFINITY;
    let xor = left ^ right;
    while (xor > 0) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}

/**
 * WebP-превью, по умолчанию 600px по большей стороне. Для GIF — статичный первый
 * кадр. `maxSide` задаётся явно ради второго размера (FDB-04, `PREVIEW_2X_MAX_SIDE`).
 */
export async function renderPreview(buffer: Buffer, maxSide: number = PREVIEW_MAX_SIDE): Promise<Buffer> {
  return sharp(buffer, { animated: false })
    .rotate()
    .resize({
      width: maxSide,
      height: maxSide,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: PREVIEW_QUALITY })
    .toBuffer();
}

export async function toPngBuffer(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer, { animated: false }).png().toBuffer();
}

export const CONTENT_TYPES: Record<FileExt, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
};
