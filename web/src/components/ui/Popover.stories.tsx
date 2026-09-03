import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChevronDown, Folder } from 'lucide-react';
import { Icon } from '@/lib/icons';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from './ContextMenu';
import { Popover, PopoverContent, PopoverItem, PopoverSeparator, PopoverTrigger } from './Popover';
import { Select } from './Select';

/**
 * Канон — R14 · «Меню и поповеры». Три вещи, ради которых история и нужна:
 *  · тело — настоящее стекло (`backdrop-filter`), в Paper оно не рендерится;
 *  · строки полупрозрачные (`--color-control`), а не плотные;
 *  · разделитель идёт от края до края и красится цветом обводки контейнера.
 */
function SortPopover() {
  const [value, setValue] = useState('new');
  const options = [
    { value: 'new', label: 'Сначала новые' },
    { value: 'old', label: 'Сначала старые' },
    { value: 'az', label: 'По имени А → Я' },
    { value: 'size', label: 'По размеру файла' },
  ];

  return (
    <Popover defaultOpen>
      <PopoverTrigger className="flex h-[var(--size-row)] items-center gap-1.5 rounded-md bg-control pr-2.5 pl-3 text-md leading-[18px] font-medium text-ink-muted">
        Сначала новые
        <Icon icon={ChevronDown} size={14} className="text-ink-faint" aria-hidden />
      </PopoverTrigger>
      <PopoverContent>
        {options.map((option) => (
          <PopoverItem
            key={option.value}
            current={option.value === value}
            onClick={() => setValue(option.value)}
          >
            {option.label}
          </PopoverItem>
        ))}
      </PopoverContent>
    </Popover>
  );
}

const meta = {
  title: 'Примитивы/Поповер и меню',
  component: SortPopover,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof SortPopover>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Сортировка: у текущего пункта подложка плотнее ховера. */
export const Сортировка: Story = {
  decorators: [
    (Story) => (
      <div className="h-[260px]">
        <Story />
      </div>
    ),
  ],
};

/** Меню карточки: две группы, между ними линия от края до края и пункт `danger`. */
export const МенюКарточки: Story = {
  name: 'Меню карточки · разделитель и danger',
  render: () => (
    <div className="h-[280px]">
      <Popover defaultOpen>
        <PopoverTrigger className="rounded-md bg-control px-3 py-1.5 text-md font-medium text-ink">
          Меню
        </PopoverTrigger>
        <PopoverContent>
          <PopoverItem current>Открыть</PopoverItem>
          <PopoverItem hotkey="⌘C">Скопировать</PopoverItem>
          <PopoverItem>В папку…</PopoverItem>
          <PopoverItem>Показать в Finder</PopoverItem>
          <PopoverSeparator />
          <PopoverItem danger hotkey="⌫">
            Удалить
          </PopoverItem>
        </PopoverContent>
      </Popover>
    </div>
  ),
};

/** То же меню по правому клику — на Radix ContextMenu, вид один в один. */
export const ПравыйКлик: Story = {
  name: 'Контекстное меню · правый клик',
  render: () => (
    <div className="h-[260px]">
      <ContextMenu>
        <ContextMenuTrigger className="flex h-[160px] w-[240px] items-center justify-center rounded-card bg-linear-to-br from-[#E6E7EA] to-[#C3C6CD] text-sm text-chip-ink">
          правый клик
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem>Открыть</ContextMenuItem>
          <ContextMenuItem hotkey="⌘C">Скопировать</ContextMenuItem>
          <ContextMenuItem>Показать в Finder</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem danger hotkey="⌫">
            Удалить
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  ),
};

/** Выпадающий список папок: кнопка 34 px и тот же стеклянный слой. */
export const ВыборПапки: Story = {
  name: 'Выбор папки',
  render: function ВыборПапкиDemo() {
    const [value, setValue] = useState<string | null>('refs');
    return (
      <div className="h-[300px] w-[392px]">
        <Select
          value={value}
          onValueChange={setValue}
          icon={<Icon icon={Folder} />}
          options={[
            { value: 'refs', label: 'Референсы' },
            { value: 'ui', label: 'Интерфейсы' },
            { value: 'dash', label: 'Дашборды', depth: 1 },
            { value: 'onb', label: 'Онбординг', depth: 1 },
            { value: 'type', label: 'Типографика' },
          ]}
        />
      </div>
    );
  },
};
