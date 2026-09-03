/**
 * Сценарий 4: поповер сортировки в шапке открывается под своей кнопкой,
 * смена сортировки меняет порядок карточек.
 *
 * У кнопки сортировки `align="end"` (features/filters/SortButton.tsx), а не
 * `align="start"`, как у выпадающего списка папки (Select.tsx) — Radix в этом
 * случае прижимает ПРАВЫЙ край поповера к правому краю кнопки, а не левый к
 * левому. Поэтому здесь сверяем правые края, а не левые: это тот же по
 * точности ±2px геометрический факт «поповер стоит под своей кнопкой»,
 * просто зеркальный из-за align="end".
 */
import assert from 'node:assert/strict';
import {
  findByText,
  waitFor,
  rect,
  stableParentRect,
  cardIds,
  countMatching,
  assertContainingBlockClean,
} from '../lib/helpers.mjs';

const TRIGGER = '[aria-label^="Сортировка:"]';

export default async function sortPopover(ctx) {
  const { page, api } = ctx;
  await ctx.resetToLibraryRoot();

  const before = await cardIds(page);

  await page.click(TRIGGER);
  const nameAscItem = await waitFor(() => findByText(page, 'По имени: А → Я', { selector: '[role="menuitemradio"]' }), {
    timeout: 4000,
    message: 'поповер сортировки не открылся',
  });

  const triggerRect = await rect(page, TRIGGER);
  const popoverRect = await stableParentRect(nameAscItem, { timeout: 2000 });

  assert.ok(
    Math.abs(popoverRect.top - (triggerRect.bottom + 6)) <= 2,
    `top поповера ${popoverRect.top}, ожидалось ${triggerRect.bottom + 6} ±2 (низ кнопки + отступ 6)`,
  );
  assert.ok(
    Math.abs(popoverRect.right - triggerRect.right) <= 2,
    `right поповера ${popoverRect.right}, ожидался ${triggerRect.right} ±2 (align="end" — правые края совпадают)`,
  );

  // Структурная проверка того же класса бага (см. сценарий 5): в Blink геометрия
  // могла бы случайно сойтись даже при неверном месте портала — WebKit её не прощает.
  await assertContainingBlockClean(page, '[role="menuitemradio"]', 'поповер сортировки');

  await ctx.shot('04-sort-popover-open');

  await nameAscItem.click();
  await nameAscItem.dispose();

  await waitFor(async () => (await countMatching(page, '[role="menuitemradio"]')) === 0, {
    timeout: 3000,
    message: 'поповер сортировки не закрылся после выбора пункта',
  });

  const after = await waitFor(
    async () => {
      const ids = await cardIds(page);
      return JSON.stringify(ids) !== JSON.stringify(before) ? ids : null;
    },
    { timeout: 4000, message: 'порядок карточек не изменился после смены сортировки' },
  );

  const serverOrder = (await api('GET', '/api/files?sort=name_asc&limit=100')).files.map((f) => f.id);
  assert.deepEqual(after, serverOrder, 'порядок карточек в сетке разошёлся с ответом API для sort=name_asc');

  await ctx.shot('04-sort-name-asc');
}
