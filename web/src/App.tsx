import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppConfig, FileListQuery, FolderRecord, SettingsResponse } from '@shared/api';
import { AppShell } from '@/features/shell/AppShell';
import { KitPage } from '@/features/kit/KitPage';
import { GridScreen } from '@/features/grid/GridScreen';
import { ConfirmDialog } from '@/features/grid/ConfirmDialog';
import { overlayOpen } from '@/features/grid/useGridHotkeys';
import { DetailView } from '@/features/detail/DetailView';
import { ImportProvider } from '@/features/import/ImportProvider';
import { LibraryProvider, useLibrary } from '@/features/library/LibraryProvider';
import { SettingsScreen, fetchSettings, patchSettings, completeOnboarding } from '@/features/settings';
import { OnboardingScreen } from '@/features/onboarding';
import { FilterPanel, countActiveFilters } from '@/features/filters';
import { plural } from '@/lib/format';
import { getViewState, useViewSelector, viewActions } from '@/store/view';
import { ToastProvider, useToast } from '@/components/ui/Toast';
import { TooltipProvider } from '@/components/ui/Tooltip';

/** Роутера нет: приложение одноэкранное, витрина примитивов живёт на ?kit. */
function isKitRoute(): boolean {
  return new URLSearchParams(window.location.search).has('kit');
}

interface ShellProps {
  settings: SettingsResponse;
  onSettingsChange: (next: SettingsResponse) => void;
}

function Shell({ settings, onSettingsChange }: ShellProps) {
  const library = useLibrary();
  const { toast } = useToast();
  const [renamingFolderId, setRenamingFolderId] = useState<number | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<FolderRecord | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const filters = useViewSelector((s) => s.filters);
  const sort = useViewSelector((s) => s.sort);

  // Панель фильтров говорит на языке FileListQuery, стор — на своём. Здесь стык.
  const filterQuery = useMemo<FileListQuery>(
    () => ({
      tags: [...filters.tags],
      exts: [...filters.exts],
      dateFrom: filters.dateFrom ?? undefined,
      dateTo: filters.dateTo ?? undefined,
      sort,
    }),
    [filters, sort],
  );

  const handleFilterChange = useCallback(
    (next: FileListQuery) => {
      const nextFilters = {
        tags: next.tags ?? [],
        exts: next.exts ?? [],
        dateFrom: next.dateFrom ?? null,
        dateTo: next.dateTo ?? null,
      };
      // setFilters сбрасывает выделение, поэтому дёргаем его только когда фильтры
      // правда изменились: смена одной сортировки выделение ронять не должна.
      const changed =
        JSON.stringify(nextFilters) !==
        JSON.stringify({
          tags: [...filters.tags],
          exts: [...filters.exts],
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
        });
      if (changed) viewActions.setFilters(nextFilters);
      if (next.sort && next.sort !== sort) viewActions.setSort(next.sort);
    },
    [filters, sort],
  );

  // Настройки — оверлей на весь экран, но не Radix-диалог: Esc вешаем руками (02 §4.26).
  useEffect(() => {
    if (!settingsOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || overlayOpen()) return;
      event.preventDefault();
      setSettingsOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [settingsOpen]);

  const handleSaveSettings = useCallback(
    async (patch: Partial<AppConfig>) => {
      const response = await patchSettings(patch);
      onSettingsChange(response);
      // Путь библиотеки сменился — данные в провайдере уже не про неё.
      if (patch.libraryPath !== undefined) void library.reload();
      return { restartRequired: response.restartRequired };
    },
    [library, onSettingsChange],
  );

  const fail = (cause: unknown, fallback: string) => {
    const message = cause instanceof Error ? cause.message : fallback;
    toast({ title: message, tone: 'danger' });
  };

  const handleCreateFolder = (parentFolderId: number | null) => {
    void library
      .createFolder('Новая папка', parentFolderId)
      .then((created) => {
        // Подпапка бесполезна в свёрнутом родителе — раскрываем его вместе с созданием.
        if (parentFolderId !== null) viewActions.expandFolder(parentFolderId);
        setRenamingFolderId(created.id);
      })
      .catch((cause: unknown) => fail(cause, 'Не удалось создать папку'));
  };

  const handleRenameCommit = (id: number, name: string) => {
    setRenamingFolderId(null);
    const trimmed = name.trim();
    if (trimmed === '') return;
    void library
      .renameFolder(id, trimmed)
      .catch((cause: unknown) => fail(cause, 'Не удалось переименовать папку'));
  };

  const handleDeleteConfirmed = () => {
    const folder = folderToDelete;
    setFolderToDelete(null);
    if (!folder) return;
    // Удаляется всё поддерево: если пользователь стоял внутри него, возвращаем в библиотеку.
    const removed = new Set<number>();
    const collect = (item: FolderRecord) => {
      removed.add(item.id);
      item.children.forEach(collect);
    };
    collect(folder);
    if (getViewState().folderId !== null && removed.has(getViewState().folderId as number)) {
      viewActions.setScope('library');
    }

    void library
      .deleteFolder(folder.id)
      .then(() => toast({ title: `Папка «${folder.name}» удалена` }))
      .catch((cause: unknown) => fail(cause, 'Не удалось удалить папку'));
  };

  const handleDropFiles = (folderId: number, fileIds: readonly number[]) => {
    const name = library.folderNameById.get(folderId) ?? 'папку';
    void library
      .moveToFolder(fileIds, folderId)
      .then(() =>
        toast({
          title: `${fileIds.length} ${plural(fileIds.length, 'файл переехал', 'файла переехали', 'файлов переехали')} в «${name}»`,
        }),
      )
      .catch((cause: unknown) => fail(cause, 'Не удалось переместить файлы'));
  };

  return (
    <>
      <AppShell
        folders={library.folders}
        stats={library.stats}
        renamingFolderId={renamingFolderId}
        onCreateFolder={handleCreateFolder}
        onRenameStart={setRenamingFolderId}
        onRenameCommit={handleRenameCommit}
        onRenameCancel={() => setRenamingFolderId(null)}
        onDeleteFolder={setFolderToDelete}
        onDropFiles={handleDropFiles}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenFilter={() => setFilterOpen((open) => !open)}
        filterCount={countActiveFilters(filterQuery)}
        filterOpen={filterOpen}
        overlay={
          <FilterPanel
            open={filterOpen}
            onOpenChange={setFilterOpen}
            value={filterQuery}
            onChange={handleFilterChange}
            tags={library.tags}
          />
        }
      >
        <GridScreen />
      </AppShell>

      <DetailView />

      {settingsOpen ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-bg">
          <SettingsScreen
            settings={settings}
            onSave={handleSaveSettings}
            onClose={() => setSettingsOpen(false)}
          />
        </div>
      ) : null}

      {/* 5.4 — файлы не удаляются вместе с папкой, поэтому говорим об этом прямо. */}
      <ConfirmDialog
        open={folderToDelete !== null}
        title={`Удалить папку «${folderToDelete?.name ?? ''}»?`}
        description={
          folderToDelete
            ? `Папка удалится вместе со вложенными. ${folderToDelete.fileCount > 0 ? `${folderToDelete.fileCount} ${plural(folderToDelete.fileCount, 'файл', 'файла', 'файлов')} не пропадёт — файлы переедут в «Не разобрано».` : 'Файлы не удаляются: те, что лежали внутри, переедут в «Не разобрано».'}`
            : ''
        }
        confirmLabel="Удалить папку"
        onCancel={() => setFolderToDelete(null)}
        onConfirm={handleDeleteConfirmed}
      />
    </>
  );
}

