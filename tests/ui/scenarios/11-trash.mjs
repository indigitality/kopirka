/** Сценарий 11: удаление в корзину и восстановление обратно (GridScreen.tsx, TrashSelectionBar.tsx). */
import assert from 'node:assert/strict';
import { clickText, clickScope, clickAriaLabel, waitFor, cardIds, selectCard } from '../lib/helpers.mjs';

const TARGET_FILE = 'quartz-scene-06';

export default async function trash(ctx) {
  const { page, seed } = ctx;
  await ctx.resetToLibraryRoot();

  const fileId = seed.filesByName.get(TARGET_FILE).id;
  await selectCard(page, fileId);
  await page.waitForSelector('[role="toolbar"][aria-label="Действия над выделенными файлами"]', { timeout: 4000 });
  await clickAriaLabel(page, 'Удалить');

  await waitFor(
    async () => {
      const ids = await cardIds(page);
      return !ids.includes(fileId);
    },
    { timeout: 4000, message: 'файл не пропал из библиотеки после удаления в корзину' },
  );

  await clickScope(page, 'Корзина');
  await waitFor(
    async () => {
      const ids = await cardIds(page);
      return ids.includes(fileId);
    },
    { timeout: 4000, message: 'файл не появился в «Корзине»' },
  );
  await ctx.shot('11-trash-with-file');

  await selectCard(page, fileId);
  await page.waitForSelector('[role="toolbar"][aria-label="Действия над выделенными файлами корзины"]', { timeout: 4000 });
  await clickText(page, 'Восстановить');

  await waitFor(
    async () => {
      const ids = await cardIds(page);
      return !ids.includes(fileId);
    },
    { timeout: 4000, message: 'файл не пропал из «Корзины» после восстановления' },
  );

  await clickScope(page, 'Вся библиотека');
  const restored = await waitFor(
    async () => {
      const ids = await cardIds(page);
      return ids.includes(fileId) ? ids : null;
    },
    { timeout: 4000, message: 'файл не вернулся в библиотеку после восстановления' },
  );
  assert.equal(restored.length, seed.totalFiles, `после восстановления в библиотеке ${restored.length} файлов, ожидалось ${seed.totalFiles}`);

  await ctx.shot('11-trash-restored');
}
