import type { Meta, StoryObj } from '@storybook/react-vite';
import type { StatsResponse } from '@shared/api';
import { EmptyState } from '@/components/ui/EmptyState';
import { AppShell } from './AppShell';
import { mockFolders } from './mock';

const stats: StatsResponse = { library: 214, untagged: 17, trash: 9, similar: 3 };

/**
 * Заглушка вместо карточек: настоящая сетка живёт в `GridScreen` и ходит в API
 * через `LibraryProvider`, поэтому в витрине её место занимают плашки тех же
 * пропорций. Проверять здесь нужно оболочку — сайдбар, верхнюю панель и поля.
 */
function GridPlaceholder() {
  const columns = [
    [300, 190, 236],
    [210, 330, 180],
    [250, 196, 284],
    [340, 214, 176],
  ];
  return (
    <div className="flex gap-[var(--grid-gap)] px-[var(--grid-pad)] pb-[var(--grid-pad)]">
      {columns.map((column, index) => (
        <div key={index} className="flex flex-1 flex-col gap-[var(--grid-gap)]">
          {column.map((height, cardIndex) => (
            <div
              key={cardIndex}
              className="rounded-[var(--radius-card)] bg-surface-raised"
              style={{ height }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

const meta = {
  title: 'Экраны/Оболочка',
  component: AppShell,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="h-screen w-full">
        <Story />
      </div>
    ),
  ],
  args: { folders: mockFolders, stats },
} satisfies Meta<typeof AppShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Библиотека: Story = {
  name: 'Библиотека — сетка',
  args: { children: <GridPlaceholder /> },
};

export const Пустая: Story = {
  name: 'Пустая библиотека',
  args: {
    stats: { library: 0, untagged: 0, trash: 0, similar: 0 },
    folders: [],
    children: (
      <div className="grid h-full place-items-center">
        <EmptyState
          title="Здесь пока пусто"
          description="Перетащите файлы в окно или сохраните картинку через расширение"
        />
      </div>
    ),
  },
};
