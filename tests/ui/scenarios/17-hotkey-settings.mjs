/**
 * Сценарий 17 (FDB-10): настройки → «Горячие клавиши».
 *
 * Проверяется ровно то, что в макетах D26–D29 с правками Сергея от 11.09:
 *   тогл выключен → в строке нет ни поля-рекордера, ни кнопки сброса;
 *   тогл включён  → они появляются;
 *   клик по полю → запись, нажатие ⌃⌥K фиксирует сочетание, «Сохранить» пишет
 *   его в конфиг — это и проверяется через `GET /api/settings`, а не по DOM.
 *
 * Плюс правка 11.09.2026: после клика фокус стоит на поле, а нажатие, посланное
 * мимо него (в `document.body`), всё равно записывается — слушателем на `window`.
 *
 * Настоящую регистрацию хоткея здесь проверить нельзя: её делает оболочка Tauri,
 * а прогон идёт в браузере. Она проверяется руками в собранном приложении.
 */
import assert from 'node:assert/strict';
import { clickText, clickAriaLabel, countMatching, waitFor } from '../lib/helpers.mjs';

const DIALOG = '[role="dialog"]';
const SWITCH = '[role="switch"]';
/** Поле-рекордер — кнопка, её `aria-label` начинается с «Сочетание». */
const RECORDER = 'button[aria-label^="Сочетание"], button[aria-label="Нажмите сочетание"]';

/** Открыть настройки и дождаться раздела «Горячие клавиши». */
async function openSettings(page) {
  await clickText(page, 'Настройки');
  await page.waitForSelector(DIALOG, { timeout: 4000 });
  await waitFor(async () => (await countMatching(page, SWITCH)) === 1, {
    timeout: 4000,
    message: 'тогл горячей клавиши не найден в настройках',
  });
}

async function closeSettings(page) {
  await page.keyboard.press('Escape');
  await waitFor(async () => (await countMatching(page, DIALOG)) === 0, {
    timeout: 4000,
    message: 'панель настроек не закрылась',
  });
}

