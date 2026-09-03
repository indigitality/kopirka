/** Сценарий 3: поиск по имени файла сужает сетку; очистка возвращает всё обратно. */
import assert from 'node:assert/strict';
import { setFieldValue, waitForCardCount } from '../lib/helpers.mjs';

const SEARCH_INPUT = 'input[aria-label="Поиск по названию"]';

export default async function search(ctx) {
  const { page, seed } = ctx;
  await ctx.resetToLibraryRoot();

  await setFieldValue(page, SEARCH_INPUT, 'harbor');
  const narrowed = await waitForCardCount(page, 1, {
    timeout: 6000,
    message: 'поиск «harbor» не сузил сетку до одной карточки',
  });
  assert.equal(narrowed[0], seed.filesByName.get('harbor-scene-09').id, 'поиск нашёл не тот файл');
  await ctx.shot('03-search-narrowed');

  await setFieldValue(page, SEARCH_INPUT, '');
  await waitForCardCount(page, seed.totalFiles, {
    timeout: 6000,
    message: 'очистка поиска не вернула все файлы',
  });
  await ctx.shot('03-search-cleared');
}
