/**
 * Горячие клавиши сетки и детального просмотра — таблица 6.4 PRD.
 * Главное правило: в поле ввода (поиск, переименование, добавление тега)
 * хоткеи не срабатывают.
 */
import { useEffect, useRef } from 'react';
import type { GridSize } from '@/store/view';

/** Фокус в поле ввода — сочетание принадлежит полю, а не сетке. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * Открыта модалка или поповер — Esc принадлежит им.
 * Смотрим только на `data-state="open"`: закрытый слой живёт в DOM ещё ~140 мс,
 * пока проигрывается выход, и его присутствие ничего не значит.
 */
export function overlayOpen(): boolean {
  return (
    document.querySelector('[role="dialog"][data-state="open"]') !== null ||
    document.querySelector('[data-radix-popper-content-wrapper] [data-state="open"]') !== null
  );
}

export interface GridHotkeyHandlers {
  selectAll: () => void;
  clearSelection: () => void;
  copySelection: () => void;
  deleteSelection: () => void;
  paste: (data: DataTransfer | null) => void;
  /** Детальный просмотр: открыт ли, чем листать, чем закрыть. */
  detailOpen: boolean;
  closeDetail: () => void;
  stepDetail: (delta: 1 | -1) => void;
  hasSelection: boolean;
  /** D5 — ⌘1 / ⌘2 / ⌘3 переключают размер карточек. */
  setGridSize: (size: GridSize) => void;
}

/** Раскладка не мешает: ловим `code`, а не `key`. */
const SIZE_BY_CODE: Record<string, GridSize> = {
  Digit1: 'l',
  Digit2: 'm',
  Digit3: 's',
};

export function useGridHotkeys(handlers: GridHotkeyHandlers): void {
  // Обработчики меняются на каждый рендер — держим их в ref, чтобы не переподписываться.
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const meta = event.metaKey || event.ctrlKey;

      if (event.key === 'Escape') {
        if (overlayOpen()) return;
        if (ref.current.detailOpen) {
          event.preventDefault();
          ref.current.closeDetail();
          return;
        }
        if (ref.current.hasSelection) {
          event.preventDefault();
          ref.current.clearSelection();
        }
        return;
      }

      if (ref.current.detailOpen && !meta && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault();
        ref.current.stepDetail(event.key === 'ArrowRight' ? 1 : -1);
        return;
      }

      const size = meta ? SIZE_BY_CODE[event.code] : undefined;
      if (size !== undefined) {
        event.preventDefault();
        ref.current.setGridSize(size);
        return;
      }

      if (meta && (event.key === 'a' || event.key === 'A' || event.code === 'KeyA')) {
        if (ref.current.detailOpen) return;
        event.preventDefault();
        ref.current.selectAll();
        return;
      }

      if (meta && (event.key === 'c' || event.key === 'C' || event.code === 'KeyC')) {
        // Пользователь мог выделять текст мышью — тогда копируем текст, а не файл.
        if (!window.getSelection()?.isCollapsed) return;
        event.preventDefault();
        ref.current.copySelection();
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (meta) return;
        // Открыт слой — Backspace принадлежит ему: иначе нажатие в модалке
        // (например, в настройках) отправило бы выделенное в корзину.
        if (overlayOpen()) return;
        event.preventDefault();
        ref.current.deleteSelection();
      }
    };

    const onPaste = (event: ClipboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (overlayOpen()) return;
      const files = event.clipboardData?.files;
      if (!files || files.length === 0) return;
      event.preventDefault();
      ref.current.paste(event.clipboardData);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('paste', onPaste);
    };
  }, []);
}
