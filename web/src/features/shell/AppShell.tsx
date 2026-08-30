import { useEffect, type ReactNode } from 'react';
import type { FolderRecord, StatsResponse } from '@shared/api';
import { viewActions } from '@/store/view';
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
  onOpenFilter?: TopBarProps['onOpenFilter'];
  filterCount?: TopBarProps['filterCount'];
  filterOpen?: TopBarProps['filterOpen'];
}

export function AppShell({
  folders,
  stats,
  children,
  overlay,
  onOpenFilter,
  filterCount,
  filterOpen,
  ...sidebarProps
}: AppShellProps) {
  // ⌘\ — свернуть/развернуть сайдбар.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key !== '\\' && event.code !== 'Backslash') return;
      event.preventDefault();
      viewActions.toggleSidebar();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="flex h-full w-full overflow-hidden bg-bg">
      <Sidebar folders={folders} stats={stats} {...sidebarProps} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenFilter={onOpenFilter} filterCount={filterCount} filterOpen={filterOpen} />
        {/*
          Якорь и скролл разведены нарочно: скроллится внутренний <main>, а
          позиционируется overlay относительно внешнего блока. Иначе панель
          фильтров уезжала бы вверх вместе с сеткой.
        */}
        <div className="relative min-h-0 flex-1">
          <main className="h-full overflow-y-auto">{children}</main>
          {overlay}
        </div>
      </div>
    </div>
  );
}
