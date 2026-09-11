/**
 * Сценарий 16 (NEW-03): перенос папки перетаскиванием.
 *
 * Настоящий pointer-перенос мышью puppeteer: тот же протокол, что у карточек
 * (порог 6 px, слушатели на окне, захват указателя) — но здесь он воспроизводим,
 * потому что цель и источник это строки сайдбара, а не masonry-карточки.
 *
 * Проверяется всё три вида целей из макетов D09–D11: середина строки — вложить,
 * четверть строки — индикатор вставки между строками, и Esc, который отменяет
 * перенос, ничего не тронув.
 */
import assert from 'node:assert/strict';
import { waitFor } from '../lib/helpers.mjs';

const rowRect = (page, name) =>
  page.evaluate((folderName) => {
    const row = [...document.querySelectorAll('[data-folder-row]')].find(
      (el) => el.querySelector('.sidebar-name')?.textContent.trim() === folderName,
    );
    if (!row) return null;
    const r = row.getBoundingClientRect();
    return {
      id: Number(row.dataset.folderRow),
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      cx: r.left + r.width / 2,
      cy: r.top + r.height / 2,
    };
  }, name);

const dragView = (page) =>
  page.evaluate(() => {
    const ghost = document.querySelector('[data-folder-ghost]');
    const insert = document.querySelector('[data-folder-insert]');
    const r = (el) => {
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    };
    return {
      ghost: r(ghost),
      tooltip: ghost?.textContent.trim() ?? null,
      insert: r(insert),
      rootZone: [...document.querySelectorAll('[data-folder-root-zone]')].length,
    };
  });

/** Довести указатель до точки несколькими шагами: порог 6 px должен быть пройден честно. */
async function dragTo(page, from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let step = 1; step <= 8; step += 1) {
    await page.mouse.move(
      from.x + ((to.x - from.x) * step) / 8,
      from.y + ((to.y - from.y) * step) / 8,
    );
  }
}

const parentOf = async (api, id) => {
  const tree = await api('GET', '/api/folders');
  const walk = (list, parent) => {
    for (const node of list) {
      if (node.id === id) return { parent, index: list.indexOf(node) };
      const found = walk(node.children, node.id);
      if (found) return found;
    }
    return null;
  };
  return walk(tree, null);
};

export default async function folderMove(ctx) {
  const { page, api } = ctx;
  await ctx.resetToLibraryRoot();

  // ── (а) Вложить: «Дашборды» в «Типографику» ───────────────────────────────
  const source = await rowRect(page, 'Дашборды');
  const target = await rowRect(page, 'Типографика');
  assert.ok(source && target, 'не нашёл строки «Дашборды» и «Типографика» в сайдбаре');
  assert.equal((await parentOf(api, source.id)).parent, null, '«Дашборды» до переноса не в корне');

  await dragTo(page, { x: source.cx, y: source.cy }, { x: target.cx, y: target.cy });
  const over = await waitFor(
    async () => {
      const view = await dragView(page);
      return view.ghost ? view : null;
    },
    { timeout: 3000, message: 'призрак переносимой папки не появился' },
  );
  assert.ok(over.tooltip.includes('В папку «Типографика»'), `тултип цели: «${over.tooltip}»`);
  assert.equal(over.insert, null, 'на середине строки нарисовался индикатор вставки');
  assert.ok(over.rootZone >= 2, 'зона «В корень» не появилась на время переноса');
  await ctx.shot('13-folder-drag-into');

  await page.mouse.up();
  await waitFor(
    async () => (await parentOf(api, source.id)).parent === target.id,
    { timeout: 6000, message: '«Дашборды» не переехали внутрь «Типографики»' },
  );

  // ── (б) Вставка между строками: обратно в корень, выше «Айдентики» ────────
  const nested = await rowRect(page, 'Дашборды');
  const identity = await rowRect(page, 'Айдентика');
  assert.ok(nested && identity, 'после переноса строки не нашлись');

  await dragTo(
    page,
    { x: nested.cx, y: nested.cy },
    { x: identity.cx, y: identity.top + identity.height / 8 },
  );
  const between = await waitFor(
    async () => {
      const view = await dragView(page);
      return view.insert ? view : null;
    },
    { timeout: 3000, message: 'индикатор вставки между строками не появился' },
  );
  assert.ok(
    between.tooltip.includes('Переместить выше «Айдентика»'),
    `тултип вставки: «${between.tooltip}»`,
  );
  assert.ok(
    Math.abs(between.insert.height - 2) <= 0.5,
    `толщина индикатора ${between.insert.height}, ожидалось 2`,
  );
  // Точка индикатора стоит на уровне отступа строки: у корневой это поле 12.
  assert.ok(
    Math.abs(between.insert.left - (identity.left + 12)) <= 1,
    `индикатор начинается на ${between.insert.left}, ожидалось ${identity.left + 12}`,
  );
  assert.ok(
    Math.abs(between.insert.top - identity.top) <= 2,
    `индикатор стоит на ${between.insert.top}, а верх строки — ${identity.top}`,
  );
  await ctx.shot('13-folder-drag-between');

  await page.mouse.up();
  const placed = await waitFor(
    async () => {
      const state = await parentOf(api, source.id);
      return state.parent === null ? state : null;
    },
    { timeout: 6000, message: '«Дашборды» не вернулись в корень' },
  );
  assert.ok(placed.index >= 0, 'папка потерялась в корне');

  // ── (в) Esc отменяет перенос ──────────────────────────────────────────────
  const again = await rowRect(page, 'Дашборды');
  const victim = await rowRect(page, 'Лендинги');
  await dragTo(page, { x: again.cx, y: again.cy }, { x: victim.cx, y: victim.cy });
  await waitFor(async () => (await dragView(page)).ghost !== null, {
    timeout: 3000,
    message: 'призрак не появился перед проверкой Esc',
  });
  await page.keyboard.press('Escape');
  await waitFor(async () => (await dragView(page)).ghost === null, {
    timeout: 3000,
    message: 'Esc не отменил перенос папки',
  });
  await page.mouse.up();
  assert.equal(
    (await parentOf(api, source.id)).parent,
    null,
    'отменённый Esc-ом перенос всё же состоялся',
  );
}
