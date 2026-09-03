/**
 * Общие помощники прогона: ожидание условий, геометрия, поиск по тексту/aria,
 * HTTP-клиент к API «Копирки». Ничего специфичного для одного сценария здесь нет —
 * специфика живёт в scenarios/*.mjs.
 */

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * slug для имени файла скриншота: только латиница/цифры/дефис. Русские названия
 * сценариев не транслитерируются — вызывающий код передаёт свой короткий
 * латинский slug для скриншотов (см. scenarios/*.mjs), эта функция лишь
 * подчищает произвольную строку до безопасного имени файла.
 */
export function slugify(text) {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'scenario'
  );
}

/**
 * Общий помощник ожидания: опрашивает predicate, пока он не вернёт «истинное»
 * значение (оно же возвращается наружу) или не истечёт timeout.
 */
export async function waitFor(predicate, { timeout = 5000, interval = 100, message = 'условие не выполнено' } = {}) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeout) {
    try {
      const value = await predicate();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(interval);
  }
  const suffix = lastError ? ` — последняя ошибка: ${lastError instanceof Error ? lastError.message : String(lastError)}` : '';
  throw new Error(`waitFor: ${message} (таймаут ${timeout}мс)${suffix}`);
}

/** Геометрия элемента — один снимок. */
export async function rect(page, selector) {
  return page.$eval(selector, (el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  });
}

/**
 * Опрашивает getter(), пока несколько подряд прочитанных прямоугольников не
 * совпадут с точностью до epsilon — нужна для позиционных проверок
 * поповеров/списков: они появляются пружиной (motion-presets.ts, glassLayerMotion),
 * и во время анимации transform ещё едет к финальной точке. Ждём, пока движение
 * закончится по факту, а не гадаем длительность пружины по времени.
 */
async function pollStable(getter, { timeout = 3000, interval = 60, samples = 3, epsilon = 0.5, label = 'элемент' } = {}) {
  const start = Date.now();
  let last = null;
  let stableCount = 0;
  while (Date.now() - start < timeout) {
    let current;
    try {
      current = await getter();
    } catch {
      current = null;
    }
    if (
      current && last &&
      Math.abs(current.left - last.left) < epsilon &&
      Math.abs(current.top - last.top) < epsilon &&
      Math.abs(current.width - last.width) < epsilon &&
      Math.abs(current.height - last.height) < epsilon
    ) {
      stableCount += 1;
      if (stableCount >= samples) return current;
    } else {
      stableCount = 0;
    }
    last = current;
    await sleep(interval);
  }
  if (last) return last;
  throw new Error(`stableRect: ${label} не появился за ${timeout}мс`);
}

export function stableRect(page, selector, opts = {}) {
  return pollStable(() => rect(page, selector), { ...opts, label: `"${selector}"` });
}

/** Геометрия конкретной ручки ElementHandle — один снимок. */
export async function elementRect(handle) {
  return handle.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  });
}

/** Геометрия родителя ручки — удобно для слоёв, у которых нет своего стабильного селектора. */
export async function parentRect(handle) {
  return handle.evaluate((el) => {
    const r = el.parentElement.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  });
}

/** То же, что stableRect, но по уже найденной ручке (или её родителю) — для слоёв без CSS-якоря. */
export function stableElementRect(handle, opts = {}) {
  return pollStable(() => elementRect(handle), { ...opts, label: 'элемент' });
}
export function stableParentRect(handle, opts = {}) {
  return pollStable(() => parentRect(handle), { ...opts, label: 'родитель элемента' });
}

/** Ручка на элемент, найденный по точному (или частичному) совпадению текста. */
export async function findByText(page, text, { selector = 'button, a, [role="button"], [role="option"], [role="menuitemradio"]', exact = true } = {}) {
  const handle = await page.evaluateHandle(
    (sel, needle, isExact) => {
      const els = Array.from(document.querySelectorAll(sel));
      return (
        els.find((el) => {
          const content = (el.textContent || '').trim();
          return isExact ? content === needle : content.includes(needle);
        }) ?? null
      );
    },
    selector,
    text,
    exact,
  );
  const el = handle.asElement();
  if (!el) {
    await handle.dispose();
    return null;
  }
  return el;
}

/** Клик по элементу, найденному по тексту. Бросает понятную ошибку, если не нашёлся. */
export async function clickText(page, text, opts) {
  const el = await findByText(page, text, opts);
  if (!el) throw new Error(`clickText: не найден элемент с текстом "${text}"`);
  await el.click();
  await el.dispose();
}

