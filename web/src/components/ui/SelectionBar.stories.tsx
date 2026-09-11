import type { Meta, StoryObj } from '@storybook/react-vite';
import { SelectionBar } from './SelectionBar';

/**
 * Канон — R06 · «Панель выделения», R13 · «Стекло и движение» и доработки
 * 11.09.2026 (D21 / D21b / D22: чекбокс «выбрать все» и счётчик «из N»).
 * Стекло проверяется только на пёстрой подложке: панель обязана подмешивать
 * цвет снизу, а край `line-strong` — держать границу.
 */
const meta = {
  title: 'Примитивы/Панель выделения',
  component: SelectionBar,
  args: {
    count: 7,
    total: 142,
    onToggleAll: () => {},
    onMoveToFolder: () => {},
    onTag: () => {},
    onDelete: () => {},
    onCancel: () => {},
  },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof SelectionBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** На светлом и тёмном разом — как в узле «Панель · Стекло» полки R13. */
export const НаПревью: Story = {
  name: 'Стекло · на превью',
  render: (args) => (
    <div className="flex min-h-[220px] items-center justify-center bg-linear-115 from-[#EDEDE9] via-[#C8D0DA] via-38% to-[#22232A] p-6">
      <SelectionBar {...args} />
    </div>
  ),
};

/** На фоне окна: так панель выглядит в приложении, над сеткой. */
export const НаФонеОкна: Story = {
  name: 'На фоне окна',
  render: (args) => (
    <div className="flex min-h-[220px] items-center justify-center bg-app p-6">
      <SelectionBar {...args} />
    </div>
  ),
};

/** D21b — выбраны все: чекбокс со сплошной галкой и подпись «Выбраны все N». */
export const ВыбраныВсе: Story = {
  name: 'Выбраны все',
  args: { count: 142, total: 142 },
  render: (args) => (
    <div className="flex min-h-[220px] items-center justify-center bg-app p-6">
      <SelectionBar {...args} />
    </div>
  ),
};

/** Один файл из большой библиотеки — минимальный счётчик. */
export const ОдинФайл: Story = {
  name: 'Один файл',
  args: { count: 1, total: 142 },
  render: (args) => (
    <div className="flex min-h-[220px] items-center justify-center bg-app p-6">
      <SelectionBar {...args} />
    </div>
  ),
};
