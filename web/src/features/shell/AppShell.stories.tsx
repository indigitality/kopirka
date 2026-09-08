import { useEffect, type CSSProperties, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { StatsResponse } from '@shared/api';
import type { KopirkaPlatform } from '@/lib/platform';
import { EmptyState } from '@/components/ui/EmptyState';
import { AppShell } from './AppShell';
import { mockFolders } from './mock';

const stats: StatsResponse = { library: 214, untagged: 8, trash: 12, similar: 3 };

/**
 * Заглушка вместо карточек: настоящая сетка живёт в `GridScreen` и ходит в API
 * через `LibraryProvider`, поэтому в витрине её место занимают плашки тех же
 * пропорций. Проверять здесь нужно оболочку — панели, зазоры, радиусы и поля.
 * Поля блока сетки задаёт сама сетка (`--grid-pad` 16), не оболочка.
 */
function GridPlaceholder() {
  const columns = [
    [300, 190, 236],
    [210, 330, 180],
    [250, 196, 284],
    [340, 214, 176],
  ];
  return (
    <div className="flex gap-[var(--grid-gap)] p-[var(--grid-pad)]">
      {columns.map((column, index) => (
        <div key={index} className="flex flex-1 flex-col gap-[var(--grid-gap)]">
          {column.map((height, cardIndex) => (
            <div
              key={cardIndex}
              className="rounded-[var(--radius-card)] bg-control"
              style={{ height }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Ставит `data-kopirka-platform` на настоящий `<html>` витрины на время жизни
 * истории — ровно то, что в окне приложения делает десктопная обёртка синхронно
 * до первого кадра. Только так дочерние компоненты (`SearchField`, «Пульт»)
 * прочитают `hotkeyLabel`/`platformStrings` и покажут подписи Windows, а не
 * только отступ оболочки — «канон виден в обоих состояниях», а не только его
 * верхнее поле.
 *
 * Атрибут ставится синхронно в теле рендера, а не в эффекте: `hotkeyLabel` и
 * `platformStrings` читают его во время рендера потомков, а эффект сработал бы
 * только после коммита — потомки успели бы отрисоваться с чужим (или ещё не
 * выставленным) значением, и хоткеи навсегда остались бы в подписи предыдущей
 * истории до следующего события. Идемпотентно, поэтому двойной вызов в
 * StrictMode безопасен. Снятие на размонтировании: атрибут не должен утечь в
 * соседние истории.
 */
function ShellPlatform({ platform, children }: { platform: KopirkaPlatform; children: ReactNode }) {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.kopirkaPlatform = platform;
  }
  useEffect(() => {
    return () => {
      if (typeof document === 'undefined') return;
      delete document.documentElement.dataset.kopirkaPlatform;
    };
  }, [platform]);
  return <>{children}</>;
}

const meta = {
  title: 'Экраны/Оболочка',
  component: AppShell,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="h-screen w-full bg-app">
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

/** Кнопки окна macOS слева направо: закрыть · свернуть · развернуть. */
const TRAFFIC_LIGHT_COLORS = ['#FF5F57', '#FEBC2E', '#28C840'];

/**
 * Окно macOS: кнопки светофора лежат поверх интерфейса, и оболочка отдаёт им
 * собственную полосу фона окна — верхнее поле растёт с 12 до 36
 * (`--shell-pad-top`), панели начинаются под кнопками. Переменную ставит
 * десктопная обёртка (`desktop/src-tauri/src/windows.rs`, 36 px); здесь она
 * подставлена руками, чтобы состояние было видно и в браузере.
 *
 * Три кружка — макет самих кнопок: обёртка ставит их в (20, 12), круги 12 px,
 * шаг 20. Левый край совпадает с левым краем строк сайдбара (12 + 8), от
 * нижнего края кнопок до панелей остаётся 12 — как поле по бокам.
 */
export const СИнсетомСветофора: Story = {
  name: 'Полоса светофора macOS (36 px)',
  args: { children: <GridPlaceholder /> },
  decorators: [
    (Story) => (
      <div
        className="relative h-screen w-full bg-app"
        style={{ '--kopirka-titlebar-inset': '36px' } as CSSProperties}
      >
        <ShellPlatform platform="macos">
          <Story />
        </ShellPlatform>
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {TRAFFIC_LIGHT_COLORS.map((color, index) => (
            <span
              key={color}
              className="absolute size-3 rounded-full"
              style={{ left: 20 + index * 20, top: 12, background: color }}
            />
          ))}
        </div>
      </div>
    ),
  ],
};

/**
 * Окно Windows: титлбар системный (рисует ОС поверх веб-контента, не внутри
 * него), кнопок-кружков в интерфейсе нет и не должно быть — их место снаружи
 * окна. Оболочка на Windows `--kopirka-titlebar-inset` не ставит вовсе (контракт
 * с десктопным агентом), поэтому `--shell-pad-top` тихо падает на фолбэк
 * `--shell-pad` 12 — тот же путь, что и в браузере без переменной. Разница с
 * историей «Библиотека — сетка» в том, что здесь ещё и `data-kopirka-platform`
 * стоит явным `windows`, поэтому подписи хоткеев в «Пульте» и поиске читаются
 * как «Ctrl+…», а не «⌘…» — это и есть вторая половина канона, которую
 * не видно по одному отступу сверху.
 */
export const ОкноWindows: Story = {
  name: 'Системный титлбар Windows (без инсета)',
  args: { children: <GridPlaceholder /> },
  decorators: [
    (Story) => (
      <div className="relative h-screen w-full bg-app">
        <ShellPlatform platform="windows">
          <Story />
        </ShellPlatform>
      </div>
    ),
  ],
};
