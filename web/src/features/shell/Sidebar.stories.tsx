/**
 * Сайдбар целиком — NEW-01 (макеты D06–D08 от 11.09.2026).
 *
 * Отдельно от «Оболочки»: там проверяют панели и зазоры всего окна, здесь —
 * поведение группы папок, когда их много. Главное, что должно быть видно:
 * логотип, разделы, заголовок «ПАПКИ» и подвал стоят на своих местах при любом
 * числе папок, строка всегда 32, а едет только дерево.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { FolderRecord, StatsResponse } from '@shared/api';
import { Sidebar } from './Sidebar';
import { mockFolders } from './mock';

const stats: StatsResponse = { library: 214, untagged: 8, trash: 12, similar: 3 };

/**
 * Сорок папок в трёх уровнях — ровно тот случай из D06, где панель раньше
 * сжимала строки. Имена настоящие по духу, а не «Папка 17»: короткие и длинные
 * вперемешку, чтобы заодно было видно затухание длинного имени.
 */
const GROUPS: Array<[string, number, string[]]> = [
  ['Дашборды', 62, ['Аналитика', 'Финтех', 'Админки', 'Метрики продукта']],
  ['Интерфейсы', 84, ['Навигация', 'Пустые состояния', 'Онбординг', 'Настройки']],
  ['Лендинги', 73, ['SaaS', 'Агентства', 'Инфопродукты', 'Промо-страницы событий']],
  ['Айдентика', 41, ['Логотипы', 'Гайдлайны', 'Мерч']],
  ['Типографика', 34, ['Наборные сетки', 'Шрифтовые пары', 'Крупный набор']],
  ['Иллюстрация', 28, ['Редакционная', 'Иконки', 'Паттерны']],
  ['Моушен', 16, ['Переходы', 'Микроанимации']],
  ['Мобильное', 22, ['iOS', 'Android']],
  ['Архив 2023', 47, []],
  ['Референсы клиентов', 12, []],
];

let nextId = 1;

function make(name: string, fileCount: number, childNames: readonly string[]): FolderRecord {
  const id = nextId++;
  const children = childNames.map((childName) => {
    const childId = nextId++;
    return {
      id: childId,
      name: childName,
      parentFolderId: id,
      sortOrder: childId,
      createdAt: '2026-09-01T10:00:00.000Z',
      fileCount: 7 + (childId % 13),
      totalFileCount: 7 + (childId % 13),
      children: [],
    } satisfies FolderRecord;
  });
  return {
    id,
    name,
    parentFolderId: null,
    sortOrder: id,
    createdAt: '2026-09-01T10:00:00.000Z',
    fileCount,
    /* D2 — родитель показывает всё поддерево. */
    totalFileCount: fileCount + children.reduce((sum, child) => sum + child.totalFileCount, 0),
    children,
  };
}

const manyFolders: FolderRecord[] = GROUPS.map(([name, count, children]) =>
  make(name, count, children),
);

const meta = {
  title: 'Экраны/Сайдбар',
  component: Sidebar,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      /* Окно 900 по высоте — то же, что в разборе D08: область дерева ровно 539. */
      <div className="h-[900px] w-full bg-app p-[var(--shell-pad)]">
        <Story />
      </div>
    ),
  ],
  args: { folders: mockFolders, stats },
} satisfies Meta<typeof Sidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Обычный: Story = {
  name: 'Обычное дерево',
};

/**
 * D06 — сорок папок. Шапка и подвал на местах, строки 32, дерево прокручивается,
 * у правого поля области — полоса 4 px, у нижнего края — затухание 40.
 */
export const СорокПапок: Story = {
  name: '40 папок — область прокручивается',
  args: { folders: manyFolders },
};
