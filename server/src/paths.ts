/** Раскладка библиотеки на диске (05 §4) и защита от выхода за её пределы. */
import fs from 'node:fs';
import path from 'node:path';

export const ORIGINALS_DIR = 'originals';
export const PREVIEWS_DIR = 'previews';
export const DB_FILENAME = 'library.db';

export function ensureLibraryLayout(libraryPath: string): void {
  fs.mkdirSync(path.join(libraryPath, ORIGINALS_DIR), { recursive: true });
  fs.mkdirSync(path.join(libraryPath, PREVIEWS_DIR), { recursive: true });
}

export function dbPath(libraryPath: string): string {
  return path.join(libraryPath, DB_FILENAME);
}

/** originals/ab/cd/<sha256>.<ext> — шардирование по первым 4 hex-символам. */
export function storageRelpath(sha256: string, ext: string): string {
  return `${ORIGINALS_DIR}/${sha256.slice(0, 2)}/${sha256.slice(2, 4)}/${sha256}.${ext}`;
}

export function previewRelpath(sha256: string): string {
  return `${PREVIEWS_DIR}/${sha256.slice(0, 2)}/${sha256.slice(2, 4)}/${sha256}.webp`;
}

/**
 * FDB-04 — крупное превью для широкой колонки на Retina. Лежит рядом с обычным
 * и в базе не хранится: путь однозначно выводится из sha256, а генерируется файл
 * лениво при первом запросе — старым библиотекам миграция не нужна.
 */
export function preview2xRelpath(sha256: string): string {
  return `${PREVIEWS_DIR}/${sha256.slice(0, 2)}/${sha256.slice(2, 4)}/${sha256}@2x.webp`;
}

/**
 * Относительный путь из БД → абсолютный, с проверкой что он остался внутри библиотеки.
 * Пути приходят снаружи (в том числе из старой БД), поэтому `../` обязан отсекаться.
 */
export function resolveInLibrary(libraryPath: string, relpath: string): string {
  const root = path.resolve(libraryPath);
  const abs = path.resolve(root, relpath);
  const withSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (abs !== root && !abs.startsWith(withSep)) {
    throw new Error(`Путь вне библиотеки: ${relpath}`);
  }
  return abs;
}

export function ensureParentDir(absPath: string): void {
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
}

/** Размер библиотеки на диске — для экрана настроек. */
export function directorySize(dir: string): number {
  let total = 0;
  const stack: string[] = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) {
        try {
          total += fs.statSync(full).size;
        } catch {
          // Файл мог исчезнуть между readdir и stat — не повод падать.
        }
      }
    }
  }
  return total;
}

export function safeUnlink(absPath: string): void {
  try {
    fs.unlinkSync(absPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') throw error;
  }
}
