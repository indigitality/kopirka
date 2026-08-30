/**
 * Popup: двухшаговый флоу «снять → предпросмотр → сохранить».
 * Состояния и переходы — документ 06 §3.1, здесь они заданы таблицей,
 * а не разбросаны по условиям.
 */

import { getServerUrl } from '../lib/config.js';
import { checkHealth, importCapture } from '../lib/api.js';
import { describeImport, describeFailure } from '../lib/messages.js';
import { getPendingCapture, clearPendingCapture } from '../lib/pending.js';
import { MSG } from '../lib/protocol.js';

/** Состояния по документу 06 §3.1 плюс техническое `checking` — проверка связи при открытии. */
const State = {
  CHECKING: 'checking',
  IDLE: 'idle',
  SELECTING: 'selecting',
  PREVIEW: 'preview',
  SENDING: 'sending',
  SUCCESS: 'success',
  SERVER_DOWN: 'server_down',
  SAVE_ERROR: 'save_error',
};

/** Разрешённые переходы. Всё, чего здесь нет, — ошибка в логике. */
const TRANSITIONS = {
  [State.CHECKING]: [State.IDLE, State.PREVIEW, State.SERVER_DOWN],
  [State.IDLE]: [State.SELECTING, State.PREVIEW, State.CHECKING, State.SAVE_ERROR, State.SERVER_DOWN],
  [State.SELECTING]: [State.IDLE, State.SAVE_ERROR],
  [State.PREVIEW]: [State.SENDING, State.IDLE, State.SERVER_DOWN, State.SAVE_ERROR],
  [State.SENDING]: [State.SUCCESS, State.SAVE_ERROR, State.SERVER_DOWN],
  [State.SUCCESS]: [],
  [State.SERVER_DOWN]: [State.CHECKING, State.IDLE, State.PREVIEW, State.SENDING],
  [State.SAVE_ERROR]: [State.CHECKING, State.IDLE, State.PREVIEW, State.SENDING, State.SERVER_DOWN],
};

/** Какую секцию показывать. Отправка рисуется поверх предпросмотра. */
const VIEW_OF_STATE = {
  [State.CHECKING]: 'checking',
  [State.IDLE]: 'idle',
  [State.SELECTING]: 'selecting',
  [State.PREVIEW]: 'preview',
  [State.SENDING]: 'preview',
  [State.SUCCESS]: 'success',
  [State.SERVER_DOWN]: 'server_down',
  [State.SAVE_ERROR]: 'save_error',
};

const SUCCESS_CLOSE_DELAY_MS = 1200;

const dom = {
  sections: Array.from(document.querySelectorAll('[data-view]')),
  previewImage: document.getElementById('preview-image'),
  previewBusy: document.getElementById('preview-busy'),
  previewCaption: document.getElementById('preview-caption'),
  successText: document.getElementById('success-text'),
  serverAddress: document.getElementById('server-address'),
  errorText: document.getElementById('error-text'),
  save: document.getElementById('save'),
  retake: document.getElementById('retake'),
  captureVisible: document.getElementById('capture-visible'),
  captureArea: document.getElementById('capture-area'),
  retryHealth: document.getElementById('retry-health'),
  retrySave: document.getElementById('retry-save'),
  errorRetake: document.getElementById('error-retake'),
  openOptions: document.getElementById('open-options'),
  openOptions2: document.getElementById('open-options-2'),
};

const context = {
  state: State.CHECKING,
  /** @type {import('../lib/pending.js').PendingCapture | null} */
  capture: null,
  serverUrl: '',
  message: '',
};

// ─────────────────────────────────────────────────────────────────────────────
// Машина состояний
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {string} next
 * @param {{ message?: string }} [patch]
 * @returns {boolean} выполнен ли переход
 */
function setState(next, patch = {}) {
  if (next !== context.state && !TRANSITIONS[context.state].includes(next)) {
    console.warn(`Копирка: переход ${context.state} → ${next} не разрешён`);
    return false;
  }
  context.state = next;
  context.message = patch.message ?? '';
  render();
  return true;
}

