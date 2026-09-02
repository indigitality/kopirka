/**
 * ORG-03 — перетаскивание карточек на папки, разделы и корзину сайдбара.
 *
 * Сделано на pointer-событиях, а не на HTML5 drag&drop. Причина в окне приложения:
 * wry подменяет у WKWebView методы `NSDraggingDestination` (`wry-0.55/src/wkwebview/drag_drop.rs`)
 * и зовёт оригинальную реализацию, только если обработчик Tauri вернул `false`.
 * Обработчик Tauri (`tauri-runtime-wry/src/lib.rs`) возвращает `true` всегда, значит
 * `performDragOperation` до WebKit не доходит и HTML-событие `drop` внутри страницы
 * не наступает вовсе. В браузере HTML5-перенос работал, в окне — нет.
 *
 * Цели помечены атрибутом `data-drop-target`; кто под курсором — считаем через
 * `document.elementFromPoint`, а не через события целей: так одинаково работает
 * и в браузере, и в окне приложения, и призрак не мешает попаданию (он `pointer-events: none`).
 */
import { useSyncExternalStore } from 'react';

/** Атрибут цели: `folder:<id>` | `unfiled` | `trash`. */
export const DROP_TARGET_ATTR = 'data-drop-target';

/** Контейнер, который автопрокручивается, когда курсор с грузом подходит к его краю. */
export const DROP_SCROLL_ATTR = 'data-drop-scroll';

export type DropTarget =
  | { kind: 'folder'; folderId: number }
  | { kind: 'unfiled' }
  | { kind: 'trash' };

/** Превью для призрака. `src` пуст у битого файла и у форматов без превью. */
export interface DragPreview {
  id: number;
  src: string | null;
}

export interface FileDragSnapshot {
  /** id карточек под переносом. */
  ids: readonly number[];
  /** Идёт перенос карточек указателем — рисуем призрак и подсказки целей. */
  dragging: boolean;
  /** Над окном тащат файлы из Finder. */
  external: boolean;
  /** Ключ цели под курсором. */
  overKey: string | null;
  /** Цель под курсором ничего не изменит: подсветки нет, курсор `not-allowed`. */
  rejected: boolean;
  previews: readonly DragPreview[];
}

/** Насколько далеко надо увести указатель, чтобы это стало переносом, а не кликом. */
export const DRAG_THRESHOLD = 6;

/** Автопрокрутка списка папок: полоса у края и шаг за кадр. */
const SCROLL_EDGE = 44;
const SCROLL_STEP = 14;

/** Сколько превью показываем в стопке призрака. */
const GHOST_STACK = 3;

export function dropTargetKey(target: DropTarget): string {
  return target.kind === 'folder' ? `folder:${target.folderId}` : target.kind;
}

export function parseDropTarget(raw: string | null | undefined): DropTarget | null {
  if (!raw) return null;
  if (raw === 'unfiled') return { kind: 'unfiled' };
  if (raw === 'trash') return { kind: 'trash' };
  const match = /^folder:(\d+)$/.exec(raw);
  if (!match?.[1]) return null;
  return { kind: 'folder', folderId: Number(match[1]) };
}

// ── Состояние переноса ─────────────────────────────────────────────────────

let ids: readonly number[] = [];
let dragging = false;
let external = false;
let overKey: string | null = null;
let rejected = false;
let previews: readonly DragPreview[] = [];
let current: DropTarget | null = null;
/**
 * Папка, в которой файл лежит сейчас. Известна только когда тащат одну карточку —
 * тогда её же папка и «Не разобрано» для пустой папки бросок не примут.
 */
let sourceFolderId: number | null | undefined;

let snapshot: FileDragSnapshot = {
  ids,
  dragging,
  external,
  overKey,
  rejected,
  previews,
};

const listeners = new Set<() => void>();

