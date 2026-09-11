/** Папки (ORG-02). Файл принадлежит не более чем одной папке; удаление папки файлы не удаляет (5.4). */
import type { FolderRecord } from '../../shared/api.js';
import type { Db } from './db.js';
import { badRequest, conflict, notFound } from './errors.js';

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

/** Суммарный счётчик по поддереву: один проход снизу вверх, без запроса на каждую папку. */
function fillTotals(node: FolderRecord): number {
  let total = node.fileCount;
  for (const child of node.children) total += fillTotals(child);
  node.totalFileCount = total;
  return total;
}

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
      totalFileCount: row.fileCount,
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
  for (const root of roots) fillTotals(root);
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
    // Одна папка вне дерева: суммарный счётчик считаем тем же CTE, одним запросом.
    totalFileCount: subtreeFileCount(db, id),
    children: [],
  };
}

/** Файлы в папке и всех её подпапках, не считая корзину. */
export function subtreeFileCount(db: Db, rootId: number): number {
  const ids = subtreeIds(db, rootId);
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const row = db
    .prepare(`SELECT COUNT(*) AS c FROM files WHERE deleted_at IS NULL AND folder_id IN (${placeholders})`)
    .get(...ids) as { c: number };
  return row.c;
}

export function folderExists(db: Db, id: number): boolean {
  return (db.prepare(`SELECT 1 AS ok FROM folders WHERE id = ?`).get(id) as { ok: number } | undefined) !== undefined;
}

export function assertFolderExists(db: Db, id: number): void {
  if (!folderExists(db, id)) throw notFound(`Папка ${id} не найдена`, 'folder_not_found');
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

/**
 * Идентификаторы папки и всего её поддерева. Единственное место с этим рекурсивным CTE —
 * им пользуются и удаление папки, и фильтр списка файлов (решение 02.09.2026).
 * Несуществующая папка даёт пустой массив.
 */
export function subtreeIds(db: Db, rootId: number): number[] {
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
        throw conflict('Нельзя вложить папку в саму себя', 'folder_cycle');
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

/**
 * NEW-03 — перенос папки перетаскиванием (макеты D09–D12 от 11.09.2026).
 *
 * Порядок хранится в `sort_order` — колонка есть с первой миграции, отдельная
 * миграция не нужна. Переносом порядок среди новых братьев перенумеровывается
 * подряд 0…n−1: так индекс из интерфейса («вставить выше третьей») переживает
 * любые прежние дыры в нумерации, а выдача `listFolders` (ORDER BY sort_order)
 * совпадает с тем, что видел пользователь.
 *
 * Глубина не ограничена: `MAX_DEPTH` снят решением D2/D8 от 02.09.2026 и в коде
 * его нет — проверять нечего.
 */
export function moveFolder(db: Db, id: number, parentId: number | null, index: number): FolderRecord {
  assertFolderExists(db, id);
  if (parentId !== null) {
    assertFolderExists(db, parentId);
    // Себя и собственного потомка новым родителем быть не может — дерево развалилось бы.
    if (subtreeIds(db, id).includes(parentId)) {
      throw conflict('Нельзя вложить папку в саму себя', 'folder_cycle');
    }
  }

  db.transaction(() => {
    const siblings = (
      db
        .prepare(
          parentId === null
            ? `SELECT id FROM folders WHERE parent_folder_id IS NULL AND id <> ?
                ORDER BY sort_order ASC, name COLLATE NOCASE ASC, id ASC`
            : `SELECT id FROM folders WHERE parent_folder_id = ? AND id <> ?
                ORDER BY sort_order ASC, name COLLATE NOCASE ASC, id ASC`,
        )
        .all(...(parentId === null ? [id] : [parentId, id])) as Array<{ id: number }>
    ).map((row) => row.id);

    // Индекс из интерфейса приходит по видимому списку — прижимаем его к границам.
    const at = Math.min(Math.max(index, 0), siblings.length);
    siblings.splice(at, 0, id);

    db.prepare(`UPDATE folders SET parent_folder_id = ? WHERE id = ?`).run(parentId, id);
    const setOrder = db.prepare(`UPDATE folders SET sort_order = ? WHERE id = ?`);
    siblings.forEach((siblingId, position) => setOrder.run(position, siblingId));
  })();

  const moved = getFolderFlat(db, id);
  if (!moved) throw notFound(`Папка ${id} не найдена`, 'folder_not_found');
  return moved;
}
