/**
 * ORG-03 — перетаскивание карточек на папку сайдбара.
 * `dataTransfer` во время `dragover` читать нельзя, поэтому что именно тащим
 * держим в модуле; в `dataTransfer` кладём тот же список для порядка.
 */

export const DRAG_MIME = 'application/x-kopirka-files';

let dragged: readonly number[] = [];
const listeners = new Set<(ids: readonly number[]) => void>();

function emit(): void {
  for (const listener of listeners) listener(dragged);
}

export const fileDrag = {
  start(ids: readonly number[]): void {
    dragged = ids;
    emit();
  },
  end(): void {
    if (dragged.length === 0) return;
    dragged = [];
    emit();
  },
  get(): readonly number[] {
    return dragged;
  },
  isActive(): boolean {
    return dragged.length > 0;
  },
  subscribe(listener: (ids: readonly number[]) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/** Тащат ли файлы из Finder (а не карточки внутри приложения). */
export function hasExternalFiles(event: DragEvent | React.DragEvent): boolean {
  const types = event.dataTransfer?.types;
  if (!types) return false;
  return Array.from(types).includes('Files');
}