function emit(): void {
  snapshot = { ids, dragging, external, overKey, rejected, previews };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = (): FileDragSnapshot => snapshot;

/** Снимок переноса целиком: ссылка меняется только вместе с состоянием. */
export function useFileDragSnapshot(): FileDragSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Точечная подписка. Селектор обязан возвращать примитив — иначе рендер зациклится. */
export function useFileDrag<T extends string | number | boolean | null>(
  select: (state: FileDragSnapshot) => T,
): T {
  return useSyncExternalStore(
    subscribe,
    () => select(snapshot),
    () => select(snapshot),
  );
}

/** Принимает ли цель то, что тащат: карточки — все три вида, файлы из Finder — только папки. */
export function acceptsDrag(target: DropTarget, state: FileDragSnapshot): boolean {
  if (state.dragging) return true;
  if (state.external) return target.kind === 'folder';
  return false;
}

// ── Позиция призрака ───────────────────────────────────────────────────────

let position = { x: 0, y: 0 };
const positionListeners = new Set<(x: number, y: number) => void>();

// ── Сброс: обработчик регистрирует App ─────────────────────────────────────

type DropHandler = (target: DropTarget, fileIds: readonly number[]) => void;
let dropHandler: DropHandler | null = null;

/**
 * Кто исполняет сброс. Регистрация модульная, а не через пропсы: цель под курсором
 * считается здесь, и строка сайдбара о самом броске уже не знает.
 */
export function setDropHandler(handler: DropHandler): () => void {
  dropHandler = handler;
  return () => {
    if (dropHandler === handler) dropHandler = null;
  };
}

// ── Поиск цели под курсором ────────────────────────────────────────────────

function findTarget(x: number, y: number): DropTarget | null {
  const element = document.elementFromPoint(x, y);
  const holder = element?.closest(`[${DROP_TARGET_ATTR}]`);
  return parseDropTarget(holder?.getAttribute(DROP_TARGET_ATTR));
}

function isRejected(target: DropTarget): boolean {
  if (target.kind === 'folder') return sourceFolderId === target.folderId;
  if (target.kind === 'unfiled') return sourceFolderId === null;
  return false;
}

// ── Автопрокрутка списка папок ─────────────────────────────────────────────

let scrollFrame = 0;
let scrollSpeed = 0;
let scrollBox: HTMLElement | null = null;

function tickScroll(): void {
  scrollFrame = 0;
  if (scrollSpeed === 0 || !scrollBox) return;
  scrollBox.scrollTop += scrollSpeed;
  scrollFrame = requestAnimationFrame(tickScroll);
}

function updateScroll(x: number, y: number): void {
  scrollBox = document.querySelector<HTMLElement>(`[${DROP_SCROLL_ATTR}]`);
  scrollSpeed = 0;
  if (scrollBox) {
    const box = scrollBox.getBoundingClientRect();
    const inside = x >= box.left && x <= box.right && y >= box.top - SCROLL_EDGE && y <= box.bottom + SCROLL_EDGE;
    if (inside) {
      if (y < box.top + SCROLL_EDGE) scrollSpeed = -SCROLL_STEP;
      else if (y > box.bottom - SCROLL_EDGE) scrollSpeed = SCROLL_STEP;
    }
  }
  if (scrollSpeed !== 0 && scrollFrame === 0) scrollFrame = requestAnimationFrame(tickScroll);
}

function stopScroll(): void {
  if (scrollFrame !== 0) cancelAnimationFrame(scrollFrame);
  scrollFrame = 0;
  scrollSpeed = 0;
  scrollBox = null;
}

// ── Оформление курсора на время переноса ───────────────────────────────────

function applyBodyState(): void {
  const style = document.body.style;
  if (dragging) {
    style.cursor = rejected ? 'not-allowed' : 'grabbing';
    style.userSelect = 'none';
  } else {
    style.removeProperty('cursor');
    style.removeProperty('user-select');
  }
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !dragging) return;
  event.preventDefault();
  fileDrag.cancel();
}

/** Собираем превью прямо из сетки: карточки лежат в DOM и знают свой `data-file-id`. */
function collectPreviews(list: readonly number[]): DragPreview[] {
  return list.slice(0, GHOST_STACK).map((id) => {
    const img = document.querySelector<HTMLImageElement>(`[data-file-id="${id}"] img`);
    return { id, src: img?.currentSrc || img?.src || null };
  });
}

function finish(): void {
  const wasDragging = dragging;
  ids = [];
  dragging = false;
  overKey = null;
  rejected = false;
  previews = [];
  current = null;
  sourceFolderId = undefined;
  stopScroll();
  applyBodyState();
  if (wasDragging) window.removeEventListener('keydown', onKeyDown, true);
  emit();
}