/**
 * Клик по строке раздела сайдбара («Вся библиотека» / «Не разобрано» / «Корзина» —
 * features/shell/Sidebar.tsx, ScopeRow). У этих кнопок счётчик — тот же текстовый
 * узел, что и подпись (`{item.label}{count}` без пробела), поэтому точное
 * совпадение текста не срабатывает: ищем по вхождению и только среди кнопок
 * `<nav>` с разделами, чтобы не зацепить случайно похожий текст в другом месте.
 */
export async function clickScope(page, label) {
  await clickText(page, label, { selector: 'nav button', exact: false });
}

/** Ручка на элемент по точному значению aria-label. */
export async function findByAriaLabel(page, label, { selector = '[aria-label]' } = {}) {
  const handle = await page.evaluateHandle(
    (sel, needle) => {
      const els = Array.from(document.querySelectorAll(sel));
      return els.find((el) => el.getAttribute('aria-label') === needle) ?? null;
    },
    selector,
    label,
  );
  const el = handle.asElement();
  if (!el) {
    await handle.dispose();
    return null;
  }
  return el;
}

export async function clickAriaLabel(page, label, opts) {
  const el = await findByAriaLabel(page, label, opts);
  if (!el) throw new Error(`clickAriaLabel: не найден элемент с aria-label "${label}"`);
  await el.click();
  await el.dispose();
}

/** id всех карточек сетки в порядке DOM (совпадает с порядком ответа API — GridScreen не пересортировывает). */
export async function cardIds(page) {
  return page.$$eval('[data-file-id]', (els) => els.map((el) => Number(el.getAttribute('data-file-id'))));
}

export async function waitForCardCount(page, count, opts) {
  return waitFor(
    async () => {
      const ids = await cardIds(page);
      return ids.length === count ? ids : null;
    },
    { message: `в сетке не стало ${count} карточек`, ...opts },
  );
}

/** Выделить конкретную карточку кликом по id файла — не зависит от текущей сортировки. */
export async function selectCard(page, fileId) {
  const handle = await page.$(`[data-file-id="${fileId}"]`);
  if (!handle) throw new Error(`selectCard: карточка файла ${fileId} не найдена в сетке`);
  await handle.click();
  await handle.dispose();
}

