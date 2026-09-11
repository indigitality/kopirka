/**
 * Сценарий 12 (FDB-08): протяжка мышью по пустому месту сетки выделяет карточки
 * рамкой, панель выделения показывает «Выбрано N из M», Esc снимает выделение.
 */
import assert from 'node:assert/strict';
import { waitFor } from '../lib/helpers.mjs';
import { SELECTION_BAR, dragMouse, findEmptyGridPoint, selectedCardIds, selectionBarText } from '../lib/grid.mjs';

export default async function marqueeSelection(ctx) {
  const { page } = ctx;
  await ctx.resetToLibraryRoot();

  // Сетку — в начало: пустая точка ищется только в пределах видимой области.
  await page.evaluate(() => {
    const main = document.querySelector('main');
    if (main) main.scrollTop = 0;
  });

  const start = await findEmptyGridPoint(page);
  assert.ok(start, 'не нашлось пустой точки между карточками — рамку начинать не с чего');

  const viewport = page.viewport();
  // Тянем по диагонали через всю видимую сетку: сколько карточек попадёт под
  // рамку, зависит от раскладки, но при 12 файлах их заведомо больше одной.
  const to = {
    x: Math.min(start.container.right - 4, viewport.width - 6),
    y: Math.min(start.container.bottom - 4, viewport.height - 6),
  };
  await dragMouse(page, start, to);

  const selected = await waitFor(
    async () => {
      const ids = await selectedCardIds(page);
      return ids.length >= 2 ? ids : null;
    },
    { timeout: 3000, message: 'рамка не выделила хотя бы две карточки' },
  );

  await page.waitForSelector(SELECTION_BAR, { timeout: 3000 });
  const text = await selectionBarText(page);
  assert.ok(
    text && text.includes(`Выбрано ${selected.length} из `),
    `панель выделения показывает «${text}», ожидалось «Выбрано ${selected.length} из N»`,
  );

  await ctx.shot('12-marquee-selection');

  await page.keyboard.press('Escape');
  await waitFor(async () => (await selectedCardIds(page)).length === 0, {
    timeout: 2000,
    message: 'Esc не снял выделение, поставленное рамкой',
  });
}
