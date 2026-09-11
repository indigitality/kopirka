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
import { EllipsisVertical, Trash2 } from 'lucide-react';
import type { FileRecord, FolderRecord } from '@shared/api';
import * as api from '@/lib/api';
import { flattenFolders } from '@/lib/folders';
import { plural } from '@/lib/format';
import { Icon } from '@/lib/icons';
import { DUR_FAST, EASE_OUT } from '@/lib/motion';
import { isMacLike, platformStrings } from '@/lib/platform';
import { EASE_IN } from '@/components/ui/motion-presets';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Modal, ModalContent } from '@/components/ui/Modal';
import { Popover, PopoverContent, PopoverItem, PopoverSeparator, PopoverTrigger } from '@/components/ui/Popover';
import { SelectionBar } from '@/components/ui/SelectionBar';
import { useToast } from '@/components/ui/Toast';
import { useLibrary } from '@/features/library/LibraryProvider';
import { useExport } from '@/features/export';
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
import { useMarquee } from './useMarquee';
import { useMasonry, type MasonryInput } from './useMasonry';

/** Пропорции карточек-заглушек на первой загрузке — чтобы экран не был пустым. */
const SKELETON = [0.75, 1.3, 0.66, 1, 1.45, 0.8, 1.1, 0.62, 1.35, 0.9, 1.2, 0.7].map(
  (ratio, index): MasonryInput => ({ id: -1 - index, ratio }),
);

