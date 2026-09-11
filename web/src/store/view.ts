/**
 * Состояние вида: что показываем и что выбрано.
 * Внешних библиотек нет — обычный снапшот + useSyncExternalStore.
 * Данные (файлы, папки) сюда не кладём: их тянет тот, кто рисует сетку.
 *
 * Поля `sidebarCollapsed` больше нет: редизайн (02.09.2026) убрал сворачивание
 * сайдбара вместе с кнопкой и ⌘\. Старые записи в `localStorage` от этого не
 * ломаются — разбор игнорирует незнакомые ключи.
 */
import { useSyncExternalStore } from 'react';
import type { FileExt, LibraryScope, SortKey } from '@shared/api';

/** D5 — три размера карточки: крупный, средний, мелкий. */
export type GridSize = 'l' | 'm' | 's';

export const GRID_SIZES: readonly GridSize[] = ['l', 'm', 's'];

const SORT_KEYS: readonly SortKey[] = ['added_desc', 'added_asc', 'name_asc', 'name_desc'];

/** SEARCH-01/03/04 — набор фильтров панели «Фильтр». Пустой = фильтр не задан. */
export interface ViewFilters {
  tags: readonly string[];
  exts: readonly FileExt[];
  /** ISO 8601 или `YYYY-MM-DD`. */
  dateFrom: string | null;
  dateTo: string | null;
}

export const emptyFilters: ViewFilters = { tags: [], exts: [], dateFrom: null, dateTo: null };

export interface ViewState {
  /** Активный раздел сайдбара. */
  scope: LibraryScope;
  /** Выбранная папка внутри раздела; null — папка не выбрана. */
  folderId: number | null;
  /** SEARCH-02 — строка поиска по имени. */
  query: string;
  /** SEARCH-01/03/04 — фильтры. */
  filters: ViewFilters;
  /** LIB-04 — порядок сортировки. */
  sort: SortKey;
  /** D5 — размер карточек сетки. Сохраняется между запусками. */
  gridSize: GridSize;
  /** ORG-04 — id выделенных карточек. */
  selectedIds: readonly number[];
  /** Якорь для Shift+клика: последняя карточка, по которой кликнули без Shift. */
  selectionAnchorId: number | null;
  /** LIB-02 — открытый в детальном просмотре файл. */
  openFileId: number | null;
  /**
   * Свёрнутые папки сайдбара. Храним именно свёрнутые, а не раскрытые:
   * дерево по умолчанию раскрыто, и новая папка появляется сразу видимой.
   */
  collapsedFolderIds: readonly number[];
}

const initialState: ViewState = {
  scope: 'library',
  folderId: null,
  query: '',
  filters: emptyFilters,
  sort: 'added_desc',
  gridSize: 'm',
  selectedIds: [],
  selectionAnchorId: null,
  openFileId: null,
  collapsedFolderIds: [],
};

/*
  ── Сохранение вида (дизайн-аудит §3.6) ──────────────────────────────────────
  Сохраняем ровно три поля. Фильтры и поиск — нарочно нет: открыть приложение
  и увидеть отфильтрованную библиотеку страшнее, чем заново нажать три чипа.
  В `AppConfig` это не тащим: вид — не настройка приложения, а состояние окна.
  Любое обращение к хранилищу может бросить (приватный режим, запрет на данные
  сайта), поэтому и чтение, и запись — в try/catch.

  Ключ хранилища не менялся: в записи от прошлой версии лежит ещё и
  `sidebarCollapsed`, но разбор берёт только знакомые поля, а запись затирает
  лишнее при первом же изменении вида.
*/
const STORAGE_KEY = 'kopirka.view';

type PersistedKey = 'gridSize' | 'sort' | 'collapsedFolderIds';

const PERSISTED_KEYS: readonly PersistedKey[] = ['gridSize', 'sort', 'collapsedFolderIds'];

/** Разбор без доверия: в хранилище мог остаться вид от прошлой версии. */
function readPersisted(): Partial<Pick<ViewState, PersistedKey>> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const source = parsed as Record<string, unknown>;
    const result: Partial<Pick<ViewState, PersistedKey>> = {};

    if (GRID_SIZES.includes(source.gridSize as GridSize)) result.gridSize = source.gridSize as GridSize;
    if (SORT_KEYS.includes(source.sort as SortKey)) result.sort = source.sort as SortKey;
    if (Array.isArray(source.collapsedFolderIds)) {
      result.collapsedFolderIds = source.collapsedFolderIds.filter(
        (id): id is number => typeof id === 'number' && Number.isInteger(id),
      );
    }
    return result;
  } catch {
    return {};
  }
}