export default async function hotkeySettings(ctx) {
  const { page, api } = ctx;
  await ctx.resetToLibraryRoot();

  const before = await api('GET', '/api/settings');
  assert.equal(
    before.captureShortcut,
    'Alt+Super+C',
    `в свежем конфиге сочетание ${before.captureShortcut}, ожидалось ⌥⌘C`,
  );

  await openSettings(page);

  // Включено по умолчанию — поле и кнопка сброса на месте.
  assert.equal(await countMatching(page, RECORDER), 1, 'поле-рекордер не показано при включённом тогле');
  assert.equal(
    await countMatching(page, 'button[aria-label^="Сбросить на"]'),
    1,
    'кнопка сброса не показана при включённом тогле',
  );

  // Выключаем — в строке остаются только заголовок, описание и сам тогл.
  await page.click(SWITCH);
  await waitFor(async () => (await countMatching(page, RECORDER)) === 0, {
    timeout: 3000,
    message: 'поле-рекордер не исчезло после выключения тогла',
  });
  assert.equal(
    await countMatching(page, 'button[aria-label^="Сбросить на"]'),
    0,
    'кнопка сброса осталась при выключенном тогле',
  );
  assert.equal(
    await page.$eval(SWITCH, (node) => node.getAttribute('aria-checked')),
    'false',
    'тогл не переключился в выключенное состояние',
  );

  await ctx.shot('13-hotkey-off');

  // Включаем обратно.
  await page.click(SWITCH);
  await waitFor(async () => (await countMatching(page, RECORDER)) === 1, {
    timeout: 3000,
    message: 'поле-рекордер не вернулось после включения тогла',
  });

  // Запись: клик по полю → «Нажмите сочетание…», затем ⌃⌥K.
  await page.click(RECORDER);
  await waitFor(
    async () => (await countMatching(page, 'button[aria-label="Нажмите сочетание"]')) === 1,
    { timeout: 3000, message: 'поле не перешло в режим записи' },
  );

  /*
    Модификаторы жмём по отдельности, а не через `keyboard.press('Control+Alt+k')`:
    рекордер показывает их живьём по мере нажатия, и это часть проверки —
    в DOM должны появиться кейкапы ⌃ и ⌥ ещё до последней клавиши.
  */
  await page.keyboard.down('Control');
  await page.keyboard.down('Alt');
  const liveCaps = await page.$eval(RECORDER, (node) => node.textContent ?? '');
  assert.ok(liveCaps.includes('⌃') && liveCaps.includes('⌥'), `в поле «${liveCaps}» нет живых модификаторов`);
  await page.keyboard.press('KeyK');
  await page.keyboard.up('Alt');
  await page.keyboard.up('Control');

  await waitFor(
    async () => {
      const text = await page.$eval(RECORDER, (node) => node.textContent ?? '');
      return text.includes('⌃') && text.includes('⌥') && text.includes('K');
    },
    { timeout: 3000, message: 'сочетание ⌃⌥K не зафиксировалось в поле' },
  );

  await ctx.shot('13-hotkey-recorded');

  await clickText(page, 'Сохранить');
  await waitFor(
    async () => {
      const settings = await api('GET', '/api/settings');
      return settings.captureShortcut === 'Control+Alt+KeyK';
    },
    { timeout: 5000, message: 'сочетание не доехало до конфига сервера' },
  );

  // Кнопка сброса возвращает ⌥⌘C — и это тоже сохраняется.
  await clickAriaLabel(page, 'Сбросить на ⌥⌘C');
  await clickText(page, 'Сохранить');
  await waitFor(
    async () => {
      const settings = await api('GET', '/api/settings');
      return settings.captureShortcut === 'Alt+Super+C';
    },
    { timeout: 5000, message: 'сброс на ⌥⌘C не доехал до конфига' },
  );

  /*
    Фокус и слушатель на `window` (правка 11.09.2026). В Chrome клик по <button>
    фокус ставит сам, поэтому баг «нажатия уходят в document.body» тут не
    воспроизводится — он ловится WebKit-стендом. Здесь проверяем две половины
    лечения структурно: после клика фокус на поле, и нажатие, посланное МИМО
    поля (в `document.body`), всё равно записывается.
  */
  await page.click(RECORDER);
  const focusLabel = await page.evaluate(() => {
    const el = document.activeElement;
    return el === null ? null : (el.getAttribute('aria-label') ?? el.tagName);
  });
  assert.equal(focusLabel, 'Нажмите сочетание', `после клика фокус на «${focusLabel}», а не на поле-рекордере`);

  const prevented = await page.evaluate(() => {
    const event = new KeyboardEvent('keydown', {
      key: 'k', code: 'KeyK', ctrlKey: true, altKey: true,
      bubbles: true, cancelable: true, composed: true,
    });
    document.body.dispatchEvent(event);
    return event.defaultPrevented;
  });
  assert.ok(prevented, 'нажатие мимо поля не было перехвачено слушателем на window');
  await waitFor(
    async () => {
      const text = await page.$eval(RECORDER, (node) => node.textContent ?? '');
      return text.includes('⌃') && text.includes('⌥') && text.includes('K');
    },
    { timeout: 3000, message: 'нажатие в document.body не записалось в поле' },
  );

  // ⌘C забирает родное меню окна (desktop/src-tauri/src/menu.rs) — отбиваем сразу.
  await page.click(RECORDER);
  await page.evaluate(() => {
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'c', code: 'KeyC', metaKey: true, bubbles: true, cancelable: true, composed: true,
      }),
    );
  });
  await waitFor(
    async () => {
      const found = await page.$('[data-shortcut-row] p[role="alert"]');
      if (!found) return false;
      const text = await page.$eval('[data-shortcut-row] p[role="alert"]', (node) => node.textContent ?? '');
      await found.dispose();
      return text.includes('занято меню приложения');
    },
    { timeout: 3000, message: 'на ⌘C не показана ошибка «занято меню приложения»' },
  );

  // Esc во время записи отменяет запись, а панель настроек оставляет открытой.
  await page.keyboard.press('Escape');
  await waitFor(async () => (await countMatching(page, 'button[aria-label="Нажмите сочетание"]')) === 0, {
    timeout: 3000,
    message: 'Esc не отменил запись',
  });
  assert.equal(await countMatching(page, DIALOG), 1, 'Esc во время записи закрыл всю панель настроек');

  await closeSettings(page);
}