export const fileDrag = {
  /** Что именно тащим. Зовётся сеткой до начала переноса — она же ставит выделение. */
  start(nextIds: readonly number[]): void {
    ids = nextIds;
    emit();
  },

  /** Порог пройден: включаем призрак и подсказки целей. */
  begin(options: {
    ids: readonly number[];
    /** Папка карточки, если тащат ровно одну. */
    sourceFolderId?: number | null;
    x: number;
    y: number;
  }): void {
    ids = options.ids;
    sourceFolderId = options.sourceFolderId;
    previews = collectPreviews(options.ids);
    dragging = true;
    position = { x: options.x, y: options.y };
    current = null;
    overKey = null;
    rejected = false;
    applyBodyState();
    window.addEventListener('keydown', onKeyDown, true);
    emit();
    for (const listener of positionListeners) listener(position.x, position.y);
  },

  move(x: number, y: number): void {
    if (!dragging) return;
    position = { x, y };
    for (const listener of positionListeners) listener(x, y);

    const found = findTarget(x, y);
    const key = found ? dropTargetKey(found) : null;
    const denied = found ? isRejected(found) : false;
    current = found;
    if (key !== overKey || denied !== rejected) {
      overKey = key;
      rejected = denied;
      applyBodyState();
      emit();
    }
    updateScroll(x, y);
  },

  /** Отпустили: если под курсором живая цель — отдаём её обработчику. */
  drop(): void {
    if (!dragging) return;
    const target = current;
    const denied = rejected;
    const dropped = ids;
    finish();
    if (target && !denied && dropped.length > 0) dropHandler?.(target, dropped);
  },

  cancel(): void {
    finish();
  },

  get(): readonly number[] {
    return ids;
  },

  isActive(): boolean {
    return dragging;
  },

  position(): { x: number; y: number } {
    return position;
  },

  subscribePosition(listener: (x: number, y: number) => void): () => void {
    positionListeners.add(listener);
    return () => positionListeners.delete(listener);
  },

  /** Файлы из Finder: подсказка «сюда можно» у папок сайдбара. */
  setExternal(active: boolean): void {
    if (external === active) return;
    external = active;
    if (!active && overKey !== null) {
      overKey = null;
      rejected = false;
    }
    emit();
  },

  setExternalOver(key: string | null): void {
    if (dragging || overKey === key) return;
    overKey = key;
    rejected = false;
    emit();
  },

  /** Снять подсветку только со своей строки: соседняя могла уже перехватить курсор. */
  clearExternalOver(key: string): void {
    if (dragging || overKey !== key) return;
    overKey = null;
    emit();
  },
};

/** Тащат ли файлы из Finder (а не карточки внутри приложения). */
export function hasExternalFiles(event: DragEvent | React.DragEvent): boolean {
  const types = event.dataTransfer?.types;
  if (!types) return false;
  return Array.from(types).includes('Files');
}

/**
 * Следим за файлами из Finder над окном: подсказки целей в сайдбаре и запрет
 * браузеру открыть файл, отпущенный мимо зоны. Уход считаем по паузе в `dragover`,
 * а не по `dragleave`: счётчик вложенности врал на границах строк.
 */
export function trackExternalFiles(): () => void {
  let idle = 0;

  const stop = () => {
    window.clearTimeout(idle);
    fileDrag.setExternal(false);
  };

  const onOver = (event: DragEvent) => {
    if (!hasExternalFiles(event)) return;
    event.preventDefault();
    fileDrag.setExternal(true);
    window.clearTimeout(idle);
    idle = window.setTimeout(stop, 220);
  };

  const onDrop = (event: DragEvent) => {
    if (hasExternalFiles(event)) event.preventDefault();
    stop();
  };

  window.addEventListener('dragover', onOver);
  window.addEventListener('drop', onDrop);
  window.addEventListener('dragend', stop);
  return () => {
    window.clearTimeout(idle);
    window.removeEventListener('dragover', onOver);
    window.removeEventListener('drop', onDrop);
    window.removeEventListener('dragend', stop);
  };
}
