/** Сценарий 8: правый клик по карточке открывает контекстное меню у курсора; Esc закрывает. */
import assert from 'node:assert/strict';
import { findByText, waitFor, parentRect, rect, assertContainingBlockClean } from '../lib/helpers.mjs';

const TARGET_FILE = 'violet-scene-12';
const ITEM_SELECTOR = '[role="menuitem"], button, a';

export default async function contextMenu(ctx) {
  const { page, seed } = ctx;
  await ctx.resetToLibraryRoot();

  const fileId = seed.filesByName.get(TARGET_FILE).id;
  const cardSelector = `[data-file-id="${fileId}"]`;
  await page.waitForSelector(cardSelector, { timeout: 4000 });
  // Карточка может лежать ниже видимой области окна (масонри-раскладка) — клик по
  // «сырым» координатам без прокрутки в видимую область попадёт мимо неё.
  await page.$eval(cardSelector, (el) => el.scrollIntoView({ block: 'center', inline: 'center' }));
  const cardRect = await rect(page, cardSelector);
  const x = cardRect.left + cardRect.width / 2;
  const y = cardRect.top + cardRect.height / 2;

  // Правый клик по одной и той же точке иногда не долетает до Radix ContextMenuTrigger
  // с первого раза (замечена редкая гонка с native contextmenu-событием в headless
  // Chrome) — пробуем ещё раз, прежде чем считать это падением сценария.
  let openItem = null;
  for (let attempt = 1; attempt <= 2 && !openItem; attempt += 1) {
    await page.mouse.click(x, y, { button: 'right' });
    openItem = await waitFor(() => findByText(page, 'Открыть', { selector: ITEM_SELECTOR }), {
      timeout: 1500,
      message: 'контекстное меню карточки не открылось',
    }).catch(() => null);
  }
  if (!openItem) throw new Error('контекстное меню карточки не открылось (после повторной попытки)');
  const menuRect = await parentRect(openItem);
  await openItem.dispose();

  const viewport = page.viewport();
  // Точность «у курсора» здесь не пиксельная (в макете есть небольшой офсет и коллизия с
  // краями), но меню обязано появиться рядом с точкой клика, а не в произвольном углу окна,
  // и не вылезти за пределы вьюпорта.
  assert.ok(
    Math.abs(menuRect.top - y) <= 60 && Math.abs(menuRect.left - x) <= 60,
    `меню открылось в (${menuRect.left}, ${menuRect.top}), клик был в (${x}, ${y}) — слишком далеко от курсора`,
  );
  assert.ok(
    menuRect.left >= 0 && menuRect.top >= 0 && menuRect.right <= viewport.width && menuRect.bottom <= viewport.height,
    `меню вышло за границы окна: ${JSON.stringify(menuRect)}`,
  );

  // Структурная проверка того же класса бага, что и в сценарии 5 (см. его комментарий) —
  // контекстное меню тоже стоит на Radix Popper, той же обёртке касается тот же баг.
  await assertContainingBlockClean(page, '[role="menuitem"]', 'контекстное меню карточки');

  await ctx.shot('08-context-menu-open');

  await page.keyboard.press('Escape');
  await waitFor(
    async () => {
      const stillThere = await findByText(page, 'Открыть', { selector: ITEM_SELECTOR });
      if (stillThere) {
        await stillThere.dispose();
        return false;
      }
      return true;
    },
    { timeout: 2000, message: 'Esc не закрыл контекстное меню' },
  );
}
