/**
 * Слой данных библиотеки: список файлов текущего среза, папки, теги, счётчики.
 * Один источник правды для сетки, детального просмотра и импорта.
 *
 * Список тянется курсором (`nextCursor`), метаданные (папки/теги/счётчики) — целиком:
 * их мало, и после каждой мутации они обязаны сойтись с сервером.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  FileListQuery,
  FileRecord,
  FolderRecord,
  LibraryEvent,
  StatsResponse,
  TagRecord,
} from '@shared/api';
import * as api from '@/lib/api';
import { flattenFolders, folderSubtreeIds } from '@/lib/folders';
import { useViewSelector, useViewState } from '@/store/view';

/** Сколько карточек тянем за раз. Хватает на 2–3 экрана сетки. */
const PAGE_SIZE = 60;
/** SEARCH-02 — пауза перед запросом, пока пользователь печатает. */
const QUERY_DEBOUNCE_MS = 250;
/** Как часто спрашиваем сервер о файлах, приехавших мимо окна. */
const EVENTS_POLL_MS = 3000;

/**
 * Приехал ли файл, которого окно ещё не показывает. `known` — идентификаторы карточек
 * текущего среза.
 *
 * Решаем по `fileId`, а не по `sourceType`. Раньше здесь стоял список «внешних»
 * источников, и быстрая команда Finder «Добавить в Копирку» в него не попадала: она
 * шлёт `drag_drop`, тот же источник, что и перетаскивание в окно. Карточка после неё
 * не появлялась до перезагрузки страницы.
 *
 * Собственные перетаскивание и ⌘V от проверки не страдают: их файлы кладёт в список
 * ответ на тот же запрос импорта — задолго до того, как событие дойдёт опросом ленты.
 *
 * В ленте лежат ещё дубли (`duplicate`) и сообщения для системного уведомления
 * (`notice`): дубль в библиотеку не попал, а уведомление вообще не про файлы.
 */
function bringsNewFile(event: LibraryEvent, known: ReadonlySet<number>): boolean {
  if (event.kind !== 'import') return false;
  if (event.outcome !== 'added' && event.outcome !== 'added_similar') return false;
  return !known.has(event.fileId);
}

const EMPTY_STATS: StatsResponse = { library: 0, untagged: 0, trash: 0, similar: 0 };

export interface LibraryValue {
  /** Файлы текущего среза в порядке сортировки. */
  files: readonly FileRecord[];
  total: number;
  /** Первичная загрузка среза: сетку показываем скелетом. */
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => void;
  /** Перечитать список и метаданные. */
  reload: () => Promise<void>;

  folders: readonly FolderRecord[];
  folderNameById: ReadonlyMap<number, string>;
  stats: StatsResponse;
  tags: readonly TagRecord[];
  /** Корень библиотеки на диске — нужен блоку «ПОДРОБНОСТИ» детального просмотра. */
  libraryPath: string;

  /** Заменить записи в списке ответом сервера. */
  applyFiles: (files: readonly FileRecord[]) => void;
  /** Убрать записи из текущего списка (файл уехал из среза). */
  dropFiles: (ids: readonly number[]) => void;

  moveToFolder: (ids: readonly number[], folderId: number | null) => Promise<void>;
  addTags: (ids: readonly number[], tags: readonly string[]) => Promise<void>;
  removeTags: (ids: readonly number[], tags: readonly string[]) => Promise<void>;
  setFileTags: (id: number, tags: readonly string[]) => Promise<void>;
  trashFiles: (ids: readonly number[]) => Promise<void>;
  restoreFiles: (ids: readonly number[]) => Promise<void>;
  purgeFiles: (ids: readonly number[]) => Promise<void>;
  emptyTrash: () => Promise<void>;
  resolveSimilar: (id: number) => Promise<void>;

  createFolder: (name: string, parentFolderId: number | null) => Promise<FolderRecord>;
  renameFolder: (id: number, name: string) => Promise<void>;
  deleteFolder: (id: number) => Promise<void>;
}

/**
 * Экспортирован ради витрины: истории Storybook подставляют готовое значение
 * без сервера. В приложении контекст по-прежнему наполняет только `LibraryProvider`.
 */
export const LibraryContext = createContext<LibraryValue | null>(null);

export function useLibrary(): LibraryValue {
  const value = useContext(LibraryContext);
  if (!value) throw new Error('useLibrary: нет LibraryProvider выше по дереву');
  return value;
}

function messageOf(error: unknown): string {
  if (error instanceof api.ApiRequestError) return error.message;
  return error instanceof Error ? error.message : 'Неизвестная ошибка';
}

