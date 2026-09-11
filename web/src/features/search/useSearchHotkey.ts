/**
 * NEW-02 — глобальные хоткеи открытия поиск-модалки: ⌘K / Ctrl+K и `/`.
 *
 * Раньше ⌘K фокусировал поле верхней панели (`SearchField`); поля больше нет,
 * и сочетание ведёт в модалку. `/` добавлен той же правкой — привычный «быстрый
 * поиск» из браузеров и почтовых клиентов.
 *
 * Два правила, общие с `useGridHotkeys`: в поле ввода хоткеи не срабатывают
 * (там `/` — обычный символ), и поверх открытого слоя (модалка, поповер) тоже —
 * ⌘K в настройках не должен открывать вторую модалку поверх первой.
 */
import { useEffect } from 'react';
import { isEditableTarget, overlayOpen } from '@/features/grid/useGridHotkeys';
import { getViewState } from '@/store/view';

export function useSearchHotkey(onOpen: () => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      // `code`, а не `key`: русская раскладка даёт «л» вместо «k».
      const isK = event.code === 'KeyK' || event.key.toLowerCase() === 'k';
      const isSlash = !meta && !event.altKey && event.key === '/';
      if (!((meta && isK) || isSlash)) return;
      if (isEditableTarget(event.target)) return;
      if (overlayOpen()) return;
      // Детальный просмотр — свой слой, но без `data-state` Radix: `overlayOpen` его
      // не видит, а открывать поиск поверх картинки незачем.
      if (getViewState().openFileId !== null) return;
      event.preventDefault();
      onOpen();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onOpen]);
}
