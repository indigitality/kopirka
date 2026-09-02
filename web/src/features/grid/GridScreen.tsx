/**
 * LIB-01 — сетка карточек. Одна и та же сетка обслуживает три среза
 * (`library` / `untagged` / `trash`): различаются данные, действия и пустые состояния.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Trash2 } from 'lucide-react';
import type { FileRecord } from '@shared/api';
import * as api from '@/lib/api';
import { plural } from '@/lib/format';
import { DUR_FAST, EASE_OUT } from '@/lib/motion';
import { EASE_IN } from '@/components/ui/motion-presets';
import { Button } from '@/components/ui/Button';
import { SelectionBar } from '@/components/ui/SelectionBar';
import { useToast } from '@/components/ui/Toast';
import { useLibrary } from '@/features/library/LibraryProvider';
import { DropZone } from '@/features/import/DropZone';
import { useImport } from '@/features/import/ImportProvider';
import { getViewState, useViewSelector, viewActions } from '@/store/view';
import { AddTagDialog, MoveToFolderDialog } from './BulkDialogs';
import { ConfirmDialog } from './ConfirmDialog';
import { fileDrag } from './dnd';
import { GridCard, cardRatio } from './GridCard';
import { GridEmpty, GridError } from './GridEmpty';
import { useGridMetrics } from './metrics';
import { TrashSelectionBar } from './TrashSelectionBar';
import { useGridHotkeys } from './useGridHotkeys';
import { useMasonry, type MasonryInput } from './useMasonry';

/** Пропорции карточек-заглушек на первой загрузке — чтобы экран не был пустым. */
const SKELETON = [0.75, 1.3, 0.66, 1, 1.45, 0.8, 1.1, 0.62, 1.35, 0.9, 1.2, 0.7].map(
  (ratio, index): MasonryInput => ({ id: -1 - index, ratio }),
);

type PendingConfirm = { kind: 'purge'; ids: readonly number[] } | { kind: 'empty-trash' } | null;

/**
 * Полка живёт в области контента (`#kopirka-content` из `AppShell`), но принадлежит
 * сетке: контракт с импортом — контейнер существует, пока смонтирован `GridScreen`.
 * Вне оболочки (витрина, тесты) якоря нет — рисуем на месте.
 */
function shelfPortal(target: HTMLElement | null, shelf: ReactNode): ReactNode {
  return target === null ? shelf : createPortal(shelf, target);
}