function render() {
  const view = VIEW_OF_STATE[context.state];
  for (const section of dom.sections) {
    section.hidden = section.dataset.view !== view;
  }

  const sending = context.state === State.SENDING;
  dom.previewBusy.hidden = !sending;
  dom.save.disabled = sending;
  dom.retake.disabled = sending;

  if (view === 'preview' && context.capture) {
    dom.previewImage.src = context.capture.dataUrl;
    dom.previewCaption.textContent =
      `${context.capture.width} × ${context.capture.height} · ` +
      (context.capture.sourceType === 'area_screenshot' ? 'выбранная область' : 'видимая область');
  }

  if (context.state === State.SUCCESS) {
    dom.successText.textContent = context.message;
  }

  if (context.state === State.SAVE_ERROR) {
    dom.errorText.textContent = context.message;
    dom.retrySave.textContent = context.capture ? 'Повторить' : 'Проверить снова';
    dom.errorRetake.hidden = !context.capture;
  }

  if (context.state === State.SERVER_DOWN) {
    dom.serverAddress.textContent = context.serverUrl;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Действия
// ─────────────────────────────────────────────────────────────────────────────

/** Проверка связи и выбор стартового состояния. */
async function checkServer() {
  setState(State.CHECKING);
  context.serverUrl = await getServerUrl();

  try {
    await checkHealth(context.serverUrl);
  } catch {
    setState(State.SERVER_DOWN);
    return;
  }

  setState(context.capture ? State.PREVIEW : State.IDLE);
}

/** CAP-02 — скриншот видимой области. */
async function captureVisible() {
  setBusy(true);
  const response = await sendToWorker({ type: MSG.CAPTURE_VISIBLE });
  setBusy(false);

  if (!response?.ok) {
    setState(State.SAVE_ERROR, { message: response?.message ?? 'Не удалось снять кадр' });
    return;
  }

  context.capture = response.capture;
  setState(State.PREVIEW);
}

/** CAP-08 — выделение области: popup закрывается, оверлей живёт на странице. */
async function captureArea() {
  setState(State.SELECTING);
  const response = await sendToWorker({ type: MSG.START_AREA_SELECT });

  if (!response?.ok) {
    setState(State.SAVE_ERROR, { message: response?.message ?? 'Не удалось включить выделение' });
    return;
  }

  window.close();
}

/** Отправка кадра на сервер. */
async function saveCapture() {
  if (!context.capture) {
    setState(State.SAVE_ERROR, { message: 'Кадр потерян — снимите заново' });
    return;
  }
  if (!setState(State.SENDING)) return;

  try {
    const response = await importCapture(context.serverUrl, {
      dataUrl: context.capture.dataUrl,
      pageUrl: context.capture.pageUrl,
      suggestedFilename: context.capture.suggestedFilename,
      sourceType: context.capture.sourceType,
    });

    const result = describeImport(response);
    if (!result.ok) {
      setState(State.SAVE_ERROR, { message: result.message });
      return;
    }

    context.capture = null;
    await clearPendingCapture();
    setState(State.SUCCESS, { message: result.message });
    setTimeout(() => window.close(), SUCCESS_CLOSE_DELAY_MS);
  } catch (error) {
    const failure = describeFailure(error);
    if (failure.unreachable) {
      setState(State.SERVER_DOWN);
    } else {
      setState(State.SAVE_ERROR, { message: failure.message });
    }
  }
}

async function retake() {
  context.capture = null;
  await clearPendingCapture();
  setState(State.IDLE);
}

/** Повтор из состояния «ошибка сохранения»: есть кадр — шлём его, нет — проверяем связь. */
async function retryAfterError() {
  if (context.capture) {
    await saveCapture();
  } else {
    await checkServer();
  }
}

/** Повтор из «сервер недоступен»: перепроверяем и возвращаемся туда, где были. */
async function retryHealth() {
  await checkServer();
}

// ─────────────────────────────────────────────────────────────────────────────
// Служебное
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {{ type: string }} message
 * @returns {Promise<any>}
 */
async function sendToWorker(message) {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch {
    return { ok: false, message: 'Расширение не отвечает. Перезагрузите его на chrome://extensions.' };
  }
}

/** @param {boolean} busy */
function setBusy(busy) {
  dom.captureVisible.disabled = busy;
  dom.captureArea.disabled = busy;
}

function openOptions() {
  chrome.runtime.openOptionsPage();
  window.close();
}

// ─────────────────────────────────────────────────────────────────────────────
// Запуск
// ─────────────────────────────────────────────────────────────────────────────

dom.captureVisible.addEventListener('click', () => void captureVisible());
dom.captureArea.addEventListener('click', () => void captureArea());
dom.save.addEventListener('click', () => void saveCapture());
dom.retake.addEventListener('click', () => void retake());
dom.retryHealth.addEventListener('click', () => void retryHealth());
dom.retrySave.addEventListener('click', () => void retryAfterError());
dom.errorRetake.addEventListener('click', () => void retake());
dom.openOptions.addEventListener('click', openOptions);
dom.openOptions2.addEventListener('click', openOptions);

(async function start() {
  // Значок на иконке ставится, когда кадр снят, а popup открыть не удалось.
  chrome.action.setBadgeText({ text: '' }).catch(() => {});

  context.capture = await getPendingCapture();
  render();
  await checkServer();
})();
