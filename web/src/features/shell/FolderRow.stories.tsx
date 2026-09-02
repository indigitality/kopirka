import type { Meta, StoryObj } from '@storybook/react-vite';
import type { FolderRecord } from '@shared/api';
import { FolderRow } from './Sidebar';
import { mockFolders } from './mock';

const [parent] = mockFolders;
if (!parent) throw new Error('Фикстура папок пуста');
const [child] = parent.children;
if (!child) throw new Error('У корневой папки фикстуры нет вложенной');
const [grandchild] = child.children;
if (!grandchild) throw new Error('У вложенной папки фикстуры нет третьего уровня');

const longName: FolderRecord = {
  ...parent,
  id: 9001,
  name: 'Очень длинное название папки',
  children: [],
};

/* Третий уровень с длинным именем: отступ 24 px съедает окно, имя должно ехать. */
const deepLongName: FolderRecord = {
  ...grandchild,
  id: 9002,
  name: 'Финансовые сводки и отчёты за год',
  children: [],
};

const noop = () => {};

/**
 * Строка дерева папок — самый нагруженный элемент сайдбара: у неё восемь
 * состояний, и почти все возникают только под курсором. Здесь они разложены
 * рядом: аддон pseudo-states рисует :hover без мыши.
 */
const meta = {
  title: 'Оболочка/Строка папки',
  component: FolderRow,
  decorators: [
    (Story) => (
      <div className="w-[240px] bg-surface px-4 py-2">
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

export const Покой: Story = {};

export const Свёрнута: Story = {
  args: { collapsed: true },
};

export const Наведение: Story = {
  parameters: { pseudo: { hover: true } },
};

export const Выбрана: Story = {
  args: { active: true },
};

export const ВыбранаИНаведение: Story = {
  name: 'Выбрана + наведение',
  args: { active: true },
  parameters: { pseudo: { hover: true } },
};

export const ВторойУровень: Story = {
  name: 'Второй уровень',
  args: { folder: child, depth: 1 },
};

export const ВторойУровеньНаведение: Story = {
  name: 'Второй уровень · наведение',
  args: { folder: child, depth: 1 },
  parameters: { pseudo: { hover: true } },
};

/**
 * Третий уровень. Ограничение `MAX_DEPTH = 1` снято 02.09.2026 — дерево любой
 * глубины по PRD §5.6, отступ прежний: 12 px на уровень.
 */
export const ТретийУровень: Story = {
  name: 'Третий уровень',
  args: { folder: grandchild, depth: 2 },
};

export const ТретийУровеньНаведение: Story = {
  name: 'Третий уровень · длинное имя, наведение',
  args: { folder: deepLongName, depth: 2 },
  parameters: { pseudo: { hover: true } },
};

/**
 * Счётчик — `totalFileCount`: файлы папки вместе с подпапками (решение D2).
 * В покое он на месте трейлинг-кнопок, под курсором уходит и пускает их.
 */
export const Счётчик: Story = {
  name: 'Счётчик поддерева',
  render: (args) => (
    <div className="flex flex-col">
      <FolderRow {...args} folder={parent} depth={0} />
      <FolderRow {...args} folder={child} depth={1} />
      <FolderRow {...args} folder={grandchild} depth={2} />
    </div>
  ),
};

export const ДлинноеИмя: Story = {
  name: 'Длинное имя · покой',
  args: { folder: longName },
};

export const ДлинноеИмяНаведение: Story = {
  name: 'Длинное имя · наведение',
  args: { folder: longName },
  parameters: { pseudo: { hover: true } },
};

export const Переименование: Story = {
  args: { renaming: true },
};