export function App() {
  if (isKitRoute()) {
    return (
      <TooltipProvider>
        <ToastProvider>
          <KitPage />
        </ToastProvider>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <ToastProvider>
        <Bootstrap />
      </ToastProvider>
    </TooltipProvider>
  );
}

/**
 * Первый запрос приложения — настройки: из них известно, пройден ли онбординг.
 * До ответа библиотеку не поднимаем: она бы полезла в ещё не созданную базу.
 */
function Bootstrap() {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    fetchSettings()
      .then(setSettings)
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Сервер «Копирки» недоступен'),
      );
  }, []);

  useEffect(load, [load]);

  if (error !== null) {
    return (
      <div className="flex h-full items-center justify-center px-8">
        <div className="max-w-sm text-center">
          <p className="text-lg font-medium text-ink">Сервер «Копирки» не отвечает</p>
          <p className="mt-2 text-md text-ink-muted">{error}</p>
          <button
            type="button"
            onClick={load}
            className="mt-5 h-[var(--size-row)] rounded-md bg-surface-raised px-3 text-md text-ink hover:bg-surface-active"
          >
            Повторить
          </button>
        </div>
      </div>
    );
  }

  if (settings === null) return <div className="h-full bg-bg" />;

  if (!settings.firstRunCompleted) {
    return (
      <OnboardingScreen
        defaultPath={settings.libraryPath}
        onSubmit={async (libraryPath) => setSettings(await completeOnboarding(libraryPath))}
      />
    );
  }

  return (
    <LibraryProvider>
      <ImportProvider>
        <Shell settings={settings} onSettingsChange={setSettings} />
      </ImportProvider>
    </LibraryProvider>
  );
}
