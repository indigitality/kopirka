/**
 * CAP-08 — оверлей выделения области поверх страницы.
 *
 * Инжектится через chrome.scripting.executeScript обычным (не модульным)
 * скриптом, поэтому импортов здесь нет, а имена сообщений продублированы
 * литералами — оригинал в lib/protocol.js.
 *
 * Устройство:
 * - хост-элемент вешается на documentElement, а не на body: transform на body
 *   ломает position: fixed у потомков, а на documentElement — нет;
 * - разметка живёт в shadow root, поэтому стили страницы до неё не достают;
 * - координаты берём из clientX/clientY — они уже относительно видимой области,
 *   ровно то, что снимает captureVisibleTab, поэтому прокрутка страницы
 *   ни на что не влияет;
 * - перед съёмкой оверлей прячется и ждёт отрисовки кадра, иначе затемнение
 *   попадёт в скриншот.
 */

(() => {
  const FLAG = '__kopirkaAreaSelect';

  // Повторный запуск на той же вкладке: не создаём второй оверлей.
  if (window[FLAG]) {
    window[FLAG].restart();
    return;
  }

  const MIN_SIDE_PX = 5;
  const HINT_TEXT = 'Протащите, чтобы выбрать область · Esc — отмена';

  // Цвета — копия ролей редизайна (app/web/src/styles/tokens.css), захардкожены:
  // инжектится обычным скриптом без ссылки на tokens.css расширения.
  // Акцент — лайм --color-brand #C5FD63 (был мятный #3DDBB0); чип — стекло
  // --color-raised-glass поверх --color-raised, тот же приём, что у плавающей
  // подсказки зоны импорта (DESIGN-SPEC §6).
  const CSS = `
    :host { all: initial; }
    .layer {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      cursor: crosshair;
      font-family: 'Inter Tight', 'Inter Tight Variable', ui-sans-serif, system-ui, -apple-system, sans-serif;
      -webkit-font-smoothing: antialiased;
      user-select: none;
    }
    .dim {
      position: absolute;
      inset: 0;
      background: rgb(0 0 0 / 0.45);
    }
    .sel {
      position: absolute;
      display: none;
      border: 1px solid #c5fd63;
      box-shadow: 0 0 0 100vmax rgb(0 0 0 / 0.45), inset 0 0 0 1px rgb(0 0 0 / 0.35);
      background: rgb(197 253 99 / 0.06);
    }
    .size {
      position: absolute;
      display: none;
      padding: 3px 6px;
      border-radius: 4px;
      background: rgb(28 29 31 / 0.94);
      color: #c5fd63;
      font-variant-numeric: tabular-nums;
      font-size: 11px;
      line-height: 1.2;
      white-space: nowrap;
      pointer-events: none;
    }
    .chip {
      position: absolute;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      max-width: 80vw;
      padding: 8px 14px;
      border-radius: 12px;
      background: #26272ad9;
      -webkit-backdrop-filter: blur(20px);
      backdrop-filter: blur(20px);
      border: 1px solid #33333c;
      color: #f2f2f2;
      font-size: 13px;
      line-height: 1.25;
      box-shadow: 0 16px 40px #0000008c;
      pointer-events: none;
    }
    .chip--error {
      border-color: #f06a6a;
      color: #f06a6a;
    }
  `;

  // Дерево собираем вручную: innerHTML на страницах с Trusted Types
  // требует TrustedHTML, а createElement работает везде.
  const host = document.createElement('div');
  host.setAttribute('data-kopirka-overlay', '');
  const root = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = CSS;

  const div = (className) => {
    const element = document.createElement('div');
    element.className = className;
    return element;
  };

  const layer = div('layer');
  const dim = div('dim');
  const selection = div('sel');
  const sizeLabel = div('size');
  const chip = div('chip');

  layer.append(dim, selection, sizeLabel, chip);
  root.append(style, layer);

  let origin = null;
  let current = null;
  let chipTimer = 0;

  document.documentElement.appendChild(host);
  showChip(HINT_TEXT, false);

  // ── Отрисовка ──────────────────────────────────────────────────────────────

  function rectFrom(a, b) {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return { x, y, width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
  }

  function clampToViewport(x, y) {
    return {
      x: Math.min(Math.max(x, 0), window.innerWidth),
      y: Math.min(Math.max(y, 0), window.innerHeight),
    };
  }

  function drawSelection(rect, pointer) {
    chip.style.display = 'none'; // подсказка не должна мешать выделять
    dim.style.display = 'none';
    selection.style.display = 'block';
    selection.style.left = `${rect.x}px`;
    selection.style.top = `${rect.y}px`;
    selection.style.width = `${rect.width}px`;
    selection.style.height = `${rect.height}px`;

    sizeLabel.style.display = 'block';
    sizeLabel.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;

    // Подпись держим у курсора, но не даём ей уехать за край экрана.
    const offset = 14;
    const box = sizeLabel.getBoundingClientRect();
    const left = Math.min(pointer.x + offset, window.innerWidth - box.width - 4);
    const top =
      pointer.y + offset + box.height > window.innerHeight
        ? pointer.y - offset - box.height
        : pointer.y + offset;
    sizeLabel.style.left = `${Math.max(4, left)}px`;
    sizeLabel.style.top = `${Math.max(4, top)}px`;
  }

  function resetSelection() {
    origin = null;
    current = null;
    chip.style.display = 'block';
    dim.style.display = 'block';
    selection.style.display = 'none';
    sizeLabel.style.display = 'none';
  }

  function showChip(text, isError) {
    clearTimeout(chipTimer);
    chip.textContent = text;
    chip.classList.toggle('chip--error', Boolean(isError));
    chip.style.display = 'block';
    if (isError) {
      chipTimer = setTimeout(() => showChip(HINT_TEXT, false), 2600);
    }
  }

  // ── Жизненный цикл ─────────────────────────────────────────────────────────

  function teardown() {
    clearTimeout(chipTimer);
    window.removeEventListener('keydown', onKeyDown, true);
    layer.removeEventListener('pointerdown', onPointerDown);
    layer.removeEventListener('pointermove', onPointerMove);
    layer.removeEventListener('pointerup', onPointerUp);
    layer.removeEventListener('contextmenu', onContextMenu);
    layer.removeEventListener('wheel', onWheel);
    host.remove();
    delete window[FLAG];
  }

  function cancel() {
    teardown();
    chrome.runtime.sendMessage({ type: 'area-cancelled' }).catch(() => {});
  }

  /** Оверлей прячем и ждём два кадра: снимок должен быть без затемнения. */
  function hideForCapture() {
    host.style.display = 'none';
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
  }

  function restoreAfterFailure(text) {
    host.style.display = '';
    resetSelection();
    showChip(text, true);
  }

  async function submit(rect) {
    await hideForCapture();

    let response;
    try {
      response = await chrome.runtime.sendMessage({
        type: 'area-selected',
        rect,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        devicePixelRatio: window.devicePixelRatio || 1,
        pageUrl: location.href,
      });
    } catch {
      restoreAfterFailure('Расширение недоступно. Перезагрузите страницу.');
      return;
    }

    if (response && response.ok) {
      teardown();
    } else {
      restoreAfterFailure(response?.message || 'Не удалось снять кадр');
    }
  }

  // ── События ────────────────────────────────────────────────────────────────

  function onKeyDown(event) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    cancel();
  }

  function onPointerDown(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    origin = clampToViewport(event.clientX, event.clientY);
    current = origin;
    layer.setPointerCapture(event.pointerId);
    drawSelection(rectFrom(origin, current), current);
  }

  function onPointerMove(event) {
    if (!origin) return;
    event.preventDefault();
    current = clampToViewport(event.clientX, event.clientY);
    drawSelection(rectFrom(origin, current), current);
  }

  function onPointerUp(event) {
    if (!origin) return;
    event.preventDefault();
    const rect = rectFrom(origin, clampToViewport(event.clientX, event.clientY));

    // Одиночный клик без протаскивания — не выделение, ждём дальше.
    if (rect.width < MIN_SIDE_PX || rect.height < MIN_SIDE_PX) {
      resetSelection();
      return;
    }

    origin = null;
    void submit(rect);
  }

  function onContextMenu(event) {
    event.preventDefault();
    cancel();
  }

  /** Прокрутка во время выделения сдвинула бы содержимое под уже выбранной рамкой. */
  function onWheel(event) {
    event.preventDefault();
  }

  window.addEventListener('keydown', onKeyDown, true);
  layer.addEventListener('pointerdown', onPointerDown);
  layer.addEventListener('pointermove', onPointerMove);
  layer.addEventListener('pointerup', onPointerUp);
  layer.addEventListener('contextmenu', onContextMenu);
  layer.addEventListener('wheel', onWheel, { passive: false });

  window[FLAG] = {
    restart() {
      host.style.display = '';
      resetSelection();
      showChip(HINT_TEXT, false);
    },
  };

  resetSelection();
})();
