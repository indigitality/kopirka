/**
 * NEW-03 — перенос папок перетаскиванием внутри сайдбара (макеты D09–D12 от 11.09.2026).
 *
 * Отдельный store от `features/grid/dnd.ts` нарочно: там тащат карточки на папку,
 * здесь — саму папку по дереву, и целей у неё три вида вместо одного. Механика же
 * взята оттуда один в один (и по той же причине — HTML5 drag&drop в окне Tauri до
 * страницы не доходит): pointer-события, порог `DRAG_THRESHOLD`, Esc отменяет,
 * автопрокрутка контейнера `[data-drop-scroll]` у края.
 *
 * Куда именно ляжет папка, считает сайдбар — он один знает плоский список строк и
 * их прямоугольники. Store только держит снимок и позицию призрака.
 */
import { useSyncExternalStore } from 'react';
import { DROP_SCROLL_ATTR } from '@/features/grid/dnd';

/** Место переноса в терминах сервера: `PATCH /api/folders/:id/move`. */
export interface FolderDropPlan {
  parentId: number | null;
  /** Место среди детей нового родителя, считая без самой переносимой папки. */
  index: number;
}

/**
 * Цель под курсором.
 *
 * - `into` — середина строки другой папки: вложить (подсветка R07, тултип «В папку „X“»).
 * - `between` — верхняя или нижняя четверть строки: вставка между строками.
 *   `y` — верх индикатора в координатах содержимого списка, `depth` — уровень,
 *   на который встанет папка (по нему же стоит точка индикатора).
 * - `root` — пунктирная зона «В корень» под списком и заголовок «ПАПКИ».
 * - `denied` — папка над собой или над своим потомком: бросок ничего не даст.
 */
export type FolderDropTarget =
  | { kind: 'into'; folderId: number; plan: FolderDropPlan; tooltip: string }
  | { kind: 'between'; plan: FolderDropPlan; tooltip: string; depth: number; y: number }
  | { kind: 'root'; plan: FolderDropPlan; tooltip: string }
  | { kind: 'denied'; folderId: number | null; tooltip: string };

export interface FolderDragSnapshot {
  /** Порог пройден: рисуем призрак, подсветку целей и зону «В корень». */
  dragging: boolean;
  /** Что тащим. Строка-источник приглушается до 0.4 (D09). */
  folderId: number | null;
  name: string;
  target: FolderDropTarget | null;
}

const EMPTY: FolderDragSnapshot = { dragging: false, folderId: null, name: '', target: null };

let snapshot: FolderDragSnapshot = EMPTY;
const listeners = new Set<() => void>();

function emit(next: FolderDragSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = (): FolderDragSnapshot => snapshot;

export function useFolderDragSnapshot(): FolderDragSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// ── Позиция призрака ───────────────────────────────────────────────────────
// Пишется мимо React: за курсором надо успевать каждый кадр (так же, как DragGhost).

let position = { x: 0, y: 0 };
const positionListeners = new Set<(x: number, y: number) => void>();

// ── Автопрокрутка списка папок ─────────────────────────────────────────────
// Те же полоса и шаг, что у переноса карточек: список один и тот же.

const SCROLL_EDGE = 44;
const SCROLL_STEP = 14;

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
    const inside =
      x >= box.left && x <= box.right && y >= box.top - SCROLL_EDGE && y <= box.bottom + SCROLL_EDGE;
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

function applyBodyState(): void {
  const style = document.body.style;
  if (snapshot.dragging) {
    style.cursor = snapshot.target?.kind === 'denied' ? 'not-allowed' : 'grabbing';
    style.userSelect = 'none';
  } else {
    style.removeProperty('cursor');
    style.removeProperty('user-select');
  }
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !snapshot.dragging) return;
  event.preventDefault();
  event.stopPropagation();
  folderDrag.cancel();
}

function finish(): void {
  const was = snapshot.dragging;
  emit(EMPTY);
  stopScroll();
  applyBodyState();
  if (was) window.removeEventListener('keydown', onKeyDown, true);
}

export const folderDrag = {
  begin(options: { folderId: number; name: string; x: number; y: number }): void {
    emit({ dragging: true, folderId: options.folderId, name: options.name, target: null });
    position = { x: options.x, y: options.y };
    applyBodyState();
    window.addEventListener('keydown', onKeyDown, true);
    for (const listener of positionListeners) listener(position.x, position.y);
  },

  /** Позиция призрака и автопрокрутка. Цель считает сайдбар и кладёт её `setTarget`. */
  move(x: number, y: number): void {
    if (!snapshot.dragging) return;
    position = { x, y };
    for (const listener of positionListeners) listener(x, y);
    updateScroll(x, y);
  },

  setTarget(target: FolderDropTarget | null): void {
    if (!snapshot.dragging) return;
    if (sameTarget(snapshot.target, target)) return;
    emit({ ...snapshot, target });
    applyBodyState();
  },

  /** Отпустили: отдаём место переноса, если оно живое. */
  drop(): FolderDropPlan | null {
    if (!snapshot.dragging) return null;
    const target = snapshot.target;
    finish();
    if (!target || target.kind === 'denied') return null;
    return target.plan;
  },

  cancel(): void {
    finish();
  },

  isActive(): boolean {
    return snapshot.dragging;
  },

  position(): { x: number; y: number } {
    return position;
  },

  subscribePosition(listener: (x: number, y: number) => void): () => void {
    positionListeners.add(listener);
    return () => positionListeners.delete(listener);
  },
};

/** Сравнение целей по значению: иначе каждый `pointermove` перерисовывал бы дерево. */
function sameTarget(a: FolderDropTarget | null, b: FolderDropTarget | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind === 'into' && b.kind === 'into') return a.folderId === b.folderId;
  if (a.kind === 'denied' && b.kind === 'denied') return a.folderId === b.folderId;
  if (a.kind === 'root' && b.kind === 'root') return true;
  if (a.kind === 'between' && b.kind === 'between') {
    return (
      a.plan.parentId === b.plan.parentId &&
      a.plan.index === b.plan.index &&
      a.depth === b.depth &&
      a.y === b.y
    );
  }
  return false;
}
