/** Сценарий 7: «Добавить тег» из панели выделения — тег виден у файла через API. */
import assert from 'node:assert/strict';
import { clickText, findByText, waitFor, selectCard } from '../lib/helpers.mjs';

const TAGGED_FILE = 'lumen-scene-10';
const TAG_INPUT = 'input[placeholder="Название тега"]';
const NEW_TAG = 'смоук-тест';

export default async function addTag(ctx) {
  const { page, api, seed } = ctx;
  await ctx.resetToLibraryRoot();

  const fileId = seed.filesByName.get(TAGGED_FILE).id;
  await selectCard(page, fileId);
  await page.waitForSelector('[role="toolbar"][aria-label="Действия над выделенными файлами"]', { timeout: 4000 });
  await clickText(page, 'Тег');

  await page.waitForSelector(TAG_INPUT, { timeout: 3000 });
  await page.type(TAG_INPUT, NEW_TAG, { delay: 12 });
  await ctx.shot('07-add-tag-dialog');
  await clickText(page, 'Добавить');

  await waitFor(
    async () => {
      const file = await api('GET', `/api/files/${fileId}`);
      return file.tags.includes(NEW_TAG) ? file : null;
    },
    { timeout: 4000, message: `тег «${NEW_TAG}» не появился у файла через API` },
  );

  // После подтверждения сервером клиент ещё перечитывает library.tags (refreshMeta) и
  // дорисовывает новый тег пилюлей-подсказкой под полем — это отдельный, более
  // медленный круг запросов, чем наш прямой GET выше. Если кликнуть «Готово» раньше,
  // чем пилюля успеет появиться, подвал диалога может сдвинуться под курсор клика
  // (поймано на практике: клик проходил мимо кнопки). Ждём именно клиентский сигнал,
  // а не только серверный.
  const suggestion = await waitFor(() => findByText(page, NEW_TAG, { selector: 'button' }), {
    timeout: 3000,
    message: `подсказка с тегом «${NEW_TAG}» не появилась в диалоге`,
  });
  await suggestion.dispose();

  await clickText(page, 'Готово');
  await waitFor(async () => (await page.$('[role="dialog"]')) === null, {
    timeout: 3000,
    message: 'диалог «Добавить тег» не закрылся по «Готово»',
  });
}
