/**
 * Сценарий 9: детальный просмотр. Обычный `dblclick` puppeteer карточку не
 * открывает (сложная pointer-down логика переноса в GridCard.tsx перехватывает
 * события мыши до того, как браузер соберёт их в двойной клик) — открываем как
 * реальный пользователь с клавиатуры: кликом фокусируем карточку, затем Enter.
 *
 * Заодно повторно проверяем позиционирование выпадающего списка (Select.tsx) —
 * тот же компонент, что и в диалоге «Переместить в папку» (сценарий 5), но в
 * другом месте дерева (не в модалке, а в панели деталей): регрессия могла бы
 * задеть один контекст и не задеть другой.
 */
import assert from 'node:assert/strict';
import { waitFor, elementRect, stableRect, countMatching, assertContainingBlockClean } from '../lib/helpers.mjs';

const TARGET_FILE = 'basalt-scene-08';
const DETAIL_DIALOG = '[role="dialog"][aria-modal="true"]';
const FOLDER_SELECT_TRIGGER = 'aside[aria-label="Свойства файла"] button[aria-haspopup="listbox"]';

export default async function detailView(ctx) {
  const { page, seed } = ctx;
  await ctx.resetToLibraryRoot();

  const fileId = seed.filesByName.get(TARGET_FILE).id;
  const cardSelector = `[data-file-id="${fileId}"]`;
  await page.waitForSelector(cardSelector, { timeout: 4000 });
  await page.click(cardSelector); // выделяет карточку и переносит на неё фокус (div tabIndex=0)
  await page.keyboard.press('Enter');

  await page.waitForSelector(DETAIL_DIALOG, { timeout: 4000 });
  const dialogLabel = await page.$eval(DETAIL_DIALOG, (el) => el.getAttribute('aria-label'));
  assert.ok(dialogLabel?.startsWith('Просмотр'), `у оверлея просмотра неожиданный aria-label: ${dialogLabel}`);
  await page.waitForSelector('aside[aria-label="Свойства файла"]', { timeout: 3000 });
  await ctx.shot('09-detail-view-open');

  const trigger = await page.waitForSelector(FOLDER_SELECT_TRIGGER, { timeout: 3000 });
  const triggerRect = await elementRect(trigger);
  await trigger.click();

  await page.waitForSelector('[role="listbox"]', { timeout: 3000 });
  const listboxRect = await stableRect(page, '[role="listbox"]', { timeout: 2000 });
  await ctx.shot('09-detail-view-folder-select-open');

  assert.ok(
    Math.abs(listboxRect.left - triggerRect.left) <= 2,
    `left списка папок в панели деталей ${listboxRect.left}, ожидался ${triggerRect.left} ±2`,
  );
  assert.ok(
    Math.abs(listboxRect.top - (triggerRect.bottom + 6)) <= 2,
    `top списка папок в панели деталей ${listboxRect.top}, ожидалось ${triggerRect.bottom + 6} ±2`,
  );

  // Структурная проверка того же класса бага, что и в сценарии 5 (см. его комментарий).
  await assertContainingBlockClean(page, '[role="listbox"]', 'список папок в панели деталей');

  // Esc закрывает список, панель просмотра остаётся.
  await page.keyboard.press('Escape');
  await waitFor(async () => (await countMatching(page, '[role="listbox"]')) === 0, {
    timeout: 2000,
    message: 'Esc не закрыл список папок в панели деталей',
  });
  const detailStillOpen = await countMatching(page, DETAIL_DIALOG);
  assert.equal(detailStillOpen, 1, 'первый Esc в панели деталей закрыл не только список, но и весь просмотр');

  // Второй Esc закрывает сам просмотр.
  await page.keyboard.press('Escape');
  await waitFor(async () => (await countMatching(page, DETAIL_DIALOG)) === 0, {
    timeout: 2000,
    message: 'второй Esc не закрыл детальный просмотр',
  });
}
