import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Checkbox } from './Checkbox';

/**
 * Две формы, два места. Круглый — поверх карточки (R13 · «Карточка и чипы»),
 * квадратный — в списке тегов панели фильтров (R05).
 */
function Demo({ shape, initial }: { shape: 'square' | 'round'; initial: boolean }) {
  const [checked, setChecked] = useState(initial);
  return <Checkbox shape={shape} checked={checked} onCheckedChange={setChecked} />;
}

const meta = {
  title: 'Примитивы/Чекбокс',
  component: Demo,
  args: { shape: 'round', initial: false },
  argTypes: { shape: { control: 'inline-radio', options: ['square', 'round'] } },
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Круглый живёт на превью: тёмная вуаль + белая обводка 1,5 px, выбран — лайм. */
export const Круглый: Story = {
  name: 'Круглый · поверх карточки',
  render: () => (
    <div className="flex gap-3">
      <div className="relative size-[140px] rounded-card bg-linear-to-br from-[#DDE3EA] to-[#B9C2CE]">
        <span className="absolute top-2 left-2">
          <Checkbox checked={false} onCheckedChange={() => {}} />
        </span>
      </div>
      <div className="relative size-[140px] rounded-card border-[3px] border-brand bg-linear-to-br from-[#F3E4E8] to-[#DCC3CC]">
        <span className="absolute top-2 left-2">
          <Checkbox checked onCheckedChange={() => {}} />
        </span>
      </div>
    </div>
  ),
};

/** Квадратный — строка фильтра 28 px: чекбокс, имя, счётчик. */
export const Квадратный: Story = {
  name: 'Квадратный · строка фильтра',
  render: () => (
    <div className="w-[306px] rounded-panel bg-panel p-4">
      {[
        { name: 'интерфейс', count: 24, on: true },
        { name: 'тёмная тема', count: 18, on: true },
        { name: 'карточки', count: 16, on: false },
        { name: 'прайсинг', count: 9, on: false },
      ].map((row) => (
        <div key={row.name} className="flex h-7 items-center gap-2.5">
          <Checkbox shape="square" checked={row.on} onCheckedChange={() => {}} label={row.name} />
          <span
            className={`flex-1 text-md leading-[18px] font-medium ${row.on ? 'text-ink' : 'text-ink-muted'}`}
          >
            {row.name}
          </span>
          <span className="text-2xs leading-[14px] text-ink-faint tabular-nums">{row.count}</span>
        </div>
      ))}
    </div>
  ),
};

export const Состояния: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Checkbox shape="square" checked={false} onCheckedChange={() => {}} />
      <Checkbox shape="square" checked={false} onCheckedChange={() => {}} className="pseudo-hover" />
      <Checkbox shape="square" checked onCheckedChange={() => {}} />
      <Checkbox shape="round" checked={false} onCheckedChange={() => {}} />
      <Checkbox shape="round" checked onCheckedChange={() => {}} />
    </div>
  ),
  parameters: { pseudo: { hover: ['.pseudo-hover'] } },
};

export const Интерактивный: Story = {};
