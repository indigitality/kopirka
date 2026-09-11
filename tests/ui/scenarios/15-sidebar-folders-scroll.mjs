/**
 * Сценарий 15 (NEW-01): сайдбар с сорока папками.
 *
 * Проверяет ровно то, ради чего область папок сделали фиксированной (макеты
 * D06–D08 от 11.09.2026): сколько бы папок ни было, строка остаётся 32 px,
 * логотип с разделами и заголовок «ПАПКИ» стоят на месте, подвал не уезжает
 * за нижний край, а едет только дерево. Плюс затухания: снизу — пока есть что
 * прокручивать вниз, сверху — когда список уже прокручен.
 *
 * Папки досеиваются через API и в конце убираются, поэтому следующие сценарии
 * видят ту же библиотеку, что и предыдущие.
 */
import assert from 'node:assert/strict';
import { waitFor } from '../lib/helpers.mjs';

/** Столько строк заведомо не помещается в область при окне 760. */
const EXTRA = 26;
const ROW = 32;

const metrics = (page) =>
  page.evaluate(() => {
    const box = document.querySelector('[data-drop-scroll]');
    const rows = [...document.querySelectorAll('[data-folder-row]')];
    const footer = [...document.querySelectorAll('aside button')].find(
      (el) => el.textContent.trim() === 'Настройки',
    );
    const scope = [...document.querySelectorAll('aside button')].find((el) =>
      el.textContent.trim().startsWith('Вся библиотека'),
    );
    const r = (el) => {
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, height: rect.height, width: rect.width };
    };
    return {
      rows: rows.length,
      heights: [...new Set(rows.map((el) => Math.round(el.getBoundingClientRect().height)))],
      scrollHeight: box?.scrollHeight ?? 0,
      clientHeight: box?.clientHeight ?? 0,
      scrollTop: box?.scrollTop ?? 0,
      area: r(box),
      footer: r(footer),
      scope: r(scope),
      fadeTop: !!document.querySelector('.sidebar-fade[data-edge="top"][data-show]'),
      fadeBottom: !!document.querySelector('.sidebar-fade[data-edge="bottom"][data-show]'),
      thumb: r(document.querySelector('.sidebar-thumb')),
    };
  });

export default async function sidebarFoldersScroll(ctx) {
  const { page, api } = ctx;
  await ctx.resetToLibraryRoot();

  const before = await metrics(page);

  const created = [];
  for (let i = 0; i < EXTRA; i += 1) {
    created.push(await api('POST', '/api/folders', { name: `Полка ${String(i + 1).padStart(2, '0')}` }));
  }

  try {
    await page.reload({ waitUntil: 'networkidle0', timeout: 30000 });
    await waitFor(async () => (await metrics(page)).rows >= before.rows + EXTRA, {
      timeout: 10000,
      message: 'сайдбар не показал досеянные папки',
    });

    const many = await metrics(page);
    assert.ok(many.rows >= 40, `папок в сайдбаре ${many.rows}, ожидалось не меньше 40`);
    assert.deepEqual(many.heights, [ROW], `строки сайдбара разной высоты: ${many.heights.join(', ')}`);

    // Область прокручивается, а не растёт: содержимое выше окна области.
    assert.ok(
      many.scrollHeight > many.clientHeight + 1,
      `область папок не прокручивается: scrollHeight ${many.scrollHeight}, clientHeight ${many.clientHeight}`,
    );

    // Шапка и подвал стоят там же, где при 15 папках, — группа высоту не меняет.
    assert.ok(
      Math.abs(many.scope.top - before.scope.top) <= 1,
      `раздел «Вся библиотека» уехал на ${(many.scope.top - before.scope.top).toFixed(1)}px`,
    );
    assert.ok(
      Math.abs(many.footer.bottom - before.footer.bottom) <= 1,
      `подвал уехал на ${(many.footer.bottom - before.footer.bottom).toFixed(1)}px`,
    );
    assert.ok(
      Math.abs(many.footer.height - ROW) <= 1,
      `строка подвала сжалась до ${many.footer.height.toFixed(1)}px`,
    );

    // Собственная полоса прокрутки: 4 px у правого края области (D08).
    assert.ok(many.thumb, 'ползунок прокрутки не появился');
    assert.ok(Math.abs(many.thumb.width - 4) <= 0.5, `ширина ползунка ${many.thumb.width}, ожидалось 4`);

    // Список в самом верху: затухание снизу есть, сверху — нет (D06).
    assert.equal(many.fadeBottom, true, 'нет затухания у нижнего края, хотя ниже есть что показать');
    assert.equal(many.fadeTop, false, 'затухание сверху стоит на непрокрученном списке');
    await ctx.shot('12-sidebar-40-folders-top');

    await page.evaluate(() => {
      const box = document.querySelector('[data-drop-scroll]');
      box.scrollTop = box.scrollHeight;
      box.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    const bottom = await waitFor(
      async () => {
        const state = await metrics(page);
        return state.fadeTop ? state : null;
      },
      { timeout: 4000, message: 'после прокрутки вниз не появилось затухание сверху' },
    );
    assert.equal(bottom.fadeBottom, false, 'затухание снизу осталось на докрученном до конца списке');
    assert.ok(bottom.scrollTop > 0, 'область не прокрутилась');
    await ctx.shot('12-sidebar-40-folders-bottom');
  } finally {
    for (const folder of created) await api('DELETE', `/api/folders/${folder.id}`);
    await page.reload({ waitUntil: 'networkidle0', timeout: 30000 });
    await waitFor(async () => (await metrics(page)).rows === before.rows, {
      timeout: 10000,
      message: 'досеянные папки не убрались из сайдбара',
    });
  }
}
