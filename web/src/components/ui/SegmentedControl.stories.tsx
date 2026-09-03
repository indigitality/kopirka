import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Grid2x2, Grid3x3, Square } from 'lucide-react';
import { Icon } from '@/lib/icons';
import { SegmentedControl, type SegmentedOption } from './SegmentedControl';

/**
 * Единственный тип переключателя в «Копирке» (дизайн-аудит §8.1), канон
 * редизайна — R13 · «Верхняя панель». Проверять стоит три вещи: переезд плашки
 * (`layoutId`, `--dur-fast`), стрелки ←/→ внутри группы и то, что в группу
 * заходят одним Tab, а не тремя.
 */
type Density = 'l' | 'm' | 's';

const SIZE_OPTIONS: readonly SegmentedOption<Density>[] = [
  { value: 'l', label: 'Большие', hotkey: '⌘1', icon: <Icon icon={Square} /> },
  { value: 'm', label: 'Средние', hotkey: '⌘2', icon: <Icon icon={Grid2x2} /> },
  { value: 's', label: 'Маленькие', hotkey: '⌘3', icon: <Icon icon={Grid3x3} /> },
];

const ORIENTATION_OPTIONS: readonly SegmentedOption<string>[] = [
  { value: 'any', label: 'Любые' },
  { value: 'landscape', label: 'Горизонтальные' },
  { value: 'portrait', label: 'Вертикальные' },
];

function Demo({
  options,
  label,
  segmentWidth,
  initial,
}: {
  options: readonly SegmentedOption<string>[];
  label: string;
  segmentWidth?: number;
  initial: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <SegmentedControl
      label={label}
      value={value}
      onValueChange={setValue}
      options={options}
      segmentWidth={segmentWidth}
    />
  );
}

const meta = {
  title: 'Примитивы/Сегментный контрол',
  component: Demo,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Размер карточек сетки — решение D5: три сегмента 32×28 с тултипами и хоткеями. */
export const РазмерСетки: Story = {
  name: 'Размер карточек · 32 × 28',
  args: {
    label: 'Размер карточек',
    options: SIZE_OPTIONS as readonly SegmentedOption<string>[],
    segmentWidth: 32,
    initial: 'm',
  },
};

/** С текстом: ширина сегмента по содержимому, паддинг 10. */
export const СТекстом: Story = {
  name: 'С текстом',
  args: { label: 'Ориентация', options: ORIENTATION_OPTIONS, initial: 'any' },
};

/** Два сегмента — минимальный случай. */
export const ДваСегмента: Story = {
  name: 'Два сегмента',
  args: {
    label: 'Вид',
    options: [
      { value: 'grid', label: 'Сетка' },
      { value: 'list', label: 'Список' },
    ],
    initial: 'grid',
  },
};
