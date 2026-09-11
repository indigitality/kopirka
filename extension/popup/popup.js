/**
 * Popup: двухшаговый флоу «снять → предпросмотр → сохранить».
 * Состояния и переходы — документ 06 §3.1, здесь они заданы таблицей,
 * а не разбросаны по условиям.
 */

import { getServerUrl, getTargetFolderId, serverPort, setTargetFolderId } from '../lib/config.js';
import { checkHealth, flattenFolders, importCapture, listFolders } from '../lib/api.js';
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

/** FDB-03 — поле фильтра появляется, когда список перестаёт читаться глазом. */
const FILTER_FROM_FOLDERS = 8;

/** Псевдопапка «Не разобрано»: первая строка списка, folderId === null. */
const UNSORTED = { id: null, name: 'Не разобрано', depth: 0 };

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
  statusPort: document.getElementById('status-port'),
  folderTrigger: document.getElementById('folder-trigger'),
  folderName: document.getElementById('folder-name'),
  folderIcon: document.getElementById('folder-icon'),
  folderList: document.getElementById('folder-list'),
  folderOptions: document.getElementById('folder-options'),
  folderFilterRow: document.getElementById('folder-filter-row'),
  folderFilter: document.getElementById('folder-filter'),
};

const context = {
  state: State.CHECKING,
  /** @type {import('../lib/pending.js').PendingCapture | null} */
  capture: null,
  serverUrl: '',
  message: '',
  /** FDB-03 — плоский список папок с уровнями вложенности. */
  /** @type {Array<{id:number,name:string,depth:number}>} */
  folders: [],
  /** @type {number | null} */
  folderId: null,
  folderOpen: false,
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

  if (view === 'idle') {
    dom.statusPort.textContent = `· порт ${serverPort(context.serverUrl)}`;
    dom.folderName.textContent = currentFolderName();
    // Иконка поля повторяет иконку выбранной строки: лоток или папка.
    const icon = folderIcon(context.folderId === null);
    icon.removeAttribute('class');
    dom.folderIcon.replaceChildren(icon);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FDB-03 — «Сохранять в»
// ─────────────────────────────────────────────────────────────────────────────

/** Имя выбранной папки. Папку могли удалить — тогда честно «Не разобрано». */
function currentFolderName() {
  if (context.folderId === null) return UNSORTED.name;
  const folder = context.folders.find((item) => item.id === context.folderId);
  return folder ? folder.name : UNSORTED.name;
}

/** Иконка строки: «Не разобрано» — лоток, папка — папка. */
function folderIcon(isUnsorted) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'picker__icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.25');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const paths = isUnsorted
    ? [
        'M22 12h-6l-2 3h-4l-2-3H2',
        'M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
      ]
    : ['M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z'];
  for (const d of paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

/** Лаймовая галка выбранной строки. */
function checkIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'picker__check');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.57');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M20 6 9 17l-5-5');
  svg.append(path);
  return svg;
}

/**
 * @param {{ id: number | null, name: string, depth: number }} folder
 * @returns {HTMLButtonElement}
 */
function folderRow(folder) {
  const selected = context.folderId === folder.id;
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'picker__option';
  row.setAttribute('role', 'option');
  row.setAttribute('aria-selected', String(selected));
  // Вложенность показываем отступом слева, а не значком: так же, как в сайдбаре.
  row.style.paddingLeft = `${10 + folder.depth * 12}px`;

  const name = document.createElement('span');
  name.className = 'picker__name';
  name.textContent = folder.name;

  row.append(folderIcon(folder.id === null), name);
  if (selected) row.append(checkIcon());
  row.addEventListener('click', () => void chooseFolder(folder.id));
  return row;
}

/** Перерисовать список по текущему фильтру. */
function renderFolderOptions() {
  const query = dom.folderFilter.value.trim().toLowerCase();
  const matches = query
    ? context.folders.filter((folder) => folder.name.toLowerCase().includes(query))
    : context.folders;

  dom.folderOptions.replaceChildren();
  // «Не разобрано» всегда первым и всегда видно: это не папка, а срез библиотеки.
  dom.folderOptions.append(folderRow(UNSORTED));
  if (matches.length > 0) {
    const separator = document.createElement('div');
    separator.className = 'picker__separator';
    dom.folderOptions.append(separator);
    for (const folder of matches) dom.folderOptions.append(folderRow(folder));
  } else if (query) {
    const empty = document.createElement('p');
    empty.className = 'picker__empty';
    empty.textContent = 'Папок с таким именем нет';
    dom.folderOptions.append(empty);
  }
}

function openFolderList() {
  context.folderOpen = true;
  dom.folderFilter.value = '';
  const filtered = context.folders.length > FILTER_FROM_FOLDERS;
  dom.folderFilterRow.hidden = !filtered;
  dom.folderList.hidden = false;
  dom.folderTrigger.setAttribute('aria-expanded', 'true');
  renderFolderOptions();
  if (filtered) dom.folderFilter.focus();
}

function closeFolderList() {
  context.folderOpen = false;
  dom.folderList.hidden = true;
  dom.folderTrigger.setAttribute('aria-expanded', 'false');
}

/** @param {number | null} folderId */
async function chooseFolder(folderId) {
  context.folderId = folderId;
  closeFolderList();
  render();
  await setTargetFolderId(folderId);
}

/**
 * Папки нужны и popup, и подменю контекстного меню — поэтому заодно просим
 * service worker пересобрать своё дерево: он всё равно не знает, когда человек
 * завёл новую папку в приложении.
 */
async function loadFolders() {
  context.folderId = await getTargetFolderId();
  try {
    context.folders = flattenFolders(await listFolders(context.serverUrl));
  } catch {
    // Сервер не ответил — список останется пустым, «Не разобрано» никуда не денется.
    context.folders = [];
  }
  void sendToWorker({ type: MSG.REFRESH_MENU });
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

  await loadFolders();
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
      // FDB-03 — та же папка, что выбрана в блоке «Сохранять в».
      folderId: context.folderId,
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

dom.folderTrigger.addEventListener('click', () => {
  if (context.folderOpen) closeFolderList();
  else openFolderList();
});
dom.folderFilter.addEventListener('input', renderFolderOptions);

// Esc закрывает сначала список, потом сам popup — как слои в приложении.
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && context.folderOpen) {
    event.preventDefault();
    closeFolderList();
    dom.folderTrigger.focus();
  }
});

// Клик мимо списка его закрывает; клик по самому полю обрабатывает триггер.
document.addEventListener('pointerdown', (event) => {
  if (!context.folderOpen) return;
  const target = /** @type {Node} */ (event.target);
  if (dom.folderList.contains(target) || dom.folderTrigger.contains(target)) return;
  closeFolderList();
});

(async function start() {
  // Значок на иконке ставится, когда кадр снят, а popup открыть не удалось.
  chrome.action.setBadgeText({ text: '' }).catch(() => {});

  context.capture = await getPendingCapture();
  render();
  await checkServer();
})();
