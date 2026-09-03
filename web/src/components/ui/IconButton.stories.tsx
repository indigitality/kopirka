import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChevronLeft, EllipsisVertical, Trash2, X } from 'lucide-react';
import { Icon } from '@/lib/icons';
import { IconButton } from './IconButton';

/**
 * Канон — R13 · «Кнопка-иконка 32×32 · обычная и опасная» и стеклянные кнопки
 * детального просмотра R09 (крестик 32, круглые стрелки 40).
 */
const meta = {
  title: 'Примитивы/Кнопка-иконка',
  component: IconButton,
  args: { label: 'Закрыть', children: <Icon icon={X} /> },
  argTypes: {
    variant: { control: 'inline-radio', options: ['ghost', 'secondary', 'danger', 'glass'] },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    shape: { control: 'inline-radio', options: ['square', 'round'] },
  },
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Пара с полки: обычная на `control` и опасная на `danger-tint`. */
export const Полка: Story = {
  name: 'Полка · обычная и опасная',
  render: () => (
    <div className="flex items-center gap-2 rounded-panel bg-panel p-5">
      <IconButton label="Закрыть" variant="secondary">
        <Icon icon={X} />
      </IconButton>
      <IconButton label="Удалить" variant="danger">
        <Icon icon={Trash2} />
      </IconButton>
    </div>
  ),
};

export const Призрачная: Story = {
  args: { variant: 'ghost', label: 'Меню папки', children: <Icon icon={EllipsisVertical} /> },
};

/**
 * Стекло: кнопки просмотра лежат прямо на картинке — фон подмешивается
 * `backdrop-filter`, край держит `line-strong`. В Paper это не рендерится,
 * поэтому единственное честное место для проверки — витрина.
 */
export const Стекло: Story = {
  name: 'Стекло · на превью',
  render: () => (
    <div className="flex items-center gap-3 rounded-card bg-linear-to-br from-[#EDEDE8] to-[#C6CBD4] p-6">
      <IconButton label="Назад" variant="glass" size="lg" shape="round">
        <Icon icon={ChevronLeft} />
      </IconButton>
      <IconButton label="Закрыть просмотр" variant="glass">
        <Icon icon={X} />
      </IconButton>
    </div>
  ),
};

export const Размеры: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <IconButton label="28" variant="secondary" size="sm">
        <Icon icon={X} />
      </IconButton>
      <IconButton label="32" variant="secondary" size="md">
        <Icon icon={X} />
      </IconButton>
      <IconButton label="40" variant="secondary" size="lg" shape="round">
        <Icon icon={X} />
      </IconButton>
    </div>
  ),
};

export const Состояния: Story = {
  args: { variant: 'secondary' },
  render: (args) => (
    <div className="flex items-center gap-3">
      <IconButton {...args} label="Покой" />
      <IconButton {...args} label="Наведение" className="pseudo-hover" />
      <IconButton {...args} label="Фокус" className="pseudo-focus-visible" />
      <IconButton {...args} label="Нажатие" className="pseudo-active" />
      <IconButton {...args} label="Отключена" disabled />
    </div>
  ),
  parameters: {
    pseudo: {
      hover: ['.pseudo-hover'],
      focusVisible: ['.pseudo-focus-visible'],
      active: ['.pseudo-active'],
    },
  },
};
