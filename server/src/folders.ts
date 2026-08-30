/** Папки (ORG-02). Файл принадлежит не более чем одной папке; удаление папки файлы не удаляет (5.4). */
import type { FolderRecord } from '../../shared/api.js';
import type { Db } from './db.js';
import { badRequest, notFound } from './errors.js';

interface FolderRow {
  id: number;
  name: string;
  parent_folder_id: number | null;
  sort_order: number;
  created_at: string;
  fileCount: number;
}

const SELECT_FOLDERS = `
  SELECT f.id, f.name, f.parent_folder_id, f.sort_order, f.created_at,
         (SELECT COUNT(*) FROM files x WHERE x.folder_id = f.id AND x.deleted_at IS NULL) AS fileCount
    FROM folders f
   ORDER BY f.sort_order ASC, f.name COLLATE NOCASE ASC, f.id ASC`;

export function listFolders(db: Db): FolderRecord[] {
  const rows = db.prepare(SELECT_FOLDERS).all() as FolderRow[];
  const byId = new Map<number, FolderRecord>();
  for (const row of rows) {
    byId.set(row.id, {
      id: row.id,
      name: row.name,
      parentFolderId: row.parent_folder_id,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      fileCount: row.fileCount,
      children: [],
    });
  }
  const roots: FolderRecord[] = [];
  for (const row of rows) {
    const node = byId.get(row.id);
    if (!node) continue;
    const parent = row.parent_folder_id === null ? undefined : byId.get(row.parent_folder_id);
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export function getFolderFlat(db: Db, id: number): FolderRecord | null {
  const row = db
    .prepare(
      `SELECT f.id, f.name, f.parent_folder_id, f.sort_order, f.created_at,
              (SELECT COUNT(*) FROM files x WHERE x.folder_id = f.id AND x.deleted_at IS NULL) AS fileCount
         FROM folders f WHERE f.id = ?`,
    )
    .get(id) as FolderRow | undefined;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    parentFolderId: row.parent_folder_id,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    fileCount: row.fileCount,
    children: [],
  };
}

export function assertFolderExists(db: Db, id: number): void {
  const row = db.prepare(`SELECT 1 AS ok FROM folders WHERE id = ?`).get(id) as { ok: number } | undefined;
  if (!row) throw notFound(`Папка ${id} не найдена`, 'folder_not_found');
}

function nextSortOrder(db: Db, parentId: number | null): number {
  const row = db
    .prepare(
      parentId === null
        ? `SELECT COALESCE(MAX(sort_order), -1) AS m FROM folders WHERE parent_folder_id IS NULL`
        : `SELECT COALESCE(MAX(sort_order), -1) AS m FROM folders WHERE parent_folder_id = ?`,
    )
    .get(...(parentId === null ? [] : [parentId])) as { m: number };
  return row.m + 1;
}

export function createFolder(db: Db, name: string, parentFolderId: number | null): FolderRecord {
  const clean = name.trim();
  if (clean === '') throw badRequest('Имя папки не может быть пустым', 'invalid_name');
  if (parentFolderId !== null) assertFolderExists(db, parentFolderId);
  const info = db
    .prepare(`INSERT INTO folders (name, parent_folder_id, sort_order, created_at) VALUES (?, ?, ?, ?)`)
    .run(clean, parentFolderId, nextSortOrder(db, parentFolderId), new Date().toISOString());
  const created = getFolderFlat(db, Number(info.lastInsertRowid));
  if (!created) throw new Error('Папка не создалась');
  return created;
}

function subtreeIds(db: Db, rootId: number): number[] {
  const rows = db
    .prepare(
      `WITH RECURSIVE sub(id) AS (
         SELECT id FROM folders WHERE id = ?
         UNION ALL
         SELECT f.id FROM folders f JOIN sub ON f.parent_folder_id = sub.id
       ) SELECT id FROM sub`,
    )
    .all(rootId) as Array<{ id: number }>;
  return rows.map((row) => row.id);
}

export function updateFolder(
  db: Db,
  id: number,
  patch: { name?: string; parentFolderId?: number | null; sortOrder?: number },
): FolderRecord {
  assertFolderExists(db, id);
  if (patch.name !== undefined) {
    const clean = patch.name.trim();
    if (clean === '') throw badRequest('Имя папки не может быть пустым', 'invalid_name');
    db.prepare(`UPDATE folders SET name = ? WHERE id = ?`).run(clean, id);
  }
  if (patch.parentFolderId !== undefined) {
    if (patch.parentFolderId !== null) {
      assertFolderExists(db, patch.parentFolderId);
      // Папку нельзя вложить в саму себя или в собственного потомка — иначе дерево развалится.
      if (subtreeIds(db, id).includes(patch.parentFolderId)) {
        throw badRequest('Папку нельзя переместить внутрь самой себя', 'folder_cycle');
      }
    }
    db.prepare(`UPDATE folders SET parent_folder_id = ? WHERE id = ?`).run(patch.parentFolderId, id);
  }
  if (patch.sortOrder !== undefined) {
    db.prepare(`UPDATE folders SET sort_order = ? WHERE id = ?`).run(patch.sortOrder, id);
  }
  const updated = getFolderFlat(db, id);
  if (!updated) throw notFound(`Папка ${id} не найдена`, 'folder_not_found');
  return updated;
}

/** Удаляет папку со всем поддеревом. Файлы не удаляются — им проставляется folder_id = NULL (5.4). */
export function deleteFolder(db: Db, id: number): { deletedFolders: number; detachedFiles: number } {
  assertFolderExists(db, id);
  return db.transaction(() => {
    const ids = subtreeIds(db, id);
    const placeholders = ids.map(() => '?').join(',');
    const detached = db
      .prepare(`UPDATE files SET folder_id = NULL WHERE folder_id IN (${placeholders})`)
      .run(...ids);
    db.prepare(`DELETE FROM folders WHERE id IN (${placeholders})`).run(...ids);
    return { deletedFolders: ids.length, detachedFiles: detached.changes };
  })();
}
