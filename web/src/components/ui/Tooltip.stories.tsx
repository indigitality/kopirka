import type { Meta, StoryObj } from '@storybook/react-vite';
import { Copy, Trash2 } from 'lucide-react';
import { Icon } from '@/lib/icons';
import { IconButton } from './IconButton';
import { Tooltip, TooltipContent, TooltipRoot, TooltipTrigger } from './Tooltip';

/**
 * Канон — R14 · «Тултипы»: стекло 24 px, радиус `--radius-sm`, поля 8,
 * текст 11/14 · 500, хоткей 10/12 `ink-faint`. Тени у тултипа нет.
 */
const meta = {
  title: 'Примитивы/Тултип',
  component: Tooltip,
  /* `content` и `children` обязательны; истории собирают свою разметку в `render`. */
  args: { content: 'Скопировать', children: <span /> },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Три образца полки — раскрыты принудительно, чтобы было что сверять. */
export const Полка: Story = {
  name: 'Полка · три образца',
  render: () => (
    <div className="flex h-[120px] items-end gap-10">
      <TooltipRoot open>
        <TooltipTrigger className="text-2xs text-ink-faint">с хоткеем</TooltipTrigger>
        <TooltipContent side="top">
          Скопировать
          <span className="text-2xs leading-3 font-normal text-ink-faint">⌘C</span>
        </TooltipContent>
      </TooltipRoot>
      <TooltipRoot open>
        <TooltipTrigger className="text-2xs text-ink-faint">без хоткея</TooltipTrigger>
        <TooltipContent side="top">Показать в Finder</TooltipContent>
      </TooltipRoot>
      <TooltipRoot open>
        <TooltipTrigger className="text-2xs text-ink-faint">клавиша</TooltipTrigger>
        <TooltipContent side="top">
          Удалить
          <span className="text-2xs leading-3 font-normal text-ink-faint">⌫</span>
        </TooltipContent>
      </TooltipRoot>
    </div>
  ),
};

/** Как это работает в жизни: наведите на кнопку и подождите 400 мс. */
export const НаКнопке: Story = {
  name: 'На кнопке · по наведению',
  render: () => (
    <div className="flex h-[120px] items-center gap-2">
      <Tooltip content="Скопировать" hotkey="⌘C">
        <IconButton label="Скопировать" variant="secondary">
          <Icon icon={Copy} />
        </IconButton>
      </Tooltip>
      <Tooltip content="Удалить" hotkey="⌫">
        <IconButton label="Удалить" variant="danger">
          <Icon icon={Trash2} />
        </IconButton>
      </Tooltip>
    </div>
  ),
};
