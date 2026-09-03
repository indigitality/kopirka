/**
 * Собирает ZIP для Chrome Web Store из файлов расширения.
 *
 * Без внешних зависимостей — тот же принцип, что у make-icons.mjs: формат
 * собирается вручную (ZIP — через встроенный zlib и самодельный CRC-32),
 * а не через child_process + системный `zip` (его может не быть в PATH,
 * особенно на CI, и версия/флаги на разных машинах отличаются).
 *
 * В архив идёт файл расширения как есть: манифест лежит в КОРНЕ архива
 * (это требование Chrome Web Store), исключены tools/, README.md, dist/,
 * store/ и .DS_Store на любом уровне вложенности — это либо служебное,
 * либо не файлы расширения.
 *
 * Запуск: node tools/pack.mjs
 * Результат: dist/kopirka-extension-<version>.zip (версия — из manifest.json)
 */

import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const SKIP_DIR_NAMES = new Set(['tools', 'dist', 'store', 'node_modules', '.git']);
const SKIP_FILE_NAMES = new Set(['README.md', '.DS_Store']);

function main() {
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
  const files = collectFiles(root);

  if (!files.includes('manifest.json')) {
    throw new Error('manifest.json не попал в список файлов архива — проверь фильтры');
  }

  const zip = buildZip(root, files);

  const outDir = join(root, 'dist');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `kopirka-extension-${manifest.version}.zip`);
  writeFileSync(outPath, zip);

  console.log(`Файлов в архиве: ${files.length}`);
  console.log(`Размер: ${(zip.length / 1024).toFixed(1)} КБ`);
  console.log(relative(process.cwd(), outPath));
}

/** Обход дерева расширения, пути — POSIX, относительно root (то, что должно лечь в архив). */
function collectFiles(directory, prefix = '') {
  const result = [];
  for (const name of readdirSync(directory).sort()) {
    if (SKIP_FILE_NAMES.has(name)) continue;
    const absolute = join(directory, name);
    const relPath = prefix ? `${prefix}/${name}` : name;
    if (statSync(absolute).isDirectory()) {
      if (SKIP_DIR_NAMES.has(name)) continue;
      result.push(...collectFiles(absolute, relPath));
    } else {
      result.push(relPath);
    }
  }
  return result;
}

// ── ZIP-контейнер (APPNOTE.TXT 4.3): локальные заголовки + центральный каталог ──

/**
 * @param {string} root
 * @param {string[]} relPaths POSIX-пути относительно root, в порядке записи в архив
 * @returns {Buffer}
 */
function buildZip(root, relPaths) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const relPath of relPaths) {
    const data = readFileSync(join(root, ...relPath.split('/')));
    const compressed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const nameBytes = Buffer.from(relPath, 'utf8');
    const { dosTime, dosDate } = dosDateTime(statSync(join(root, ...relPath.split('/'))).mtime);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // local file header signature
    localHeader.writeUInt16LE(20, 4); // version needed to extract — 2.0 (deflate)
    localHeader.writeUInt16LE(0, 6); // general purpose flag
    localHeader.writeUInt16LE(8, 8); // compression method — deflate
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra field length

    localParts.push(localHeader, nameBytes, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // central directory file header signature
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed to extract
    centralHeader.writeUInt16LE(0, 8); // general purpose flag
    centralHeader.writeUInt16LE(8, 10); // compression method
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBytes.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra field length
    centralHeader.writeUInt16LE(0, 32); // comment length
    centralHeader.writeUInt16LE(0, 34); // disk number start
    centralHeader.writeUInt16LE(0, 36); // internal file attributes
    centralHeader.writeUInt32LE(0o644 << 16, 38); // external file attributes — unix rw-r--r--
    centralHeader.writeUInt32LE(offset, 42); // relative offset of local header

    centralParts.push(centralHeader, nameBytes);

    offset += localHeader.length + nameBytes.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const centralDirectoryOffset = offset;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // end of central directory signature
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk with central directory
  eocd.writeUInt16LE(relPaths.length, 8); // entries on this disk
  eocd.writeUInt16LE(relPaths.length, 10); // entries total
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(centralDirectoryOffset, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

/** DOS дата/время для заголовка ZIP — разрешение 2 секунды, диапазон с 1980 года. */
function dosDateTime(date) {
  const year = Math.max(date.getFullYear(), 1980);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  return { dosDate, dosTime };
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

/** @param {Buffer} buffer @returns {number} */
function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

main();
