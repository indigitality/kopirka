import type { Meta, StoryObj } from '@storybook/react-vite';
import type { FolderRecord, StatsResponse } from '@shared/api';
import { FolderRow, ScopeRow, SCOPES, type DropState } from './Sidebar';
import { mockFolders } from './mock';

const [parent] = mockFolders;
if (!parent) throw new Error('Фикстура папок пуста');
const [child] = parent.children;
if (!child) throw new Error('У корневой папки фикстуры нет вложенной');
const [grandchild] = child.children;
if (!grandchild) throw new Error('У вложенной папки фикстуры нет третьего уровня');

const [libraryScope, untaggedScope, trashScope] = SCOPES;
if (!libraryScope || !untaggedScope || !trashScope) throw new Error('Разделы сайдбара пусты');

const stats: StatsResponse = { library: 214, untagged: 8, trash: 12, similar: 3 };

const longName: FolderRecord = {
  ...parent,
  id: 9001,
  name: 'Очень длинное название папки, которое не влезает',
  children: [],
};

/* Свёрнутая папка: вложенные есть, поэтому слот иконки — переключатель. */
const collapsedParent: FolderRecord = { ...parent, id: 9003 };

const noop = () => {};

/** Готовые состояния цели перетаскивания: указателем их на витрине не поймать. */
const DROP: Record<'accepts' | 'over' | 'denied', DropState> = {
  accepts: { accepts: true, aimed: false, over: false, denied: false },
  over: { accepts: true, aimed: true, over: true, denied: false },
  denied: { accepts: false, aimed: true, over: false, denied: true },
};

/**
 * Строка сайдбара — самый нагруженный элемент оболочки. Здесь разложены все
 * состояния с полки R13 «Строки сайдбара · состояния»: почти каждое возникает
 * только под курсором, и аддон pseudo-states рисует `:hover` без мыши.
 *
 * Порядок историй повторяет порядок на полке — так их удобно сверять рядом.
 */
const meta = {
  title: 'Оболочка/Строка сайдбара',
  component: FolderRow,
  decorators: [
    (Story) => (
      <div className="w-[240px] rounded-[var(--radius-panel)] bg-panel px-[var(--sidebar-pad-x)] py-3">
        <Story />
      </div>
    ),
  ],
  args: {
    folder: parent,
    depth: 0,
    active: false,
    collapsed: false,
    renaming: false,
    onSelect: noop,
    onToggle: noop,
    onCreateChild: noop,
  },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof FolderRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/* ── Разделы ─────────────────────────────────────────────────────────────── */

export const РазделПокой: Story = {
  name: 'Раздел · покой',
  render: () => <ScopeRow item={untaggedScope} active={false} count={stats.untagged} />,
};

export const РазделНаведение: Story = {
  name: 'Раздел · наведение — фон 10 %',
  render: () => <ScopeRow item={untaggedScope} active={false} count={stats.untagged} />,
  parameters: { pseudo: { hover: true } },
};

export const РазделВыбран: Story = {
  name: 'Раздел · выбран — фон 15 %, текст ярче',
  render: () => <ScopeRow item={libraryScope} active count={stats.library} />,
};

/* ── Папки ───────────────────────────────────────────────────────────────── */

export const ПапкаПокой: Story = {
  name: 'Папка · покой',
};

export const ПапкаНаведение: Story = {
  name: 'Папка · наведение — «+» и «⋮»',
  parameters: { pseudo: { hover: true } },
};

export const ПапкаВыбрана: Story = {
  name: 'Папка · выбрана',
  args: { active: true },
};

export const ВторойУровень: Story = {
  name: 'Папка 2 уровня · отступ 24',
  args: { folder: child, depth: 1 },
};

/**
 * Третий уровень. Ограничение `MAX_DEPTH = 1` снято 02.09.2026 — дерево любой
 * глубины по PRD §5.6, отступ прежний: 12 px на уровень.
 */
export const ТретийУровень: Story = {
  name: 'Папка 3 уровня · отступ 36',
  args: { folder: grandchild, depth: 2 },
};

/* ── Перетаскивание ──────────────────────────────────────────────────────── */

export const ЦельМожно: Story = {
  name: 'Цель перетаскивания — сюда можно',
  args: { dropPreview: DROP.over },
};

export const ЦельНельзя: Story = {
  name: 'Цель перетаскивания — сюда нельзя',
  render: () => (
    <ScopeRow item={trashScope} active={false} count={stats.trash} dropPreview={DROP.denied} />
  ),
};

export const ТащимПапку: Story = {
  name: 'Тащим папку · куда можно вложить — пунктир',
  args: { dropPreview: DROP.accepts },
};

/* ── Иконка как переключатель ────────────────────────────────────────────── */

/**
 * Наведение именно на слот иконки: папка сменяется шевроном, и видно, что по
 * нему кликают. Аддон псевдосостояний ставит `:hover` на корневую строку —
 * поэтому здесь показан весь ряд, а шеврон проявится под настоящим курсором.
 */
export const РаскрытаКурсорНаИконке: Story = {
  name: 'Папка раскрыта · курсор на иконке → шеврон «свернуть»',
  parameters: { pseudo: { hover: true } },
};

export const СвёрнутаКурсорНаИконке: Story = {
  name: 'Папка свёрнута · курсор на иконке → шеврон «раскрыть»',
  args: { folder: collapsedParent, collapsed: true },
  parameters: { pseudo: { hover: true } },
};

/* ── Переименование ──────────────────────────────────────────────────────── */

export const Переименование: Story = {
  name: 'Переименование — поле поверх строки',
  args: { renaming: true },
};

/* ── Длинное имя ─────────────────────────────────────────────────────────── */

/**
 * Счётчик — `totalFileCount`: файлы папки вместе с подпапками (решение D2).
 * В покое он на месте трейлинг-кнопок, под курсором уходит и пускает их.
 */
export const Счётчик: Story = {
  name: 'Счётчик поддерева',
  render: (args) => (
    <div className="flex flex-col gap-0.5">
      <FolderRow {...args} folder={parent} depth={0} />
      <FolderRow {...args} folder={child} depth={1} />
      <FolderRow {...args} folder={grandchild} depth={2} />
    </div>
  ),
};

export const ДлинноеИмя: Story = {
  name: 'Длинное имя · покой — затухание 40 справа',
  args: { folder: longName },
};

/**
 * Наведение проигрывает обе фазы подряд: пауза 400 мс, потом имя едет со
 * скоростью 40 px/с — иконка прячется, слева появляется затухание 24, справа
 * держится 40; доехав, имя стоит с одним левым затуханием. Курсор ушёл —
 * возврат за 260 мс.
 */
export const ДлинноеИмяНаведение: Story = {
  name: 'Длинное имя · едет и доезжает',
  args: { folder: longName },
  parameters: { pseudo: { hover: true } },
};
