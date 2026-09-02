import type { Meta, StoryObj } from '@storybook/react-vite';
import { Copy, Plus } from 'lucide-react';
import { Button } from './Button';

const meta = {
  title: 'Примитивы/Кнопка',
  component: Button,
  args: { children: 'Скопировать', variant: 'secondary', size: 'md' },
  argTypes: {
    variant: {
      control: 'inline-radio',
      options: ['primary', 'secondary', 'ghost', 'danger', 'danger-solid'],
    },
    size: { control: 'inline-radio', options: ['sm', 'md'] },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Основная: Story = {
  args: { variant: 'primary', icon: <Copy />, hotkey: '⌘C' },
};

export const Вторичная: Story = {};

export const Призрачная: Story = {
  args: { variant: 'ghost', children: 'Отмена' },
};

export const Опасная: Story = {
  args: { variant: 'danger', children: 'Удалить папку' },
};

/**
 * Необратимое действие: мягкий `danger` на тёмном фоне по весу равен «Отмене»,
 * поэтому у удаления навсегда — сплошная заливка (дизайн-аудит 4.22).
 */
export const ОпаснаяСплошная: Story = {
  name: 'Опасная · сплошная',
  args: { variant: 'danger-solid', children: 'Удалить навсегда' },
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="secondary">Отмена</Button>
      <Button {...args} />
    </div>
  ),
};

/** Наведение, фокус с клавиатуры и нажатие — без мыши, через pseudo-states. */
export const Состояния: Story = {
  args: { variant: 'primary', icon: <Plus /> },
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      <Button {...args}>Покой</Button>
      <Button {...args} className="pseudo-hover">Наведение</Button>
      <Button {...args} className="pseudo-focus-visible">Фокус</Button>
      <Button {...args} className="pseudo-active">Нажатие</Button>
      <Button {...args} disabled>Отключена</Button>
    </div>
  ),
  parameters: { pseudo: { hover: ['.pseudo-hover'], focusVisible: ['.pseudo-focus-visible'], active: ['.pseudo-active'] } },
};

/**
 * Нажатие во всех вариантах: `scale .98` и затемнение фона на 6%.
 * До 02.09.2026 кнопки на нажатие не отзывались вовсе (аудит 4.33).
 */
export const Нажатие: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="primary" className="pseudo-active">Основная</Button>
      <Button variant="secondary" className="pseudo-active">Вторичная</Button>
      <Button variant="ghost" className="pseudo-active">Призрачная</Button>
      <Button variant="danger" className="pseudo-active">Опасная</Button>
      <Button variant="danger-solid" className="pseudo-active">Удалить навсегда</Button>
    </div>
  ),
  parameters: { pseudo: { active: ['.pseudo-active'] } },
};

export const Размеры: Story = {
  render: (args) => (
    <div className="flex items-center gap-3">
      <Button {...args} size="sm">Маленькая</Button>
      <Button {...args} size="md">Обычная</Button>
    </div>
  ),
};
