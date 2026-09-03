/** Сценарий 2: клик по папке в сайдбаре фильтрует сетку; «Вся библиотека» возвращает всё. */
import assert from 'node:assert/strict';
import { clickText, clickScope, waitForCardCount } from '../lib/helpers.mjs';

const FILED_IN_INTERFACES = ['zebra-scene-01', 'mango-scene-02', 'nova-scene-03'];

export default async function folderFilter(ctx) {
  const { page, seed } = ctx;
  await ctx.resetToLibraryRoot();

  await clickText(page, 'Интерфейсы');
  const filteredIds = await waitForCardCount(page, FILED_IN_INTERFACES.length, {
    timeout: 6000,
    message: 'папка «Интерфейсы» не отфильтровала сетку',
  });
  const expected = FILED_IN_INTERFACES.map((name) => seed.filesByName.get(name).id).sort((a, b) => a - b);
  assert.deepEqual([...filteredIds].sort((a, b) => a - b), expected, 'в папке «Интерфейсы» показаны не те файлы');
  await ctx.shot('02-folder-filtered');

  await clickScope(page, 'Вся библиотека');
  await waitForCardCount(page, seed.totalFiles, {
    timeout: 6000,
    message: '«Вся библиотека» не вернула все файлы после выхода из папки',
  });
  await ctx.shot('02-folder-reset');
}
