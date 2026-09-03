import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { FileListQuery, TagRecord } from '@shared/api';
import { FilterPanel } from './FilterPanel';
import { presetRange } from './query';

const tags: TagRecord[] = [
  { id: 1, name: 'интерфейс', fileCount: 24 },
  { id: 2, name: 'тёмная тема', fileCount: 18 },
  { id: 3, name: 'графики', fileCount: 11 },
  { id: 4, name: 'карточки', fileCount: 16 },
  { id: 5, name: 'прайсинг', fileCount: 9 },
  { id: 6, name: 'типографика', fileCount: 7 },
];

/**
 * Панель управляемая: снаружи приходит запрос, наружу уходит изменённый.
 * В витрине состояние держит обёртка — иначе чипы не переключаются.
 */
function Harness({ initial }: { initial: FileListQuery }) {
  const [value, setValue] = useState<FileListQuery>(initial);
  const [open, setOpen] = useState(true);

  return (
    <div className="relative h-[560px] w-[880px] overflow-hidden rounded-panel bg-panel">
      {/* Заглушка сетки: панель — стекло, и её нужно видеть на чём-то живом. */}
      <div className="grid h-full grid-cols-3 gap-3.5 p-4">
        {Array.from({ length: 9 }, (_, index) => (
          <div key={index} className="rounded-card bg-control" />
        ))}
      </div>
      <FilterPanel open={open} onOpenChange={setOpen} value={value} onChange={setValue} tags={tags} />
    </div>
  );
}

/**
 * Панель фильтров — артборд R05 «Поиск и фильтры». Проверяем: стекло поверх
 * сетки, секции без разделителей, лаймовые чипы и подвал с линией от края до края.
 */
const meta = {
  title: 'Фильтры/Панель фильтров',
  component: Harness,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Harness>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Ничего не выбрано: счётчика в шапке нет, «Сбросить» не показывается. */
export const Покой: Story = {
  args: { initial: {} },
};

/** Пять ограничений: три тега, тип файла и период — как на артборде. */
export const САктивнымиФильтрами: Story = {
  name: 'С активными фильтрами',
  args: {
    initial: {
      tags: ['интерфейс', 'тёмная тема', 'графики'],
      exts: ['png'],
      ...presetRange('week'),
    },
  },
};
