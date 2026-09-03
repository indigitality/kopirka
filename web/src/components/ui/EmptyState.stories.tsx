import type { Meta, StoryObj } from '@storybook/react-vite';
import { ImagePlus, Inbox, SearchX, Trash2, Unplug } from 'lucide-react';
import { Icon } from '@/lib/icons';
import { Button } from './Button';
import { EmptyState } from './EmptyState';

/**
 * Канон — R12 · «Пустые состояния», семь образцов. Колонка 420, зазор 12,
 * квадрат 44 с иконкой 20, заголовок 16/20 · 500, текст 13/19 `ink-muted`.
 */
const meta = {
  title: 'Примитивы/Пустое состояние',
  component: EmptyState,
  args: { title: 'Ничего не нашлось' },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Образец 1: поиск ничего не нашёл. */
export const ПоискПуст: Story = {
  name: 'Поиск пуст',
  args: {
    icon: <Icon icon={SearchX} size={20} />,
    title: 'Ничего не нашлось',
    description:
      'Попробуйте другой запрос или снимите фильтры — возможно, файл лежит в другом разделе.',
    action: <Button variant="secondary">Сбросить поиск</Button>,
  },
};

/** Образец 3: корзина пуста — только заголовок и текст, без кнопок. */
export const КорзинаПуста: Story = {
  name: 'Корзина пуста',
  args: {
    icon: <Icon icon={Trash2} size={20} />,
    title: 'Корзина пуста',
    description: 'Удалённые файлы лежат здесь 30 дней, потом стираются сами.',
    action: undefined,
  },
};

/** Образец 4: «Не разобрано» — файлов без папки нет. */
export const НеРазобрано: Story = {
  name: 'Не разобрано',
  args: {
    icon: <Icon icon={Inbox} size={20} />,
    title: 'Всё разложено',
    description: 'Файлов без папки не осталось.',
    action: undefined,
  },
};

/** Образец 6: библиотека пуста — два действия в ряд. */
export const БиблиотекаПуста: Story = {
  name: 'Библиотека пуста',
  args: {
    icon: <Icon icon={ImagePlus} size={20} />,
    title: 'Пока пусто',
    description: 'Перетащите картинки в окно или добавьте их с диска — «Копирка» разложит остальное.',
    action: (
      <>
        <Button variant="primary">Добавить файлы</Button>
        <Button variant="ghost">Как наполнять</Button>
      </>
    ),
  },
};

/** Образец 7: сервер недоступен — квадрат и заголовок в `danger`. */
export const Ошибка: Story = {
  args: {
    tone: 'danger',
    icon: <Icon icon={Unplug} size={20} />,
    title: 'Не удалось загрузить библиотеку',
    description: 'Сервер «Копирки» не отвечает.',
    action: <Button variant="secondary">Повторить</Button>,
  },
};
