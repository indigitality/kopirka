/** Теги: нормализация и операции (ORG-01, 05 §3.4). */
import type { TagRecord } from '../../shared/api.js';
import type { Db } from './db.js';

/** Нижний регистр, обрезаны края, внутренние пробелы схлопнуты. «Дизайн» и «  дизайн » — один тег. */
export function normalizeTagName(raw: string): string {
  return raw.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function normalizeTagList(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const item of raw) {
    const name = normalizeTagName(item);
    if (name !== '') seen.add(name);
  }
  return [...seen];
}

export function ensureTagId(db: Db, name: string): number {
  const existing = db.prepare(`SELECT id FROM tags WHERE name = ?`).get(name) as { id: number } | undefined;
  if (existing) return existing.id;
  const info = db
    .prepare(`INSERT INTO tags (name, created_at) VALUES (?, ?)`)
    .run(name, new Date().toISOString());
  return Number(info.lastInsertRowid);
}

export function setFileTags(db: Db, fileId: number, rawNames: readonly string[]): void {
  const names = normalizeTagList(rawNames);
  db.prepare(`DELETE FROM file_tags WHERE file_id = ?`).run(fileId);
  const insert = db.prepare(`INSERT OR IGNORE INTO file_tags (file_id, tag_id) VALUES (?, ?)`);
  for (const name of names) insert.run(fileId, ensureTagId(db, name));
  pruneOrphanTags(db);
}

export function addTagsToFiles(db: Db, fileIds: readonly number[], rawNames: readonly string[]): void {
  const names = normalizeTagList(rawNames);
  if (names.length === 0 || fileIds.length === 0) return;
  const insert = db.prepare(`INSERT OR IGNORE INTO file_tags (file_id, tag_id) VALUES (?, ?)`);
  for (const name of names) {
    const tagId = ensureTagId(db, name);
    for (const fileId of fileIds) insert.run(fileId, tagId);
  }
}

export function removeTagsFromFiles(db: Db, fileIds: readonly number[], rawNames: readonly string[]): void {
  const names = normalizeTagList(rawNames);
  if (names.length === 0 || fileIds.length === 0) return;
  const del = db.prepare(
    `DELETE FROM file_tags WHERE file_id = ? AND tag_id IN (SELECT id FROM tags WHERE name = ?)`,
  );
  for (const name of names) {
    for (const fileId of fileIds) del.run(fileId, name);
  }
  pruneOrphanTags(db);
}

/** Тег без единого файла не нужен в списке — иначе он копится мусором. */
export function pruneOrphanTags(db: Db): void {
  db.prepare(`DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM file_tags)`).run();
}

export function listTags(db: Db): TagRecord[] {
  const rows = db
    .prepare(
      `SELECT t.id, t.name,
              (SELECT COUNT(*) FROM file_tags ft
                 JOIN files f ON f.id = ft.file_id
                WHERE ft.tag_id = t.id AND f.deleted_at IS NULL) AS fileCount
         FROM tags t
        ORDER BY t.name COLLATE NOCASE ASC`,
    )
    .all() as Array<{ id: number; name: string; fileCount: number }>;
  return rows.map((row) => ({ id: row.id, name: row.name, fileCount: row.fileCount }));
}

export function tagsForFiles(db: Db, fileIds: readonly number[]): Map<number, string[]> {
  const result = new Map<number, string[]>();
  if (fileIds.length === 0) return result;
  const placeholders = fileIds.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT ft.file_id AS fileId, t.name AS name
         FROM file_tags ft JOIN tags t ON t.id = ft.tag_id
        WHERE ft.file_id IN (${placeholders})
        ORDER BY t.name COLLATE NOCASE ASC`,
    )
    .all(...fileIds) as Array<{ fileId: number; name: string }>;
  for (const row of rows) {
    const list = result.get(row.fileId);
    if (list) list.push(row.name);
    else result.set(row.fileId, [row.name]);
  }
  return result;
}
