/**
 * Имена сообщений между popup, content script и service worker.
 *
 * Внимание: content/area-select.js инжектится как обычный (не модульный) скрипт
 * и импортировать этот файл не может — строки AREA_SELECTED и AREA_CANCELLED
 * там продублированы литералами. При переименовании править оба места.
 */

export const MSG = {
  /** popup → SW: снять видимую область (CAP-02). */
  CAPTURE_VISIBLE: 'capture-visible',
  /** popup → SW: включить оверлей выделения на активной вкладке (CAP-08). */
  START_AREA_SELECT: 'start-area-select',
  /** content script → SW: область выбрана, координаты в CSS-пикселях. */
  AREA_SELECTED: 'area-selected',
  /** content script → SW: выделение отменено (Esc). */
  AREA_CANCELLED: 'area-cancelled',
};
