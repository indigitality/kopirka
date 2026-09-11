/**
 * Сценарий 13 (FDB-08в): чекбокс панели выделения выбирает все карточки среза
 * («Выбраны все N») и вторым нажатием снимает выделение.
 */
import assert from 'node:assert/strict';
import { cardIds, findByAriaLabel, waitFor } from '../lib/helpers.mjs';
import { SELECTION_BAR, selectedCardIds, selectionBarText } from '../lib/grid.mjs';
import { selectCard } from '../lib/helpers.mjs';

export default async function selectAll(ctx) {
  const { page, seed } = ctx;
  await ctx.resetToLibraryRoot();

  const total = (await cardIds(page)).length;
  assert.ok(total >= 2, `в сетке ${total} карточек — проверять «выбрать все» не на чем`);

  // Панель появляется только при непустом выделении — начинаем с одной карточки.
  await selectCard(page, seed.filesByName.get('nova-scene-03').id);
  await page.waitForSelector(SELECTION_BAR, { timeout: 3000 });

  const checkbox = await findByAriaLabel(page, 'Выбрать все', { selector: `${SELECTION_BAR} [role="checkbox"]` });
  assert.ok(checkbox, 'в панели выделения нет чекбокса «Выбрать все»');
  await checkbox.click();
  await checkbox.dispose();

  await waitFor(async () => (await selectedCardIds(page)).length === total, {
    timeout: 3000,
    message: `чекбокс не выделил все ${total} карточек`,
  });
  const text = await selectionBarText(page);
  assert.ok(
    text && text.includes(`Выбраны все ${total}`),
    `панель показывает «${text}», ожидалось «Выбраны все ${total}»`,
  );

  await ctx.shot('13-select-all');

  // Теперь чекбокс сплошной — второе нажатие снимает выделение целиком.
  const checked = await findByAriaLabel(page, 'Снять выделение', {
    selector: `${SELECTION_BAR} [role="checkbox"]`,
  });
  assert.ok(checked, 'чекбокс не переключился в состояние «Снять выделение»');
  await checked.click();
  await checked.dispose();

  await waitFor(async () => (await selectedCardIds(page)).length === 0, {
    timeout: 3000,
    message: 'повторное нажатие чекбокса не сняло выделение',
  });
}