/** Очистить/задать текст поля через тройной клик (выделяет всё) + реальную клавиатуру. */
export async function setFieldValue(page, selector, text) {
  // И тройной клик (page.click(selector, {clickCount:3})), и Cmd+A + Backspace
  // здесь ненадёжны в headless-режиме: то CDP растягивает три mousedown/mouseup
  // дальше порога, который Chrome даёт тройному клику, и он вырождается в обычный
  // одиночный, то Cmd+A не выделяет текст целиком — оба раза после «очистки» в
  // поле оставался хвост текста ("harbo" вместо ""). Чистим полe нативным
  // сеттером value (в обход перехваченного React'ом дескриптора) и настоящим
  // событием input, которое React слушает штатно — а не гадаем, как поведёт себя
  // синтетический клик или хоткей.
  await page.focus(selector);
  await page.evaluate((sel) => {
    const input = document.querySelector(sel);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, selector);
  if (text) await page.keyboard.type(text, { delay: 12 });
}

/**
 * Синтетический WheelEvent на элементе — вернуть, был ли он отменён (preventDefault).
 *
 * Если задан `scrollContainerSelector`, список сначала ставится в середину своего
 * диапазона прокрутки. Без этого проверка была нечестной: если список перед этим
 * уже докрутили колесом до упора (реальным `page.mouse.wheel`), дальнейший
 * синтетический wheel в ту же сторону упирается в границу, и `react-remove-scroll`
 * законно гасит overscroll — это защита от утечки скролла наружу, а не тот баг,
 * который сценарий должен ловить (поймано на прогоне: колесо докрутило список до
 * низа, а следующая проверка приняла границу за регрессию).
 */
export async function dispatchWheelDefaultPrevented(page, selector, { deltaY = 40, scrollContainerSelector } = {}) {
  return page.$eval(
    selector,
    (el, dy, containerSel) => {
      if (containerSel) {
        const container = el.closest(containerSel) ?? document.querySelector(containerSel);
        if (container) {
          container.scrollTop = Math.max(0, Math.round((container.scrollHeight - container.clientHeight) / 2));
        }
      }
      const event = new WheelEvent('wheel', { deltaY: dy, bubbles: true, cancelable: true });
      el.dispatchEvent(event);
      return event.defaultPrevented;
    },
    deltaY,
    scrollContainerSelector ?? null,
  );
}

/**
 * Структурная проверка containing block для плавающего слоя Radix (Popper):
 * находит обёртку `[data-radix-popper-content-wrapper]` — она несёт
 * `position: fixed` + `transform` от Floating UI — и проверяет ровно то, что
 * реально ловит баг WebKit (коммит 54c6287, ../webkit/inject.mjs::measure —
 * та же логика, продублирована для JS-контекста WKWebView): (1) её родитель —
 * `document.body`, то есть слой не портализован внутрь другого контейнера,
 * (2) ни один предок между обёрткой и `<html>` не образует containing block
 * для `position: fixed` — `transform`/`filter`/`backdrop-filter`/`perspective`
 * ≠ none, `will-change` с transform/filter, или `contain` со значениями
 * paint/layout/strict/content.
 *
 * Зачем это нужно, если геометрия (`stableRect` + сравнение с триггером) и так
 * проверяется: Floating UI на Blink сам компенсирует смещённый containing
 * block (учитывает его при расчёте позиции), поэтому в headless Chrome
 * геометрия может случайно сойтись даже при неверном месте портала — баг
 * ловится только в WebKit (см. tests/ui/webkit/). Эта проверка ловит саму
 * структурную причину независимо от того, во что она превращается в
 * конкретном движке.
 */
export async function checkContainingBlock(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { found: false, notFound: true };
    const wrapper = el.closest('[data-radix-popper-content-wrapper]');
    if (!wrapper) return { found: false, wrapperMissing: true };

    const parentIsBody = wrapper.parentElement === document.body;
    const parentTag = wrapper.parentElement ? wrapper.parentElement.tagName.toLowerCase() : null;

    let offending = null;
    for (let node = wrapper.parentElement; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      const backdrop = style.backdropFilter || style.webkitBackdropFilter || 'none';
      const reasons = [];
      if (style.transform !== 'none') reasons.push(`transform: ${style.transform}`);
      if (style.filter !== 'none') reasons.push(`filter: ${style.filter}`);
      if (backdrop !== 'none') reasons.push(`backdrop-filter: ${backdrop}`);
      if (style.perspective && style.perspective !== 'none') reasons.push(`perspective: ${style.perspective}`);
      if (/(^|[\s,])(transform|filter)([\s,]|$)/.test(style.willChange || '')) reasons.push(`will-change: ${style.willChange}`);
      if (/paint|layout|strict|content/.test(style.contain || '')) reasons.push(`contain: ${style.contain}`);
      if (reasons.length > 0) {
        offending = {
          tag: node.tagName.toLowerCase(),
          className: typeof node.className === 'string' ? node.className.slice(0, 140) : '',
          reasons,
        };
        break;
      }
    }

    return { found: true, parentTag, parentIsBody, offending };
  }, selector);
}

/** Бросает понятную ошибку, если у слоя за `selector` неверный containing block. */
export async function assertContainingBlockClean(page, selector, label) {
  const result = await checkContainingBlock(page, selector);
  if (!result.found) {
    throw new Error(
      `containing-block(${label}): ${result.wrapperMissing ? `у "${selector}" нет предка [data-radix-popper-content-wrapper]` : `селектор "${selector}" не нашёл элемент`}`,
    );
  }
  if (!result.parentIsBody) {
    throw new Error(
      `containing-block(${label}): обёртка портализована в <${result.parentTag}>, а не в document.body — Floating UI на WebKit не подстроится под смещённый containing block`,
    );
  }
  if (result.offending) {
    throw new Error(
      `containing-block(${label}): между обёрткой и <html> есть <${result.offending.tag} class="${result.offending.className}"> с ${result.offending.reasons.join(', ')} — это containing block для position:fixed`,
    );
  }
}

/** scrollTop элемента. */
export async function getScrollTop(page, selector) {
  return page.$eval(selector, (el) => el.scrollTop);
}

/** Сколько элементов сейчас совпадает с селектором. */
export async function countMatching(page, selector) {
  return page.$$eval(selector, (els) => els.length);
}

/**
 * HTTP-клиент к API «Копирки» из Node (не из браузера) — для сидирования библиотеки
 * и для проверок «действие в интерфейсе долетело до сервера» в духе server/src/smoke.ts.
 * Origin выставляем сами (как это делает Vite-прокси для запросов из браузера) —
 * сервер пускает только свой origin, см. server/src/app.ts::isAllowedOrigin.
 */
export function makeApiClient(baseUrl) {
  const originHeader = { Origin: baseUrl };

  async function api(method, pathname, body) {
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    const headers = { ...originHeader };
    if (!isForm && body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${baseUrl}${pathname}`, {
      method,
      headers,
      body: isForm ? body : body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${method} ${pathname} → ${response.status}: ${text.slice(0, 300)}`);
    }
    return text === '' ? undefined : JSON.parse(text);
  }

  return api;
}
