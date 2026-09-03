import type { Meta, StoryObj } from '@storybook/react-vite';
import { SelectionBar } from './SelectionBar';

/**
 * Канон — R06 · «Панель выделения» и R13 · «Стекло и движение».
 * Стекло проверяется только на пёстрой подложке: панель обязана подмешивать
 * цвет снизу, а край `line-strong` — держать границу.
 */
const meta = {
  title: 'Примитивы/Панель выделения',
  component: SelectionBar,
  args: {
    count: 3,
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

export const МногоФайлов: Story = {
  name: 'Много файлов',
  args: { count: 128 },
  render: (args) => (
    <div className="flex min-h-[220px] items-center justify-center bg-app p-6">
      <SelectionBar {...args} />
    </div>
  ),
};
