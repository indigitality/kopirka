/**
 * Оболочка окна — артборд R01 редизайна.
 *
 * Три поверхности вместо прежней сплошной: фон окна `app` виден только в
 * зазорах, сайдбар и блок контента — панели радиуса 24 на `panel`. Колонка
 * контента лежит на вуали `panel-veil`: сплошного фона у верхней панели нет,
 * она читается как часть блока, но не спорит с сеткой.
 */
import type { ReactNode } from 'react';
import type { FolderRecord, StatsResponse } from '@shared/api';
import { Sidebar, type SidebarProps } from './Sidebar';
import { TopBar, type TopBarProps } from './TopBar';

export interface AppShellProps extends Omit<SidebarProps, 'folders' | 'stats'> {
  folders: readonly FolderRecord[];
  stats: StatsResponse;
  /** Область контента: сетка карточек, корзина, настройки. */
  children?: ReactNode;
  /**
   * Слой поверх области контента, не уезжающий при скролле сетки:
   * панель фильтров (06 §1 — фильтры это состояние сетки, а не отдельный экран).
   */
  overlay?: ReactNode;
  onOpenSearch?: TopBarProps['onOpenSearch'];
  onOpenFilter?: TopBarProps['onOpenFilter'];
  filterCount?: TopBarProps['filterCount'];
  filterOpen?: TopBarProps['filterOpen'];
}

export function AppShell({
  folders,
  stats,
  children,
  overlay,
  onOpenSearch,
  onOpenFilter,
  filterCount,
  filterOpen,
  ...sidebarProps
}: AppShellProps) {
  /*
    Сворачивания сайдбара больше нет (решение редизайна 02.09.2026): вместе с
    кнопкой ушёл и хоткей ⌘\, который жил здесь.
  */
  return (
    /*
      Поле окна и зазор между панелями — тоже зона перетаскивания: полосы
      заголовка нет, а рамка вокруг панелей ровно для этого и годится. Атрибут
      без `deep` нарочно: тянется только сам фон оболочки, дети (сайдбар,
      панель контента) остаются обычными.

      Сверху поле шире (`--shell-pad-top`): в окне macOS это 36 — собственная
      полоса фона окна под кнопки светофора, и она же зона перетаскивания.
      В браузере переменной нет и сверху те же 12, что по остальным сторонам.

      В окне Windows титлбар системный (рисует ОС, не веб-контент): оболочка
      `--kopirka-titlebar-inset` там не ставит вовсе, и `--shell-pad-top`
      остаётся на том же фолбэке 12, что в браузере — отдельного случая в
      разметке не требуется.
    */
    <div
      data-tauri-drag-region
      className="flex h-full w-full overflow-hidden gap-[var(--shell-gap)] bg-app p-[var(--shell-pad)] pt-[var(--shell-pad-top)]"
    >
      <Sidebar folders={folders} stats={stats} {...sidebarProps} />

      {/* Колонка контента: вуаль под верхней панелью, радиус панели (узел «Контент» R01). */}
      <div className="flex min-w-0 flex-1 flex-col rounded-[var(--radius-panel)] bg-panel-veil">
        <TopBar
          onOpenSearch={onOpenSearch}
          onOpenFilter={onOpenFilter}
          filterCount={filterCount}
          filterOpen={filterOpen}
        />
        {/*
          Якорь и скролл разведены нарочно: скроллится внутренний <main>, а
          позиционируется overlay относительно внешнего блока. Иначе панель
          фильтров уезжала бы вверх вместе с сеткой.

          `id` — договор с «полкой» (дизайн-аудит 4.14): плавающие панели
          рисуются порталом сюда, а не в `<body>`, поэтому центрируются по
          области контента. Обрезки на нём нарочно нет: панель фильтров и
          полка выходят за край блока.

          Панель — на `<main>`: фон, радиус и обрезка живут там же, где скролл
          (узел «Блок сетки» R01). Поля внутри задаёт сама сетка (`--grid-pad`).
        */}
        <div id="kopirka-content" className="relative min-h-0 flex-1">
          <main className="h-full overflow-y-auto rounded-[var(--radius-panel)] bg-panel">
            {children}
          </main>
          {overlay}
        </div>
      </div>
    </div>
  );
}
