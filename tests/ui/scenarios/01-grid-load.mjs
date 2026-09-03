/** Сценарий 1: сетка загрузилась — число карточек совпадает с числом импортированных файлов, сайдбар показывает папки. */
import assert from 'node:assert/strict';
import { waitForCardCount, countMatching } from '../lib/helpers.mjs';

export default async function gridLoad(ctx) {
  const { page, seed } = ctx;

  await page.waitForSelector('aside[aria-label="Разделы и папки"]', { timeout: 10000 });

  const ids = await waitForCardCount(page, seed.totalFiles, {
    timeout: 10000,
    message: `сетка не показала ${seed.totalFiles} карточек после загрузки`,
  });
  assert.equal(ids.length, seed.totalFiles);

  const folderRows = await countMatching(page, '[data-drop-target^="folder:"]');
  assert.equal(
    folderRows,
    seed.totalFolders,
    `сайдбар показывает ${folderRows} строк папок, ожидалось ${seed.totalFolders}`,
  );

  await ctx.shot('01-grid-loaded');
}
