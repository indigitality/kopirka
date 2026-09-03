/**
 * Сценарий 5 — главный: тот самый баг Сергея («починили колесо мыши в списке
 * папок — список стал открываться в правом нижнем углу окна»), коммит 54c6287.
 *
 * Важная оговорка после разбора: headless Chrome (Blink) сам компенсирует
 * ошибку containing block у Floating UI, поэтому геометрия здесь может
 * случайно сойтись даже при неверном месте портала — баг в чистом виде ловит
 * только WebKit (см. tests/ui/webkit/, тот же прогон на движке Tauri). Здесь
 * поэтому две независимые проверки: геометрическая (для регрессий вообще) и
 * структурная `assertContainingBlockClean` (для конкретно этого бага — она
 * смотрит на само дерево DOM, а не на то, как Blink его отрисовал).
 *
 * Проверяем: список стоит под полем «Выберите папку» (не в углу окна), обёртка
 * поповера портализована в document.body без containing block на пути к ней,
 * высота диалога не прыгает при его открытии, колесо мыши реально скроллит
 * список, синтетический wheel не гасится react-remove-scroll (проверяем из
 * середины диапазона прокрутки — не с границы, иначе легитимная защита от
 * overscroll выглядела бы как баг), и раздельные Esc закрывают сначала
 * список, потом диалог.
 */
import assert from 'node:assert/strict';
import {
  findByText,
  clickText,
  waitFor,
  rect,
  elementRect,
  stableRect,
  countMatching,
  dispatchWheelDefaultPrevented,
  getScrollTop,
  selectCard,
  assertContainingBlockClean,
} from '../lib/helpers.mjs';

export default async function moveDialogPosition(ctx) {
  const { page, seed } = ctx;
  await ctx.resetToLibraryRoot();

  await selectCard(page, seed.filesByName.get('granite-scene-11').id);
  await page.waitForSelector('[role="toolbar"][aria-label="Действия над выделенными файлами"]', { timeout: 4000 });
  await clickText(page, 'В папку');

  await page.waitForSelector('[role="dialog"]', { timeout: 4000 });
  // Диалог появляется пружиной (modalMotion: scale 0.96 → 1) — если измерить сразу
  // после монтирования, а не дождавшись, пока анимация уляжется, «высота до» будет
  // ещё уменьшенной (поймано на практике: 237 вместо итоговых ~247px). Ждём то же
  // самое стабильное состояние, что и для списка ниже.
  const dialogRectBefore = await stableRect(page, '[role="dialog"]', { timeout: 2000 });

  const trigger = await waitFor(() => findByText(page, 'Выберите папку'), {
    timeout: 3000,
    message: 'поле «Выберите папку» не появилось в диалоге',
  });
  const triggerRect = await elementRect(trigger);
  await trigger.click();

  await page.waitForSelector('[role="listbox"]', { timeout: 3000 });
  const listboxRect = await stableRect(page, '[role="listbox"]', { timeout: 2000 });
  await ctx.shot('05-move-dialog-listbox-open');

  const dialogRectAfter = await rect(page, '[role="dialog"]');
  assert.ok(
    Math.abs(dialogRectAfter.height - dialogRectBefore.height) <= 1,
    `высота диалога изменилась с открытием списка: ${dialogRectBefore.height} → ${dialogRectAfter.height}`,
  );

  // ── Позиция: список должен стоять под полем, а не в углу окна ──────────────
  assert.ok(
    Math.abs(listboxRect.left - triggerRect.left) <= 2,
    `left списка ${listboxRect.left}, ожидался ${triggerRect.left} ±2 (левый край поля)`,
  );
  assert.ok(
    Math.abs(listboxRect.top - (triggerRect.bottom + 6)) <= 2,
    `top списка ${listboxRect.top}, ожидалось ${triggerRect.bottom + 6} ±2 (низ поля + отступ 6)`,
  );
  assert.ok(
    Math.abs(listboxRect.width - triggerRect.width) <= 2,
    `ширина списка ${listboxRect.width}, ожидалась ширина поля ${triggerRect.width} ±2`,
  );

  // ── Структурная причина того же бага: обёртка Radix в body, без containing block ──
  await assertContainingBlockClean(page, '[role="listbox"]', 'список папок «Переместить в папку»');

  // ── Список действительно длиннее видимой области — есть что скроллить ──────
  const optionCount = await countMatching(page, '[role="option"]');
  assert.ok(optionCount >= 10, `в списке всего ${optionCount} пунктов — регрессия прокрутки была бы незаметна`);

  // ── Колесо мыши над списком действительно скроллит его (не гасится react-remove-scroll) ──
  const before = await getScrollTop(page, '[role="listbox"]');
  await page.mouse.move(listboxRect.left + listboxRect.width / 2, listboxRect.top + listboxRect.height / 2);
  await page.mouse.wheel({ deltaY: 300 });
  await waitFor(async () => (await getScrollTop(page, '[role="listbox"]')) > before, {
    timeout: 2000,
    message: `колесо мыши не сдвинуло scrollTop списка (было ${before})`,
  });

  // ── Синтетический wheel на пункте списка не должен быть отменён ────────────
  // Список сейчас докручен реальным колесом почти до конца (см. выше) — если
  // проверять synthetic-событие прямо тут, оно упрётся в нижнюю границу, и
  // react-remove-scroll законно погасит overscroll (это защита от утечки
  // скролла наружу, а не баг). dispatchWheelDefaultPrevented сама переставляет
  // список в середину диапазона перед событием — проверяем подавление вне
  // замка, а не законную блокировку на границе.
  const prevented = await dispatchWheelDefaultPrevented(page, '[role="option"]', {
    scrollContainerSelector: '[role="listbox"]',
  });
  assert.equal(prevented, false, 'synthetic WheelEvent на пункте списка оказался defaultPrevented');

  // ── Esc закрывает только список, диалог остаётся ────────────────────────────
  await page.keyboard.press('Escape');
  await waitFor(async () => (await countMatching(page, '[role="listbox"]')) === 0, {
    timeout: 2000,
    message: 'первый Esc не закрыл список папок',
  });
  const dialogStillOpen = await countMatching(page, '[role="dialog"]');
  assert.equal(dialogStillOpen, 1, 'первый Esc закрыл не только список, но и весь диалог');
  await ctx.shot('05-move-dialog-after-first-esc');

  // ── Второй Esc закрывает диалог ─────────────────────────────────────────────
  await page.keyboard.press('Escape');
  await waitFor(async () => (await countMatching(page, '[role="dialog"]')) === 0, {
    timeout: 2000,
    message: 'второй Esc не закрыл диалог «Переместить в папку»',
  });
}
