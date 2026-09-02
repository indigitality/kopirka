/**
 * Состояние вида: что показываем, что выбрано, свёрнут ли сайдбар.
 * Внешних библиотек нет — обычный снапшот + useSyncExternalStore.
 * Данные (файлы, папки) сюда не кладём: их тянет тот, кто рисует сетку.
 */
import { useSyncExternalStore } from 'react';
import type { FileExt, LibraryScope, SortKey } from '@shared/api';

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
  sidebarCollapsed: boolean;
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
  sidebarCollapsed: false,
  selectedIds: [],
  selectionAnchorId: null,
  openFileId: null,
  collapsedFolderIds: [],
};

let state: ViewState = initialState;
const listeners = new Set<() => void>();

function setState(patch: Partial<ViewState>): void {
  const next = { ...state, ...patch };
  const changed = (Object.keys(patch) as (keyof ViewState)[]).some((key) => next[key] !== state[key]);
  if (!changed) return;
  state = next;
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
  setFilters(filters: ViewFilters): void {
    setState({ filters, selectedIds: [], selectionAnchorId: null });
  },
  resetFilters(): void {
    setState({ filters: emptyFilters });
  },
  setSort(sort: SortKey): void {
    setState({ sort });
  },
  toggleSidebar(): void {
    setState({ sidebarCollapsed: !state.sidebarCollapsed });
  },
  setSidebarCollapsed(sidebarCollapsed: boolean): void {
    setState({ sidebarCollapsed });
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