type PendingConfirm =
  | { kind: 'purge'; ids: readonly number[] }
  | { kind: 'empty-trash' }
  | { kind: 'delete-folder'; folder: FolderRecord }
  | null;

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
  const { exportFiles } = useExport();
  const { toast } = useToast();

  const scope = useViewSelector((s) => s.scope);
  const folderId = useViewSelector((s) => s.folderId);
  const gridSize = useViewSelector((s) => s.gridSize);
  const query = useViewSelector((s) => s.query);
  const filters = useViewSelector((s) => s.filters);
  const selectedIds = useViewSelector((s) => s.selectedIds);
  const openFileId = useViewSelector((s) => s.openFileId);

  const metrics = useGridMetrics(gridSize);

  /*
    Заголовок контента — решение D8 (дизайн-аудит 4.7, 4.30), в редизайне это
    полоса 44 px внутри панели сетки (R02/R04/R05, полка R13 · `G7C-0`).
    Считаем его до раскладки: под заголовком у сетки другое верхнее поле — 12,
    а не 16 (в макете заголовок и сетка разделены `gap: 12`).
  */
  const needle = query.trim();
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
  const masonryOptions = useMemo(
    () => ({ ...metrics, padTop: headerTitle === null ? metrics.pad : metrics.headerGap }),
    [metrics, headerTitle],
  );

  const [bulkDialog, setBulkDialog] = useState<'folder' | 'tag' | null>(null);
  const [confirm, setConfirm] = useState<PendingConfirm>(null);
  const [sentinelVisible, setSentinelVisible] = useState(false);
  /** Открыто меню папки в заголовке контента (R02 · «⋮»). */
  const [folderMenuOpen, setFolderMenuOpen] = useState(false);
  /** Папка, которую переименовывают из этого меню: инлайн-правка живёт в сайдбаре. */
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null);

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
  const { ref: gridRef, layout } = useMasonry(masonryItems, masonryOptions);
  const boxById = useMemo(() => new Map(layout.boxes.map((box) => [box.id, box])), [layout.boxes]);

  /*
    FDB-08 — выделение рамкой по пустому месту сетки (D20). Живёт в координатах
    контейнера, теми же, в которых `useMasonry` считает `layout.boxes`, поэтому
    пересечение — обычная проверка прямоугольников, без пересчёта в окно.
  */
  const marquee = useMarquee({
    boxes: showSkeleton ? [] : layout.boxes,
    getSelection: () => getViewState().selectedIds,
    onSelect: (ids) => viewActions.setSelection(ids, ids.at(-1) ?? null),
  });

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
    /*
      На macOS ctrl+клик — это правый клик: система шлёт и `contextmenu`, и обычный
      `click` с `ctrlKey`, и ветка «модификатор → переключить» выбрасывала карточку
      из выделения ровно в тот момент, когда по ней открывали меню. Отдаём такой
      клик контекстному меню целиком. На Windows Ctrl — настоящий модификатор
      выделения, поэтому ветка платформенная, а не общая.
    */
    if (event.ctrlKey && !event.metaKey && isMacLike()) return;
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

  /** ⌘A и чекбокс панели выделения — одно и то же: все файлы текущего среза. */
  const selectAllVisible = useCallback(() => {
    viewActions.setSelection(filesRef.current.map((file) => file.id));
  }, []);

  /**
   * Чекбокс панели (D21/D21b): выбрано всё, что загружено, — снимаем; иначе
   * выбираем всё. Сверяемся с длиной списка, а не с `library.total`: при
   * постраничной подгрузке в срезе может быть больше файлов, чем в сетке, и
   * «выбрать все» честно означает «все видимые».
   */
  const toggleSelectAll = useCallback(() => {
    const list = filesRef.current;
    if (getViewState().selectedIds.length >= list.length) viewActions.clearSelection();
    else selectAllVisible();
  }, [selectAllVisible]);

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

  /** «В папку…» из меню карточки (R14) — тот же диалог, что у панели выделения. */
  const handleMoveToFolder = useCallback((file: FileRecord) => {
    if (!getViewState().selectedIds.includes(file.id)) {
      viewActions.setSelection([file.id], file.id);
    }
    setBulkDialog('folder');
  }, []);

  /**
   * FDB-12 — действие из меню карточки идёт на всё выделение, если карточка в него
   * входит; иначе — только на неё саму. Тот же договор, что у `handleAddTag`
   * и `handleMoveToFolder` выше, только там он ещё и переносит выделение.
   */
  const groupIds = useCallback((file: FileRecord): readonly number[] => {
    const selected = getViewState().selectedIds;
    return selected.includes(file.id) ? selected : [file.id];
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
        /*
          Системный буфер держит ровно одну картинку — пачку туда не положить.
          Говорим об этом прямо и показываем, чем её забрать (FDB-12, FDB-05).
        */
        toast({
          title:
            ids.length > 1
              ? `Скопирован первый из ${ids.length} — для пачки используйте Экспорт`
              : 'Скопировано в буфер',
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
        notifyError(cause, platformStrings().revealFailedToast);
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
      } else if (pending.kind === 'empty-trash') {
        await library.emptyTrash();
        viewActions.clearSelection();
        toast({ title: 'Корзина очищена' });
      } else {
        // Удаляется всё поддерево — сетка стоит внутри него, поэтому уходим в библиотеку.
        await library.deleteFolder(pending.folder.id);
        viewActions.setScope('library');
        toast({ title: `Папка «${pending.folder.name}» удалена` });
      }
    } catch (cause) {
      notifyError(
        cause,
        pending.kind === 'delete-folder' ? 'Не удалось удалить папку' : 'Не удалось удалить файлы',
      );
    }
  }, [confirm, library, toast, notifyError]);

  // ── Папка заголовка (меню «⋮», R02) ──────────────────────────────────────
  const createSubfolder = useCallback(
    async (parentFolderId: number) => {
      try {
        const created = await library.createFolder('Новая папка', parentFolderId);
        viewActions.expandFolder(parentFolderId);
        // Переименование сразу: пустая «Новая папка» без имени бесполезна.
        setRenaming({ id: created.id, name: created.name });
      } catch (cause) {
        notifyError(cause, 'Не удалось создать папку');
      }
    },
    [library, notifyError],
  );

  const commitRename = useCallback(
    async (id: number, name: string) => {
      setRenaming(null);
      const trimmed = name.trim();
      if (trimmed === '') return;
      try {
        await library.renameFolder(id, trimmed);
      } catch (cause) {
        notifyError(cause, 'Не удалось переименовать папку');
      }
    },
    [library, notifyError],
  );

  // ── Хоткеи 6.4 ───────────────────────────────────────────────────────────
  useGridHotkeys({
    detailOpen: openFileId !== null,
    hasSelection: selectedIds.length > 0,
    /* Слои сетки: пока открыт любой из них, Esc закрывает его, а не выделение. */
    layerOpen: bulkDialog !== null || confirm !== null || renaming !== null || folderMenuOpen,
    selectAll: selectAllVisible,
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
    exportSelection: () => {
      const state = getViewState();
      // Открытый файл важнее выделения — так же ведут себя ⌘C и ⌫.
      exportFiles(state.openFileId !== null ? [state.openFileId] : state.selectedIds);
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

  /*
    Имя папки тёмным чипом на карточке — правило редизайна (R01, R03 и макет
    Сергея «Библиотека — сетка обновлённый дизайн»):

      «Вся библиотека», поиск, корзина — чип у каждого файла, у которого папка есть;
      внутри папки                     — только у карточек из её подпапок (R02);
      «Не разобрано»                   — папки нет по определению, значит и чипа нет.

    Одна проверка покрывает все четыре случая: показываем, когда у файла есть
    папка и это не та папка, в которой мы сейчас стоим.
  */
  const folderNameFor = (file: FileRecord): string | null => {
    if (file.folderId === null) return null;
    if (folderId !== null && file.folderId === folderId) return null;
    return library.folderNameById.get(file.folderId) ?? null;
  };

  // Поиск по имени тег не находит (SEARCH-02) — предлагаем перейти в фильтр (01 п.2a).
  const tagMatch =
    needle === ''
      ? null
      : (library.tags.find((tag) => tag.name.toLowerCase() === needle.toLowerCase()) ?? null);

  const empty = !loading && files.length === 0;

  // Счётчик берём из ответа списка, а не из stats: он всегда совпадает с тем, что видно.
  const fileCount = `${library.total} ${plural(library.total, 'файл', 'файла', 'файлов')}`;
  const headerMeta = loading
    ? null
    : scope === 'trash'
      ? `${fileCount} · ${plural(library.total, 'хранится', 'хранятся', 'хранятся')} 30 дней`
      : fileCount;

  /** Папка, в которой стоит сетка: нужна меню «⋮» и подтверждению удаления. */
  const currentFolder: FolderRecord | null =
    folderId === null
      ? null
      : (flattenFolders(library.folders).find(({ folder }) => folder.id === folderId)?.folder ??
        null);

  /*
    Действие справа в заголовке — по R13 · `G7C-0`: у папки «⋮» с меню, у корзины
    сплошная опасная кнопка, у поиска — «Сбросить», у среза без папки ничего.
  */
  const headerActions: ReactNode[] = [];
  if (scope === 'trash' && library.total > 0 && !loading) {
    headerActions.push(
      <Button
        key="empty-trash"
        variant="danger-solid"
        icon={<Icon icon={Trash2} size={16} />}
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
  } else if (currentFolder !== null) {
    headerActions.push(
      <Popover key="folder-menu" open={folderMenuOpen} onOpenChange={setFolderMenuOpen}>
        <PopoverTrigger asChild>
          <IconButton label={`Меню папки «${currentFolder.name}»`} variant="secondary">
            <Icon icon={EllipsisVertical} size={16} aria-hidden />
          </IconButton>
        </PopoverTrigger>
        <PopoverContent align="end">
          <PopoverItem
            onClick={() => {
              setFolderMenuOpen(false);
              void createSubfolder(currentFolder.id);
            }}
          >
            Новая папка внутри
          </PopoverItem>
          <PopoverItem
            onClick={() => {
              setFolderMenuOpen(false);
              setRenaming({ id: currentFolder.id, name: currentFolder.name });
            }}
          >
            Переименовать
          </PopoverItem>
          <PopoverSeparator />
          <PopoverItem
            danger
            onClick={() => {
              setFolderMenuOpen(false);
              setConfirm({ kind: 'delete-folder', folder: currentFolder });
            }}
          >
            Удалить папку
          </PopoverItem>
        </PopoverContent>
      </Popover>,
    );
  }

  /** Тексты подтверждений сняты с узлов R14 (порядок: файл, корзина, папка). */
  const confirmCopy = (() => {
    if (confirm?.kind === 'empty-trash') {
      return {
        title: 'Очистить корзину?',
        description: `${fileCount} из корзины ${plural(library.total, 'будет стёрт', 'будут стёрты', 'будут стёрты')} с диска. Отменить это действие нельзя.`,
        confirmLabel: 'Очистить корзину',
      };
    }
    if (confirm?.kind === 'delete-folder') {
      return {
        title: `Удалить папку «${confirm.folder.name}»?`,
        description:
          'Папка исчезнет вместе с вложенными. Файлы не удаляются — они переедут в «Не разобрано».',
        confirmLabel: 'Удалить папку',
      };
    }
    const count = confirm?.kind === 'purge' ? confirm.ids.length : 0;
    return {
      title: 'Удалить навсегда?',
      description:
        count === 1
          ? 'Файл исчезнет из библиотеки и с диска. Отменить это действие нельзя.'
          : `${count} ${plural(count, 'файл исчезнет', 'файла исчезнут', 'файлов исчезнут')} из библиотеки и с диска. Отменить это действие нельзя.`,
      confirmLabel: 'Удалить навсегда',
    };
  })();

  return (
    /*
      FDB-08 (а) — протяжка по сетке не должна выделять текст чипов и заголовка.
      Поля ввода исключены точечно: внутри них выделение текста обязано работать.
    */
    <DropZone className="flex min-h-full flex-col select-none [&_input]:select-text [&_textarea]:select-text">
      <AnimatePresence initial={false}>
        {headerTitle !== null ? (
          <motion.div
            key="content-header"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: DUR_FAST, ease: EASE_OUT } }}
            exit={{ opacity: 0, transition: { duration: DUR_FAST, ease: EASE_IN } }}
            /*
              Заголовок липнет к верху панели и закрашен её цветом: в макете он не
              скроллится вовсе (лежит рядом с сеткой), а здесь прокручивается вся
              колонка — иначе договор с оболочкой (`<main>` скроллится) пришлось бы
              менять. Верхнее поле — поле панели, боковые — поле блока сетки.
            */
            className="sticky top-0 z-20 shrink-0 bg-panel px-[var(--grid-pad)] pt-[var(--grid-pad)]"
          >
            <div className="flex h-[var(--size-content-header)] items-center gap-2.5">
              <h2 className="min-w-0 truncate text-xl leading-6 font-medium tracking-tight text-ink">
                {headerTitle}
              </h2>
              {headerMeta !== null ? (
                <span className="shrink-0 text-sm leading-[18px] text-ink-muted">{headerMeta}</span>
              ) : null}
              <div className="flex-1" />
              {headerActions}
            </div>
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
            className="relative w-full shrink-0"
            style={{ height: layout.height }}
            onPointerDown={marquee.onPointerDown}
            onClick={(event) => {
              // Клик по пустому месту снимает выделение — но не тот, что завершил протяжку рамки.
              if (marquee.didDrag()) return;
              if (event.target === event.currentTarget) viewActions.clearSelection();
            }}
          >
            {/* Рамка выделения — D20: заливка `brand-tint`, обводка 1 px `brand`, радиус 4. */}
            {marquee.rect !== null ? (
              <div
                aria-hidden
                data-marquee
                style={{
                  left: marquee.rect.x,
                  top: marquee.rect.y,
                  width: marquee.rect.width,
                  height: marquee.rect.height,
                }}
                className="pointer-events-none absolute z-30 rounded-xs border border-brand bg-brand-tint"
              />
            ) : null}
            {showSkeleton
              ? layout.boxes.map((box) => (
                  <div
                    key={box.id}
                    style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
                    className="absolute animate-pulse rounded-card bg-raised"
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
                      onMoveToFolder={handleMoveToFolder}
                      onTrash={(item) => void trashIds(groupIds(item))}
                      onRestore={(item) => void restoreIds(groupIds(item))}
                      onPurge={(item) => setConfirm({ kind: 'purge', ids: groupIds(item) })}
                      onCopy={(item) => void copyIds(groupIds(item))}
                      onReveal={(item) => void revealFile(item)}
                    />
                  );
                })}
          </div>

          <div ref={sentinelRef} aria-hidden className="h-px w-full shrink-0" />

          {loadingMore ? (
            <div className="flex h-14 shrink-0 items-center justify-center text-technical">
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
        <div id="kopirka-shelf" className="absolute inset-x-0 bottom-[var(--shelf-bottom)]">
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
                  total={library.total}
                  onToggleAll={toggleSelectAll}
                  className="shelf-selection z-40"
                  onMoveToFolder={() => setBulkDialog('folder')}
                  onTag={() => setBulkDialog('tag')}
                  onExport={() => exportFiles(selectedIds)}
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

      {/* Тексты подтверждений — с узлов R14 · «Подтверждение действия». */}
      <ConfirmDialog
        open={confirm !== null}
        title={confirmCopy.title}
        description={confirmCopy.description}
        confirmLabel={confirmCopy.confirmLabel}
        onConfirm={() => void runConfirm()}
        onCancel={() => setConfirm(null)}
      />

      {/*
        Переименование папки из меню «⋮». В сайдбаре это инлайн-правка строки
        (зона оболочки), в заголовке контента строки нет — отсюда маленькая модалка.
      */}
      <Modal open={renaming !== null} onOpenChange={(next) => (next ? undefined : setRenaming(null))}>
        <ModalContent
          title="Переименовать папку"
          description="Имя видно в сайдбаре и в заголовке контента."
          footer={
            <>
              <Button variant="secondary" onClick={() => setRenaming(null)}>
                Отмена
              </Button>
              <Button
                variant="primary"
                disabled={(renaming?.name ?? '').trim() === ''}
                onClick={() => {
                  if (renaming) void commitRename(renaming.id, renaming.name);
                }}
              >
                Переименовать
              </Button>
            </>
          }
        >
          <Input
            autoFocus
            value={renaming?.name ?? ''}
            aria-label="Имя папки"
            onChange={(event) =>
              setRenaming((prev) => (prev === null ? prev : { ...prev, name: event.target.value }))
            }
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || !renaming) return;
              event.preventDefault();
              void commitRename(renaming.id, renaming.name);
            }}
          />
        </ModalContent>
      </Modal>

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