/** Строка поиска отстаёт от ввода: без этого запрос уходит на каждую букву. */
function useDebounced(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function LibraryProvider({ children }: { children: ReactNode }) {
  const view = useViewState();
  const query = useDebounced(view.query, QUERY_DEBOUNCE_MS);
  // Пока строка поиска «догоняет» ввод, показанный список уже не соответствует запросу:
  // считаем это загрузкой, иначе на месте результатов мелькает «ничего нет».
  const querySettling = view.query.trim() !== query.trim();

  const [files, setFiles] = useState<FileRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [folders, setFolders] = useState<FolderRecord[]>([]);
  const [stats, setStats] = useState<StatsResponse>(EMPTY_STATS);
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [libraryPath, setLibraryPath] = useState('');

  /** Гонка ответов: применяем только последний запрос среза. */
  const requestId = useRef(0);

  const listQuery = useMemo<FileListQuery>(
    () => ({
      scope: view.scope,
      folderId: view.folderId ?? undefined,
      query: query.trim() === '' ? undefined : query.trim(),
      tags: view.filters.tags.length > 0 ? [...view.filters.tags] : undefined,
      exts: view.filters.exts.length > 0 ? [...view.filters.exts] : undefined,
      dateFrom: view.filters.dateFrom ?? undefined,
      dateTo: view.filters.dateTo ?? undefined,
      sort: view.sort,
      limit: PAGE_SIZE,
    }),
    [view.scope, view.folderId, view.filters, view.sort, query],
  );

  const refreshMeta = useCallback(async () => {
    try {
      const [nextFolders, nextStats, nextTags] = await Promise.all([
        api.listFolders(),
        api.getStats(),
        api.listTags(),
      ]);
      setFolders(nextFolders);
      setStats(nextStats);
      setTags(nextTags);
    } catch (cause) {
      setError(messageOf(cause));
    }
  }, []);

  const fetchFirstPage = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const response = await api.listFiles(listQuery);
      if (id !== requestId.current) return;
      setFiles(response.files);
      setTotal(response.total);
      setCursor(response.nextCursor);
    } catch (cause) {
      if (id !== requestId.current) return;
      setFiles([]);
      setTotal(0);
      setCursor(null);
      setError(messageOf(cause));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [listQuery]);

  useEffect(() => {
    void fetchFirstPage();
  }, [fetchFirstPage]);

  // Счётчики и дерево папок перечитываем и при смене раздела: пока окно открыто,
  // файлы могли приехать снаружи — из расширения или Folder Action.
  useEffect(() => {
    void refreshMeta();
  }, [refreshMeta, view.scope, view.folderId]);

  // Путь библиотеки не меняется на ходу, а /api/settings считает размер на диске —
  // спрашиваем один раз за сессию.
  useEffect(() => {
    void api
      .getSettings()
      .then((settings) => setLibraryPath(settings.libraryPath))
      .catch(() => undefined);
  }, []);

  const loadMore = useCallback(() => {
    if (cursor === null || loading || loadingMore) return;
    const id = requestId.current;
    setLoadingMore(true);
    void api
      .listFiles({ ...listQuery, cursor })
      .then((response) => {
        if (id !== requestId.current) return;
        // Дубли по id возможны, если между страницами что-то импортировали.
        setFiles((prev) => {
          const seen = new Set(prev.map((file) => file.id));
          return [...prev, ...response.files.filter((file) => !seen.has(file.id))];
        });
        setTotal(response.total);
        setCursor(response.nextCursor);
      })
      .catch((cause: unknown) => {
        if (id === requestId.current) setError(messageOf(cause));
      })
      .finally(() => {
        if (id === requestId.current) setLoadingMore(false);
      });
  }, [cursor, listQuery, loading, loadingMore]);

  const reload = useCallback(async () => {
    await Promise.all([fetchFirstPage(), refreshMeta()]);
  }, [fetchFirstPage, refreshMeta]);

  /** Номер последнего увиденного события. null — ленту ещё не читали. */
  const eventCursor = useRef<number | null>(null);
  // Опрос живёт один на всю сессию окна, а перезагружать надо всегда актуальным
  // срезом — поэтому свежий `reload` держим в ссылке, а не в зависимостях эффекта.
  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);
  // По той же причине — показанный список: опрос сверяет с ним номера приехавших файлов.
  const filesRef = useRef(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  // Файл мог приехать снаружи: из расширения, быстрой команды Finder или автоимпорта
  // папки. Спрашиваем сервер, не появилось ли нового, и перечитываем срез — но только
  // пока вкладка видима: смотреть на скрытую всё равно некому.
  useEffect(() => {
    let stopped = false;
    let busy = false;

    const tick = async () => {
      if (stopped || busy || document.visibilityState !== 'visible') return;
      busy = true;
      try {
        const response = await api.getEvents(eventCursor.current ?? undefined);
        if (stopped) return;
        const seen = eventCursor.current;
        eventCursor.current = response.last;
        // Первый опрос только запоминает точку отсчёта: всё, что было до открытия
        // окна, уже показано обычной загрузкой списка.
        if (seen === null) return;
        // Каждое событие приходит ровно один раз (курсор сдвинут выше), поэтому файл,
        // не попавший в текущий срез, не заставит перезагружаться на каждом тике.
        const known = new Set(filesRef.current.map((file) => file.id));
        if (response.events.some((event) => bringsNewFile(event, known))) {
          await reloadRef.current();
        }
      } catch {
        // Сервер моргнул — молчим и пробуем на следующем тике.
      } finally {
        busy = false;
      }
    };

    void tick();
    const timer = window.setInterval(() => void tick(), EVENTS_POLL_MS);
    // Вернулись на вкладку — не ждём целый интервал, спрашиваем сразу.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const applyFiles = useCallback((updated: readonly FileRecord[]) => {
    if (updated.length === 0) return;
    const byId = new Map(updated.map((file) => [file.id, file]));
    setFiles((prev) => prev.map((file) => byId.get(file.id) ?? file));
  }, []);

  const dropFiles = useCallback((ids: readonly number[]) => {
    if (ids.length === 0) return;
    const drop = new Set(ids);
    setFiles((prev) => prev.filter((file) => !drop.has(file.id)));
    setTotal((prev) => Math.max(0, prev - ids.length));
  }, []);

  /**
   * Мутации сервера возвращают обновлённые записи — их и раскладываем.
   * Файл, переставший подходить под текущий срез, из списка убираем.
   */
  const afterMutation = useCallback(
    async (updated: readonly FileRecord[] | undefined, dropIds: readonly number[] | null) => {
      if (dropIds) dropFiles(dropIds);
      else if (updated) applyFiles(updated);
      await refreshMeta();
    },
    [applyFiles, dropFiles, refreshMeta],
  );

  const scope = view.scope;
  const openFolderId = view.folderId;

  const value = useMemo<LibraryValue>(() => {
    const folderNameById = new Map<number, string>(
      flattenFolders(folders).map(({ folder }) => [folder.id, folder.name]),
    );

    /**
     * Уехал ли файл из текущего среза, попав в папку `target`.
     * D1 — «Не разобрано» это файлы без папки; D2 — открытая папка показывает и поддерево.
     */
    const leftScopeAfterMove = (target: number | null): boolean => {
      if (scope === 'untagged') return target !== null;
      if (scope !== 'library' || openFolderId === null) return false;
      if (target === null) return true;
      return !folderSubtreeIds(folders, openFolderId).has(target);
    };

    return {
      files,
      total,
      loading: loading || querySettling,
      loadingMore,
      hasMore: cursor !== null,
      error,
      loadMore,
      reload,
      folders,
      folderNameById,
      stats,
      tags,
      libraryPath,
      applyFiles,
      dropFiles,

      async moveToFolder(ids, folderId) {
        const response = await api.moveFiles({ fileIds: [...ids], folderId });
        await afterMutation(response.files, leftScopeAfterMove(folderId) ? ids : null);
      },
      // После D1 теги на состав «Не разобрано» не влияют — перезагрузка среза не нужна.
      async addTags(ids, tags_) {
        const response = await api.tagFiles({ fileIds: [...ids], add: [...tags_] });
        await afterMutation(response.files, null);
      },
      async removeTags(ids, tags_) {
        const response = await api.tagFiles({ fileIds: [...ids], remove: [...tags_] });
        await afterMutation(response.files, null);
      },
      async setFileTags(id, tags_) {
        const updated = await api.updateFile(id, { tags: [...tags_] });
        await afterMutation([updated], null);
      },
      async trashFiles(ids) {
        await api.deleteFiles({ fileIds: [...ids] });
        await afterMutation(undefined, ids);
      },
      async restoreFiles(ids) {
        await api.restoreFiles({ fileIds: [...ids] });
        await afterMutation(undefined, scope === 'trash' ? ids : null);
        if (scope !== 'trash') await reload();
      },
      async purgeFiles(ids) {
        await api.purgeFiles({ fileIds: [...ids] });
        await afterMutation(undefined, ids);
      },
      async emptyTrash() {
        await api.emptyTrash();
        await reload();
      },
      async resolveSimilar(id) {
        const updated = await api.resolveSimilar(id);
        applyFiles([updated]);
      },

      async createFolder(name, parentFolderId) {
        const created = await api.createFolder({ name, parentFolderId });
        await refreshMeta();
        return created;
      },
      async renameFolder(id, name) {
        await api.updateFolder(id, { name });
        await refreshMeta();
      },
      async deleteFolder(id) {
        await api.deleteFolder(id);
        await reload();
      },
    };
  }, [
    files,
    total,
    loading,
    querySettling,
    loadingMore,
    cursor,
    error,
    loadMore,
    reload,
    folders,
    stats,
    tags,
    libraryPath,
    applyFiles,
    dropFiles,
    afterMutation,
    refreshMeta,
    scope,
    openFolderId,
  ]);

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

/** Файл, открытый в детальном просмотре, и его позиция в текущем списке. */
export function useOpenFile(): { file: FileRecord | null; index: number; count: number } {
  const openFileId = useViewSelector((s) => s.openFileId);
  const { files } = useLibrary();
  const index = openFileId === null ? -1 : files.findIndex((file) => file.id === openFileId);
  return { file: index === -1 ? null : (files[index] ?? null), index, count: files.length };
}
