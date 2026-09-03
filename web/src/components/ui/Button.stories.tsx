import type { Meta, StoryObj } from '@storybook/react-vite';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { Icon } from '@/lib/icons';
import { Button } from './Button';

/**
 * Канон — R13 · «Кнопки и контролы · высота 32». Сверять стоит три вещи:
 * высоту 32 и поля 12, текст 14/18 · 500 и то, что подложки полупрозрачные
 * (`--color-control`), а не плотные.
 */
const meta = {
  title: 'Примитивы/Кнопка',
  component: Button,
  args: { children: 'Скопировать', variant: 'secondary', size: 'md' },
  argTypes: {
    variant: {
      control: 'inline-radio',
      options: ['primary', 'secondary', 'ghost', 'danger', 'danger-solid'],
    },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

/** «Скопировать ⌘C» с полки: лайм `brand`, текст `brand-ink`, хоткей на 55 %. */
export const Основная: Story = {
  args: { variant: 'primary', icon: <Icon icon={Copy} />, hotkey: '⌘C' },
};

export const Вторичная: Story = {
  args: { children: 'В Finder' },
};

export const Призрачная: Story = {
  args: { variant: 'ghost', children: 'Отменить' },
};

/** «Удалить этот»: подложка `danger-tint`, текст `danger`. */
export const Опасная: Story = {
  args: { variant: 'danger', children: 'Удалить этот' },
};

/**
 * Необратимое действие: мягкий `danger` на тёмном фоне по весу равен «Отмене»,
 * поэтому у очистки корзины — сплошная заливка (R13, R14 · подтверждения).
 */
export const ОпаснаяСплошная: Story = {
  name: 'Опасная · сплошная',
  args: { variant: 'danger-solid', children: 'Очистить корзину', icon: <Icon icon={Trash2} /> },
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="secondary">Отмена</Button>
      <Button {...args} />
    </div>
  ),
};

/** Полка целиком: пять вариантов в один ряд, как в R13. */
export const Полка: Story = {
  name: 'Полка · все варианты',
  render: () => (
    <div className="flex flex-wrap items-center gap-6 rounded-panel bg-panel p-5">
      <Button variant="primary" hotkey="⌘C">
        Скопировать
      </Button>
      <Button variant="secondary">В Finder</Button>
      <Button variant="ghost">Отменить</Button>
      <Button variant="danger-solid" icon={<Icon icon={Trash2} />}>
        Очистить корзину
      </Button>
      <Button variant="danger">Удалить этот</Button>
    </div>
  ),
};

/** Наведение, фокус с клавиатуры и нажатие — без мыши, через pseudo-states. */
export const Состояния: Story = {
  args: { variant: 'primary', icon: <Icon icon={Plus} /> },
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
 * Нажатие во всех вариантах: `scale 0.97` (`PRESS_SCALE`). Держим на CSS, а не
 * на `pressMotion`: кнопку часто оборачивают в Radix-триггер с `asChild`, и под
 * клонированием `motion.button` теряет права на `transform`.
 */
export const Нажатие: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="primary" className="pseudo-active">Основная</Button>
      <Button variant="secondary" className="pseudo-active">Вторичная</Button>
      <Button variant="ghost" className="pseudo-active">Призрачная</Button>
      <Button variant="danger" className="pseudo-active">Опасная</Button>
      <Button variant="danger-solid" className="pseudo-active">Очистить корзину</Button>
    </div>
  ),
  parameters: { pseudo: { active: ['.pseudo-active'] } },
};

/** `lg` — единственная большая кнопка редизайна: «Создать библиотеку» в R11. */
export const Размеры: Story = {
  render: (args) => (
    <div className="flex items-center gap-3">
      <Button {...args} size="sm">Маленькая · 28</Button>
      <Button {...args} size="md">Обычная · 32</Button>
      <Button {...args} variant="primary" size="lg">Создать библиотеку</Button>
    </div>
  ),
};
