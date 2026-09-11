/**
 * Помощники, специфичные для сетки: контейнер раскладки, пустая точка между
 * карточками и текст панели выделения. Живут отдельно от `helpers.mjs` —
 * там общий инструментарий, здесь знание про конкретный экран.
 */

export const SELECTION_BAR = '[role="toolbar"][aria-label="Действия над выделенными файлами"]';

/** id выделенных карточек: `GridCard` ставит `aria-pressed` по выделению. */
export async function selectedCardIds(page) {
  return page.$$eval('[data-file-id][aria-pressed="true"]', (els) =>
    els.map((el) => Number(el.getAttribute('data-file-id'))),
  );
}

/** Текст панели выделения целиком («Выбрано 3 из 12 …»). `null` — панели нет. */
export async function selectionBarText(page) {
  return page.$eval(SELECTION_BAR, (el) => el.textContent ?? '').catch(() => null);
}

/**
 * Точка внутри контейнера сетки, где нет ни одной карточки — с неё начинается
 * протяжка рамки (`useMarquee` требует `event.target === контейнер`).
 *
 * Ищем перебором по `elementFromPoint`, а не считаем просветы по раскладке:
 * masonry даёт колонки разной высоты, и надёжнее всего спросить сам браузер,
 * что лежит в точке. Возвращает координаты окна либо `null`.
 */
export async function findEmptyGridPoint(page, { margin = 8, step = 8 } = {}) {
  return page.evaluate(
    (marginPx, stepPx) => {
      const card = document.querySelector('[data-file-id]');
      const container = card?.parentElement;
      if (!container) return null;
      const box = container.getBoundingClientRect();
      const left = Math.max(box.left + marginPx, marginPx);
      const right = Math.min(box.right - marginPx, window.innerWidth - marginPx);
      const top = Math.max(box.top + marginPx, marginPx);
      const bottom = Math.min(box.bottom - marginPx, window.innerHeight - marginPx);
      for (let y = top; y <= bottom; y += stepPx) {
        for (let x = left; x <= right; x += stepPx) {
          if (document.elementFromPoint(x, y) === container) return { x, y, container: { ...box.toJSON() } };
        }
      }
      return null;
    },
    margin,
    step,
  );
}

/**
 * Протяжка мышью с промежуточными шагами. Один прыжок `mouse.move` даёт всего
 * одно событие `pointermove` — порог начала рамки (5 px) при этом проскакивается,
 * но живое выделение «по дороге» не проверить, да и автопрокрутка не заведётся.
 */
export async function dragMouse(page, from, to, { steps = 12 } = {}) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i += 1) {
    const ratio = i / steps;
    await page.mouse.move(from.x + (to.x - from.x) * ratio, from.y + (to.y - from.y) * ratio);
  }
  await page.mouse.up();
}
