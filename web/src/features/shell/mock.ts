/**
 * Фикстура дерева папок — только для витрины примитивов (`?kit`).
 * Приложение живых данных отсюда не берёт: сайдбар и сетка ходят в API
 * через `LibraryProvider` (`listFolders()` / `getStats()` / `listFiles()`).
 */
import type { FolderRecord } from '@shared/api';

let nextId = 1;

function folder(name: string, fileCount: number, children: FolderRecord[] = []): FolderRecord {
  const id = nextId++;
  return {
    id,
    name,
    parentFolderId: null,
    sortOrder: id,
    createdAt: '2026-08-01T10:00:00.000Z',
    fileCount,
    /* D2: родительская папка показывает всё поддерево — счётчик суммарный. */
    totalFileCount: fileCount + children.reduce((sum, child) => sum + child.totalFileCount, 0),
    children: children.map((child) => ({ ...child, parentFolderId: id })),
  };
}

export const mockFolders: FolderRecord[] = [
  /* Третий уровень — с 02.09.2026 глубина дерева не ограничена (PRD §5.6). */
  folder('Интерфейсы', 214, [
    folder('Дашборды', 86, [folder('Аналитика', 24), folder('Финансовые сводки и отчёты', 18)]),
    folder('Онбординг', 41),
    folder('Формы и поля', 33),
  ]),
  folder('Айдентика', 158, [folder('Логотипы', 74), folder('Гайдлайны', 29)]),
  folder('Веб-сайты', 302, [folder('Лендинги', 128), folder('Портфолио', 57)]),
  folder('Типографика', 96),
  folder('Иллюстрация', 74),
  folder('Цвет и градиенты', 52),
];
