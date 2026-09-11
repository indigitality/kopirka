/**
 * Сценарий 3: поиск-модалка (NEW-02) вместо поля в верхней панели.
 *
 * Проверяем ровно тот путь, ради которого она делалась: ⌘K открывает, ввод сужает
 * выдачу, ↵ на теге закрепляет чип, ⌘↵ переносит запрос на сетку (число карточек
 * сверено с ответом API), Esc закрывает. Плюс структурная проверка слоя —
 * `assertContainingBlockClean` по `[data-modal-layer]`: модалка обязана жить в
 * портале, а не внутри панели контента (см. README, «Зачем два движка»).
 */
import assert from 'node:assert/strict';
import { assertContainingBlockClean, cardIds, waitFor, waitForCardCount } from '../lib/helpers.mjs';

const PALETTE = '[data-kopirka-search-palette]';
const INPUT = `${PALETTE} input[aria-label="Искать файлы, теги, форматы"]`;
const FILE_ROW = '[data-search-row="file"]';
const TAG_ROW = '[data-search-row="tag"]';
const CHIP = '[data-search-chip="tag:harbor"]';

/** Файл, у которого имя и тег совпадают, — одна строка запроса проверяет обе секции. */
const TARGET = 'harbor-scene-09';
const TAG = 'harbor';

async function openPalette(page) {
  await page.keyboard.down('Meta');
  await page.keyboard.press('KeyK');
  await page.keyboard.up('Meta');
  await page.waitForSelector(PALETTE, { timeout: 4000 });
  // Поле фокусируется само (onOpenAutoFocus) — ждём, иначе ввод уйдёт в пустоту.
  await waitFor(async () => page.$eval(INPUT, (el) => el === document.activeElement), {
    timeout: 3000,
    message: 'поле поиск-модалки не получило фокус',
  });
}

async function closedPalette(page) {
  return waitFor(async () => (await page.$(PALETTE)) === null, {
    timeout: 4000,
    message: 'поиск-модалка не закрылась',
  });
}

async function pressMetaEnter(page) {
  await page.keyboard.down('Meta');
  await page.keyboard.press('Enter');
  await page.keyboard.up('Meta');
}

/** Сколько строк файлов сейчас в выдаче модалки. */
async function fileRowIds(page) {
  return page.$$eval(FILE_ROW, (els) => els.map((el) => Number(el.getAttribute('data-search-entity-id'))));
}

export default async function search(ctx) {
  const { page, api, seed } = ctx;
  await ctx.resetToLibraryRoot();

  const targetId = seed.filesByName.get(TARGET).id;
  // Сидирование тегов не расставляет — ставим свой, чтобы было что закреплять чипом.
  await api('POST', '/api/files/tag', { fileIds: [targetId], add: [TAG] });

  try {
    // ── ⌘K открывает модалку, ввод сужает выдачу ────────────────────────────
    await openPalette(page);
    await assertContainingBlockClean(page, PALETTE, 'поиск-модалка', {
      wrapperSelector: '[data-modal-layer]',
      requireBodyParent: false,
    });
    // Пустое состояние D01: частые теги, форматы со счётчиками, корневые папки.
    await waitFor(async () => (await page.$$('[data-search-row="ext"]')).length > 0, {
      timeout: 6000,
      message: 'в пустой модалке нет секции «Форматы»',
    });
    await ctx.shot('03-search-palette-empty');

    await page.keyboard.type(TARGET.slice(0, 6), { delay: 12 });
    const rows = await waitFor(
      async () => {
        const ids = await fileRowIds(page);
        return ids.length === 1 ? ids : null;
      },
      { timeout: 6000, message: 'ввод «harbor» не сузил выдачу модалки до одной строки' },
    );
    assert.equal(rows[0], targetId, 'модалка нашла не тот файл');
    await ctx.shot('03-search-palette-typed');

    // ── ⌘↵ переносит запрос на сетку ────────────────────────────────────────
    const expectedByName = await api('GET', `/api/files?query=${encodeURIComponent(TARGET.slice(0, 6))}&limit=100`);
    await pressMetaEnter(page);
    await closedPalette(page);
    const narrowed = await waitForCardCount(page, expectedByName.total, {
      timeout: 6000,
      message: `сетка не сузилась до ${expectedByName.total} карточек после ⌘↵`,
    });
    assert.equal(narrowed[0], targetId, 'после ⌘↵ в сетке не тот файл');
    // Активный запрос виден в верхней панели — иначе после закрытия модалки он бы пропал из виду.
    assert.ok(
      await page.$('button[aria-label^="Поиск: "]'),
      'кнопка поиска не показывает активную строку запроса',
    );
    await ctx.shot('03-search-applied-to-grid');

    // ── ↵ на теге закрепляет чип ────────────────────────────────────────────
    await openPalette(page);
    await page.keyboard.type(TAG, { delay: 12 });
    await waitFor(async () => (await page.$$(TAG_ROW)).length > 0, {
      timeout: 6000,
      message: 'секция «Теги» не появилась в модалке',
    });
    // ↓ уводит с первой строки (файл) на первый тег, ↵ закрепляет его чипом.
    await page.keyboard.press('ArrowDown');
    await waitFor(
      async () => page.$eval(TAG_ROW, (el) => el.getAttribute('aria-selected') === 'true'),
      { timeout: 3000, message: '↓ не перевела выбор на строку тега' },
    );
    await page.keyboard.press('Enter');

    await page.waitForSelector(CHIP, { timeout: 3000 });
    assert.equal(await page.$eval(INPUT, (el) => el.value), '', 'после закрепления чипа строка не очистилась');
    await ctx.shot('03-search-tag-chip');

    // ── ⌘↵ с чипом: сетка сужается по тегу, фильтр виден в панели ───────────
    const expectedByTag = await api('GET', `/api/files?tags=${encodeURIComponent(TAG)}&limit=100`);
    assert.ok(expectedByTag.total > 0, 'тег для проверки не проставился через API');
    await pressMetaEnter(page);
    await closedPalette(page);
    const byTag = await waitForCardCount(page, expectedByTag.total, {
      timeout: 6000,
      message: `сетка не сузилась до ${expectedByTag.total} карточек после ⌘↵ с чипом тега`,
    });
    assert.deepEqual(
      [...byTag].sort((a, b) => a - b),
      expectedByTag.files.map((file) => file.id).sort((a, b) => a - b),
      'после ⌘↵ в сетке не те файлы, что отдаёт API по тегу',
    );
    assert.ok(
      await page.$('button[aria-label="Фильтр, активных: 1"]'),
      'закреплённый чип не доехал до панели фильтров верхней панели',
    );

    // ── Esc закрывает ───────────────────────────────────────────────────────
    await openPalette(page);
    await page.keyboard.press('Escape');
    await closedPalette(page);
    // Сетка от Esc не меняется: модалка ничего не применяла.
    assert.equal((await cardIds(page)).length, expectedByTag.total, 'Esc в модалке изменил выдачу сетки');
  } finally {
    // Тег ставили ради проверки — убираем, чтобы следующие сценарии видели чистую библиотеку.
    await api('POST', '/api/files/tag', { fileIds: [targetId], remove: [TAG] }).catch(() => undefined);
  }
}
