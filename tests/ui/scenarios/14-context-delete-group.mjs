/**
 * Сценарий 14 (FDB-12): «Удалить» из контекстного меню карточки, входящей
 * в выделение, отправляет в корзину всю группу — проверка через API.
 * До правки пункт молча действовал на одну карточку.
 */
import assert from 'node:assert/strict';
import { findByText, waitFor, selectCard } from '../lib/helpers.mjs';
import { SELECTION_BAR, selectedCardIds } from '../lib/grid.mjs';

const GROUP = ['granite-scene-11', 'basalt-scene-08', 'quartz-scene-06'];
const ITEM_SELECTOR = '[role="menuitem"], button, a';

export default async function contextDeleteGroup(ctx) {
  const { page, api, seed } = ctx;
  await ctx.resetToLibraryRoot();

  const ids = GROUP.map((name) => seed.filesByName.get(name).id);

  await selectCard(page, ids[0]);
  for (const id of ids.slice(1)) {
    const handle = await page.$(`[data-file-id="${id}"]`);
    assert.ok(handle, `карточка ${id} не найдена в сетке`);
    // ⌘+клик добавляет карточку к выделению (на Windows это был бы Ctrl).
    await page.keyboard.down('Meta');
    await handle.click();
    await page.keyboard.up('Meta');
    await handle.dispose();
  }
  await page.waitForSelector(SELECTION_BAR, { timeout: 3000 });
  await waitFor(async () => (await selectedCardIds(page)).length === ids.length, {
    timeout: 3000,
    message: `в выделении не оказалось ${ids.length} карточек`,
  });

  // Правый клик по одной из выделенных карточек (та же гонка с нативным
  // contextmenu, что в сценарии 8 — поэтому вторая попытка).
  const cardSelector = `[data-file-id="${ids[1]}"]`;
  await page.$eval(cardSelector, (el) => el.scrollIntoView({ block: 'center', inline: 'center' }));
  const box = await page.$eval(cardSelector, (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });

  let deleteItem = null;
  for (let attempt = 1; attempt <= 2 && !deleteItem; attempt += 1) {
    await page.mouse.click(box.x, box.y, { button: 'right' });
    // Текст пункта склеен с подписью хоткея («Удалить⌫») — ищем по вхождению.
    deleteItem = await waitFor(() => findByText(page, 'Удалить', { selector: ITEM_SELECTOR, exact: false }), {
      timeout: 1500,
      message: 'контекстное меню карточки не открылось',
    }).catch(() => null);
  }
  assert.ok(deleteItem, 'в контекстном меню не нашёлся пункт «Удалить»');
  await ctx.shot('14-context-delete-group');
  await deleteItem.click();
  await deleteItem.dispose();

  // Главная проверка — состояние на сервере, а не то, что нарисовала сетка.
  await waitFor(
    async () => {
      const files = await Promise.all(ids.map((id) => api('GET', `/api/files/${id}`)));
      return files.every((file) => file.deletedAt !== null) ? files : null;
    },
    { timeout: 5000, message: 'в корзину уехала не вся группа' },
  );

  // Возвращаем всё обратно: следующим сценариям нужна целая библиотека.
  await api('POST', '/api/files/restore', { fileIds: ids });
  await waitFor(
    async () => {
      const files = await Promise.all(ids.map((id) => api('GET', `/api/files/${id}`)));
      return files.every((file) => file.deletedAt === null);
    },
    { timeout: 4000, message: 'группа не вернулась из корзины' },
  );
}