function writePersisted(next: ViewState): void {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        gridSize: next.gridSize,
        sort: next.sort,
        collapsedFolderIds: next.collapsedFolderIds,
      }),
    );
  } catch {
    /* Хранилище недоступно — вид просто не переживёт перезапуск. */
  }
}

let state: ViewState = { ...initialState, ...readPersisted() };
const listeners = new Set<() => void>();

function setState(patch: Partial<ViewState>): void {
  const next = { ...state, ...patch };
  const changed = (Object.keys(patch) as (keyof ViewState)[]).some((key) => next[key] !== state[key]);
  if (!changed) return;
  const persistedChanged = PERSISTED_KEYS.some((key) => next[key] !== state[key]);
  state = next;
  if (persistedChanged) writePersisted(state);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = (): ViewState => state;

export function useViewState(): ViewState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Точечная подписка — компонент не перерисовывается на чужие поля. */
export function useViewSelector<T>(select: (s: ViewState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => select(state),
    () => select(state),
  );
}

/** Снимок состояния вне React — нужен обработчикам клавиш и перетаскивания. */
export function getViewState(): ViewState {
  return state;
}

export const viewActions = {
  setScope(scope: LibraryScope): void {
    setState({ scope, folderId: null, selectedIds: [], selectionAnchorId: null, openFileId: null });
  },
  openFolder(folderId: number): void {
    setState({
      scope: 'library',
      folderId,
      selectedIds: [],
      selectionAnchorId: null,
      openFileId: null,
    });
  },
  setQuery(query: string): void {
    setState({ query });
  },
  /**
   * «Показать всё с этим тегом» — из пилюли в просмотре и из пустого состояния поиска.
   * Раздел и папка сбрасываются: счётчик тега считается по всей библиотеке,
   * и результат должен совпасть с обещанным числом.
   */
  showTag(tag: string): void {
    setState({
      scope: 'library',
      folderId: null,
      query: '',
      filters: { ...emptyFilters, tags: [tag] },
      selectedIds: [],
      selectionAnchorId: null,
      openFileId: null,
    });
  },
  /**
   * NEW-02 — «применить как фильтр» (⌘↵) из поиск-модалки: строка запроса и
   * закреплённые чипы разом ложатся на сетку. Одним действием, а не тремя:
   * иначе список успел бы съездить трижды, а выделение — сброситься дважды.
   * Даты панель фильтров держит сама, поэтому здесь их нет: модалка их не ставит,
   * но и не имеет права молча стереть — `dateFrom`/`dateTo` остаются как были.
   */
  applySearch(next: {
    query: string;
    tags: readonly string[];
    exts: readonly FileExt[];
    folderId?: number | null;
  }): void {
    setState({
      scope: 'library',
      folderId: next.folderId ?? null,
      query: next.query,
      filters: {
        ...state.filters,
        tags: [...next.tags],
        exts: [...next.exts],
      },
      selectedIds: [],
      selectionAnchorId: null,
      openFileId: null,
    });
  },
  setFilters(filters: ViewFilters): void {
    setState({ filters, selectedIds: [], selectionAnchorId: null });
  },
  resetFilters(): void {
    setState({ filters: emptyFilters });
  },
  setSort(sort: SortKey): void {
    setState({ sort });
  },
  setGridSize(gridSize: GridSize): void {
    setState({ gridSize });
  },
  setSelection(selectedIds: readonly number[], anchorId?: number | null): void {
    setState({
      selectedIds,
      ...(anchorId === undefined ? {} : { selectionAnchorId: anchorId }),
    });
  },
  toggleSelected(id: number): void {
    const has = state.selectedIds.includes(id);
    setState({
      selectedIds: has ? state.selectedIds.filter((x) => x !== id) : [...state.selectedIds, id],
      selectionAnchorId: id,
    });
  },
  clearSelection(): void {
    setState({ selectedIds: [], selectionAnchorId: null });
  },
  openFile(openFileId: number | null): void {
    setState({ openFileId });
  },
  toggleFolderCollapsed(id: number): void {
    const collapsed = state.collapsedFolderIds.includes(id);
    setState({
      collapsedFolderIds: collapsed
        ? state.collapsedFolderIds.filter((x) => x !== id)
        : [...state.collapsedFolderIds, id],
    });
  },
  /** Раскрыть папку принудительно — например, когда внутрь добавили подпапку. */
  expandFolder(id: number): void {
    if (!state.collapsedFolderIds.includes(id)) return;
    setState({ collapsedFolderIds: state.collapsedFolderIds.filter((x) => x !== id) });
  },
};

/** Только для тестов и витрины: вернуть стор в исходное состояние. */
export function resetViewState(): void {
  state = initialState;
  for (const listener of listeners) listener();
}
