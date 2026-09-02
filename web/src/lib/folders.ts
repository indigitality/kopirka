import type { FolderRecord } from '@shared/api';

export interface FlatFolder {
  folder: FolderRecord;
  depth: number;
}

/** Дерево → плоский список с глубиной. Нужен и сайдбару, и селекту папки. */
export function flattenFolders(folders: readonly FolderRecord[], depth = 0): FlatFolder[] {
  const result: FlatFolder[] = [];
  for (const folder of folders) {
    result.push({ folder, depth });
    if (folder.children.length > 0) result.push(...flattenFolders(folder.children, depth + 1));
  }
  return result;
}

/**
 * То же, но свёрнутые папки не отдают детей — список для сайдбара.
 * Свёрнутость приходит снаружи (стор вида), дерево о ней не знает.
 */
export function flattenVisibleFolders(
  folders: readonly FolderRecord[],
  collapsed: ReadonlySet<number>,
  depth = 0,
): FlatFolder[] {
  const result: FlatFolder[] = [];
  for (const folder of folders) {
    result.push({ folder, depth });
    if (folder.children.length > 0 && !collapsed.has(folder.id)) {
      result.push(...flattenVisibleFolders(folder.children, collapsed, depth + 1));
    }
  }
  return result;
}

/** Найти папку в дереве по id. */
export function findFolder(
  folders: readonly FolderRecord[],
  id: number,
): FolderRecord | null {
  for (const folder of folders) {
    if (folder.id === id) return folder;
    const found = findFolder(folder.children, id);
    if (found) return found;
  }
  return null;
}

/**
 * Папка и всё её поддерево — решение D2 от 02.09.2026: открытая папка показывает
 * и содержимое вложенных. Нужен, чтобы понять, ушёл файл из вида или остался.
 */
export function folderSubtreeIds(folders: readonly FolderRecord[], id: number): Set<number> {
  const result = new Set<number>();
  const root = findFolder(folders, id);
  if (!root) return result;
  const walk = (folder: FolderRecord) => {
    result.add(folder.id);
    folder.children.forEach(walk);
  };
  walk(root);
  return result;
}

/** Рекурсивная правка одной папки в дереве. Возвращает новое дерево. */
export function mapFolderTree(
  folders: readonly FolderRecord[],
  id: number,
  update: (folder: FolderRecord) => FolderRecord,
): FolderRecord[] {
  return folders.map((folder) =>
    folder.id === id
      ? update(folder)
      : { ...folder, children: mapFolderTree(folder.children, id, update) },
  );
}

/** Рекурсивное удаление папки из дерева. */
export function removeFolder(folders: readonly FolderRecord[], id: number): FolderRecord[] {
  return folders
    .filter((folder) => folder.id !== id)
    .map((folder) => ({ ...folder, children: removeFolder(folder.children, id) }));
}