export function GridScreen() {
  const library = useLibrary();
  const { startImport, importFromTransfer } = useImport();
  const { toast } = useToast();

  const scope = useViewSelector((s) => s.scope);
  const folderId = useViewSelector((s) => s.folderId);
  const gridSize = useViewSelector((s) => s.gridSize);
  const query = useViewSelector((s) => s.query);
  const filters = useViewSelector((s) => s.filters);
  const selectedIds = useViewSelector((s) => s.selectedIds);
  const openFileId = useViewSelector((s) => s.openFileId);

  const metrics = useGridMetrics(gridSize);

  const [bulkDialog, setBulkDialog] = useState<'folder' | 'tag' | null>(null);
  const [confirm, setConfirm] = useState<PendingConfirm>(null);
  const [sentinelVisible, setSentinelVisible] = useState(false);

  const { files, loading, loadingMore, hasMore, error, loadMore } = library;

  /** Обработчикам событий нужен свежий список без пересоздания колбэков. */
  const filesRef = useRef(files);
  filesRef.current = files;

  const selection = useMemo(() => new Set(selectedIds), [selectedIds]);
  const showSkeleton = loading && files.length === 0;

  const masonryItems = useMemo<MasonryInput[]>(
    () => (showSkeleton ? SKELETON : files.map((file) => ({ id: file.id, ratio: cardRatio(file) }))),
    [files, showSkeleton],
  );
  const { ref: gridRef, layout } = useMasonry(masonryItems, metrics);
  const boxById = useMemo(() => new Map(layout.boxes.map((box) => [box.id, box])), [layout.boxes]);

  // ── Подгрузка курсором ───────────────────────────────────────────────────
  const sentinelRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => setSentinelVisible(entries.some((entry) => entry.isIntersecting)),
      { rootMargin: '600px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (sentinelVisible && hasMore && !loading && !loadingMore) loadMore();
  }, [sentinelVisible, hasMore, loading, loadingMore, loadMore, files.length]);

  // Список сменился (поиск, фильтр, срез) — выделение не должно указывать на невидимые файлы.
  useEffect(() => {
    if (loading) return;
    const present = new Set(files.map((file) => file.id));
    const current = getViewState().selectedIds;
    const kept = current.filter((id) => present.has(id));
    if (kept.length !== current.length) viewActions.setSelection(kept, kept.at(-1) ?? null);
  }, [files, loading]);

  // ── Выделение ────────────────────────────────────────────────────────────
  const handleSelectClick = useCallback((file: FileRecord, event: MouseEvent) => {
    const state = getViewState();
    if (event.metaKey || event.ctrlKey) {
      viewActions.toggleSelected(file.id);
      return;
    }
    if (event.shiftKey && state.selectionAnchorId !== null) {
      const list = filesRef.current;
      const from = list.findIndex((item) => item.id === state.selectionAnchorId);
      const to = list.findIndex((item) => item.id === file.id);
      if (from !== -1 && to !== -1) {
        const [start, end] = from < to ? [from, to] : [to, from];
        viewActions.setSelection(list.slice(start, end + 1).map((item) => item.id));
        return;
      }
    }
    viewActions.setSelection([file.id], file.id);
  }, []);

  const handleToggle = useCallback((file: FileRecord) => viewActions.toggleSelected(file.id), []);
  const handleOpen = useCallback((file: FileRecord) => viewActions.openFile(file.id), []);

  /** Правый клик по карточке вне выделения переносит выделение на неё — 02 §4.9. */
  const handleContextSelect = useCallback((file: FileRecord) => {
    viewActions.setSelection([file.id], file.id);
  }, []);

  /** «Добавить тег…» из меню карточки — тот же диалог, что у панели выделения. */
  const handleAddTag = useCallback((file: FileRecord) => {
    if (!getViewState().selectedIds.includes(file.id)) {
      viewActions.setSelection([file.id], file.id);
    }
    setBulkDialog('tag');
  }, []);

  const handleDragStart = useCallback((file: FileRecord): readonly number[] => {
    const current = getViewState().selectedIds;
    const ids = current.includes(file.id) ? current : [file.id];
    if (!current.includes(file.id)) viewActions.setSelection([file.id], file.id);
    fileDrag.start(ids);
    return ids;
  }, []);

  // ── Действия ─────────────────────────────────────────────────────────────
  const notifyError = useCallback(
    (cause: unknown, fallback: string) => {
      const message = cause instanceof api.ApiRequestError ? cause.message : fallback;
      toast({ title: message, tone: 'danger' });
    },
    [toast],
  );

  const trashIds = useCallback(
    async (ids: readonly number[]) => {
      if (ids.length === 0) return;
      try {
        await library.trashFiles(ids);
        viewActions.clearSelection();
        toast({
          title:
            ids.length === 1
              ? 'Файл в корзине'
              : `${ids.length} ${plural(ids.length, 'файл', 'файла', 'файлов')} в корзине`,
          action: {
            label: 'Отменить',
            onClick: () => void library.restoreFiles(ids).catch(() => undefined),
          },
        });
      } catch (cause) {
        notifyError(cause, 'Не удалось удалить файлы');
      }
    },
    [library, toast, notifyError],
  );

  const restoreIds = useCallback(
    async (ids: readonly number[]) => {
      if (ids.length === 0) return;
      try {
        await library.restoreFiles(ids);
        viewActions.clearSelection();
        toast({
          title:
            ids.length === 1
              ? 'Файл вернулся в библиотеку'
              : `Восстановлено ${ids.length} ${plural(ids.length, 'файл', 'файла', 'файлов')}`,
        });
      } catch (cause) {
        notifyError(cause, 'Не удалось восстановить файлы');
      }
    },
    [library, toast, notifyError],
  );

  const copyIds = useCallback(
    async (ids: readonly number[]) => {
      const id = ids[0];
      if (id === undefined) return;
      try {
        await api.copyFile(id);
        toast({
          title: ids.length > 1 ? 'Скопирован первый выбранный файл' : 'Скопировано в буфер',
          tone: 'success',
        });
      } catch (cause) {
        notifyError(cause, 'Не удалось скопировать файл');
      }
    },
    [toast, notifyError],
  );

  const revealFile = useCallback(
    async (file: FileRecord) => {
      try {
        await api.revealFile(file.id);
      } catch (cause) {
        notifyError(cause, 'Не удалось открыть Finder');
      }
    },
    [notifyError],
  );

  const runConfirm = useCallback(async () => {
    const pending = confirm;
    setConfirm(null);
    if (!pending) return;
    try {
      if (pending.kind === 'purge') {
        await library.purgeFiles(pending.ids);
        viewActions.clearSelection();
        toast({ title: 'Удалено навсегда' });
      } else {
        await library.emptyTrash();
        viewActions.clearSelection();
        toast({ title: 'Корзина очищена' });
      }
    } catch (cause) {
      notifyError(cause, 'Не удалось удалить файлы');
    }
  }, [confirm, library, toast, notifyError]);

  // ── Хоткеи 6.4 ───────────────────────────────────────────────────────────
  useGridHotkeys({
    detailOpen: openFileId !== null,
    hasSelection: selectedIds.length > 0,
    selectAll: () => viewActions.setSelection(filesRef.current.map((file) => file.id)),
    clearSelection: () => viewActions.clearSelection(),
    closeDetail: () => viewActions.openFile(null),
    stepDetail: (delta) => {
      const list = filesRef.current;
      const index = list.findIndex((file) => file.id === getViewState().openFileId);
      if (index === -1) return;
      const next = list[index + delta];
      if (next) viewActions.openFile(next.id);
      else if (delta === 1 && hasMore) loadMore();
    },
    copySelection: () => {
      const state = getViewState();
      const ids = state.openFileId !== null ? [state.openFileId] : state.selectedIds;
      void copyIds(ids);
    },
    deleteSelection: () => {
      const state = getViewState();
      const ids = state.openFileId !== null ? [state.openFileId] : state.selectedIds;
      if (ids.length === 0) return;
      if (state.scope === 'trash') setConfirm({ kind: 'purge', ids });
      else void trashIds(ids);
    },
    paste: (data) => importFromTransfer(data, 'clipboard'),
    setGridSize: (size) => viewActions.setGridSize(size),
  });

  /*
    «Полка» (дизайн-аудит 4.14–4.15) рисуется не здесь, а в области контента:
    внутри сетки она уехала бы вместе со скроллом, а `fixed` центрировал бы её
    по окну — на 1440 центр панели оказывался на 724 вместо 840.
  */
  const [contentEl, setContentEl] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setContentEl(document.getElementById('kopirka-content'));
  }, []);

  // ── Отрисовка ────────────────────────────────────────────────────────────
  const filtered =
    query.trim() !== '' ||
    filters.tags.length > 0 ||
    filters.exts.length > 0 ||
    filters.dateFrom !== null ||
    filters.dateTo !== null;

  // Имя папки на карточке — только там, где непонятно, откуда файл (§2 спеки).
  // Внутри папки это карточки из её подпапок: после D2 они подмешаны в список.
  const needle = query.trim();
  const folderNameFor = (file: FileRecord): string | null => {
    if (file.folderId === null) return null;
    const unclear =
      scope === 'untagged' || needle !== '' || (folderId !== null && file.folderId !== folderId);
    if (!unclear) return null;
    return library.folderNameById.get(file.folderId) ?? null;
  };

  // Поиск по имени тег не находит (SEARCH-02) — предлагаем перейти в фильтр (01 п.2a).
  const tagMatch =
    needle === ''
      ? null
      : (library.tags.find((tag) => tag.name.toLowerCase() === needle.toLowerCase()) ?? null);

  const empty = !loading && files.length === 0;

  /*
    Заголовок контента — решение D8 (дизайн-аудит 4.7, 4.30). Раньше, стоя в папке
    «Сэбач», нельзя было отличить её от всей библиотеки: ни имени, ни счётчика.
    Сюда же переехала шапка корзины — она была единственным блоком такого рода.
    Во «Всей библиотеке» без папки и поиска заголовка нет: там он ничего не добавит.
  */
  const folderName = folderId === null ? null : (library.folderNameById.get(folderId) ?? null);
  const headerTitle: string | null =
    needle !== ''
      ? `Поиск: ${needle}`
      : folderName !== null
        ? folderName
        : scope === 'untagged'
          ? 'Не разобрано'
          : scope === 'trash'
            ? 'Корзина'
            : null;

  // Счётчик берём из ответа списка, а не из stats: он всегда совпадает с тем, что видно.
  const fileCount = `${library.total} ${plural(library.total, 'файл', 'файла', 'файлов')}`;
  const headerMeta = loading
    ? null
    : scope === 'trash'
      ? `${fileCount} · ${plural(library.total, 'хранится', 'хранятся', 'хранятся')} 30 дней`
      : fileCount;

  const headerActions: ReactNode[] = [];
  if (scope === 'trash' && library.total > 0 && !loading) {
    headerActions.push(
      <Button
        key="empty-trash"
        variant="danger"
        icon={<Trash2 className="size-3.5" strokeWidth={2} />}
        onClick={() => setConfirm({ kind: 'empty-trash' })}
      >
        Очистить корзину
      </Button>,
    );
  }
  if (needle !== '') {
    headerActions.push(
      <Button key="reset-search" variant="ghost" onClick={() => viewActions.setQuery('')}>
        Сбросить
      </Button>,
    );
  }

  return (
    <DropZone className="min-h-full">
      <AnimatePresence initial={false}>
        {headerTitle !== null ? (
          <motion.div
            key="content-header"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: DUR_FAST, ease: EASE_OUT } }}
            exit={{ opacity: 0, transition: { duration: DUR_FAST, ease: EASE_IN } }}
            className="sticky top-0 z-20 flex h-11 items-center gap-3 bg-bg/85 px-[var(--grid-pad)] backdrop-blur-[6px]"
          >
            <h2 className="min-w-0 truncate text-lg leading-tight font-medium text-ink">{headerTitle}</h2>
            {headerMeta !== null ? <span className="text-technical shrink-0">{headerMeta}</span> : null}
            <div className="flex-1" />
            {headerActions}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {error && files.length === 0 ? (
        <GridError message={error} onRetry={() => void library.reload()} />
      ) : empty ? (
        <GridEmpty
          scope={scope}
          inFolder={folderId !== null}
          filtered={filtered}
          tagMatch={tagMatch}
          onShowTag={(tag) => viewActions.showTag(tag)}
          onResetSearch={() => {
            viewActions.setQuery('');
            viewActions.resetFilters();
          }}
          onPickFiles={() => pickerRef.current?.click()}
        />
      ) : (
        <>
          <div
            ref={gridRef}
            className="relative w-full"
            style={{ height: layout.height }}
            onClick={(event) => {
              // Клик по пустому месту снимает выделение.
              if (event.target === event.currentTarget) viewActions.clearSelection();
            }}
          >
            {showSkeleton
              ? layout.boxes.map((box) => (
                  <div
                    key={box.id}
                    style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
                    className="absolute animate-pulse rounded-md bg-surface-raised"
                  />
                ))
              : files.map((file) => {
                  const box = boxById.get(file.id);
                  if (!box) return null;
                  return (
                    <GridCard
                      key={file.id}
                      file={file}
                      box={box}
                      scope={scope}
                      selected={selection.has(file.id)}
                      folderName={folderNameFor(file)}
                      onSelectClick={handleSelectClick}
                      onToggle={handleToggle}
                      onOpen={handleOpen}
                      onDragStart={handleDragStart}
                      onContextSelect={handleContextSelect}
                      onAddTag={handleAddTag}
                      onTrash={(item) => void trashIds([item.id])}
                      onRestore={(item) => void restoreIds([item.id])}
                      onPurge={(item) => setConfirm({ kind: 'purge', ids: [item.id] })}
                      onCopy={(item) => void copyIds([item.id])}
                      onReveal={(item) => void revealFile(item)}
                    />
                  );
                })}
          </div>

          <div ref={sentinelRef} aria-hidden className="h-px w-full" />

          {loadingMore ? (
            <div className="flex h-14 items-center justify-center text-technical">
              Загружаем ещё…
            </div>
          ) : null}
        </>
      )}

      {/*
        Общая «полка» внизу области контента. Здесь же появляются прогресс импорта
        и тосты — они находят контейнер по `id`. Порядок снизу вверх задан в
        tokens.css через `order`, чтобы не зависеть от порядка монтирования порталов.
      */}
      {shelfPortal(
        contentEl,
        <div id="kopirka-shelf" className="absolute inset-x-0 bottom-6">
          {/* ORG-04 — панель массового выделения. */}
          <AnimatePresence>
            {selectedIds.length > 0 && openFileId === null ? (
              scope === 'trash' ? (
                <TrashSelectionBar
                  key="trash-bar"
                  count={selectedIds.length}
                  className="shelf-selection z-40"
                  onRestore={() => void restoreIds(selectedIds)}
                  onPurge={() => setConfirm({ kind: 'purge', ids: selectedIds })}
                  onCancel={() => viewActions.clearSelection()}
                />
              ) : (
                <SelectionBar
                  key="selection-bar"
                  count={selectedIds.length}
                  className="shelf-selection z-40"
                  onMoveToFolder={() => setBulkDialog('folder')}
                  onTag={() => setBulkDialog('tag')}
                  onDelete={() => void trashIds(selectedIds)}
                  onCancel={() => viewActions.clearSelection()}
                />
              )
            ) : null}
          </AnimatePresence>
        </div>,
      )}

      <MoveToFolderDialog
        open={bulkDialog === 'folder'}
        count={selectedIds.length}
        folders={library.folders}
        onCancel={() => setBulkDialog(null)}
        onMove={(target) => {
          setBulkDialog(null);
          void library
            .moveToFolder(selectedIds, target)
            .then(() => toast({ title: 'Перемещено' }))
            .catch((cause: unknown) => notifyError(cause, 'Не удалось переместить файлы'));
        }}
      />

      <AddTagDialog
        open={bulkDialog === 'tag'}
        count={selectedIds.length}
        known={library.tags.map((tag) => tag.name)}
        onCancel={() => setBulkDialog(null)}
        onAdd={(tag) => {
          void library
            .addTags(selectedIds, [tag])
            .then(() => toast({ title: `Тег «${tag}» добавлен` }))
            .catch((cause: unknown) => notifyError(cause, 'Не удалось добавить тег'));
        }}
      />

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.kind === 'empty-trash' ? 'Очистить корзину?' : 'Удалить навсегда?'}
        description={
          confirm?.kind === 'empty-trash'
            ? 'Все файлы из корзины будут стёрты с диска. Отменить это нельзя.'
            : 'Файлы будут стёрты с диска вместе с превью. Отменить это нельзя.'
        }
        confirmLabel={confirm?.kind === 'empty-trash' ? 'Очистить' : 'Удалить навсегда'}
        onConfirm={() => void runConfirm()}
        onCancel={() => setConfirm(null)}
      />

      {/* Выбор файлов из пустого состояния — тот же путь импорта, что и drag&drop. */}
      <input
        ref={pickerRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        className="sr-only"
        onChange={(event) => {
          const picked = event.target.files;
          if (picked && picked.length > 0) void startImport(Array.from(picked), 'drag_drop');
          event.target.value = '';
        }}
      />
    </DropZone>
  );
}
