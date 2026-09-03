/** Сценарий 10: настройки открываются панелью на всё окно; закрытие по Esc и по крестику. */
import assert from 'node:assert/strict';
import { clickText, clickAriaLabel, findByText, waitFor, rect, countMatching } from '../lib/helpers.mjs';

const DIALOG = '[role="dialog"]';

export default async function settings(ctx) {
  const { page } = ctx;
  await ctx.resetToLibraryRoot();

  await clickText(page, 'Настройки');
  await page.waitForSelector(DIALOG, { timeout: 4000 });

  // Содержимое действительно от настроек, а не случайно открывшийся другой диалог.
  const libSection = await waitFor(() => findByText(page, 'Библиотека', { selector: 'h3' }), {
    timeout: 3000,
    message: 'раздел «Библиотека» не найден в панели настроек',
  });
  await libSection.dispose();
  const aboutSection = await findByText(page, 'О программе', { selector: 'h3' });
  assert.ok(aboutSection, 'раздел «О программе» не найден в панели настроек');
  await aboutSection.dispose();

  // R10: это не диалог 440–720px, а панель на всё окно (в отличие от «Переместить в папку» и т.п.).
  const dialogRect = await rect(page, DIALOG);
  const viewport = page.viewport();
  assert.ok(
    dialogRect.width >= viewport.width * 0.85 && dialogRect.height >= viewport.height * 0.85,
    `панель настроек ${dialogRect.width}×${dialogRect.height} — не похожа на «во всё окно» ${viewport.width}×${viewport.height}`,
  );

  await ctx.shot('10-settings-open');

  await page.keyboard.press('Escape');
  await waitFor(async () => (await countMatching(page, DIALOG)) === 0, {
    timeout: 3000,
    message: 'Esc не закрыл панель настроек',
  });

  await clickText(page, 'Настройки');
  await page.waitForSelector(DIALOG, { timeout: 4000 });
  await clickAriaLabel(page, 'Закрыть');
  await waitFor(async () => (await countMatching(page, DIALOG)) === 0, {
    timeout: 3000,
    message: 'крестик не закрыл панель настроек',
  });
}
