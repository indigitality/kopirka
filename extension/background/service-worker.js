/**
 * Service worker расширения: контекстное меню (CAP-01), захват кадров
 * (CAP-02, CAP-08) и уведомления. Модуль — чтобы переиспользовать lib/.
 */

import { getServerUrl } from '../lib/config.js';
import { importUrl } from '../lib/api.js';
import { TEXT, describeImport, describeFailure } from '../lib/messages.js';
import { ensureTabAccess, buildCaptureFilename } from '../lib/tabs.js';
import { cropDataUrl, measureDataUrl, MIN_AREA_SIDE_CSS_PX } from '../lib/capture.js';
import { setPendingCapture } from '../lib/pending.js';
import { MSG } from '../lib/protocol.js';

const MENU_ID = 'kopirka-save-image';
const AREA_SELECT_SCRIPT = 'content/area-select.js';
const NOTIFICATION_ICON = 'icons/icon128.png';

// ─────────────────────────────────────────────────────────────────────────────
// CAP-01 — контекстное меню на изображении
// ─────────────────────────────────────────────────────────────────────────────

function installContextMenu() {
  // removeAll перед созданием: пункт переживает перезапуск браузера,
  // повторный create с тем же id иначе падает.
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Сохранить в Копирку',
      contexts: ['image'],
    });
  });
}

chrome.runtime.onInstalled.addListener(installContextMenu);
chrome.runtime.onStartup.addListener(installContextMenu);

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== MENU_ID) return;
  void saveImageFromPage(info);
});

/**
 * @param {chrome.contextMenus.OnClickData} info
 */
async function saveImageFromPage(info) {
  const imageUrl = info.srcUrl;

  if (!imageUrl) {
    notify(TEXT.saveErrorTitle, 'У картинки нет адреса');
    return;
  }

  // blob: живёт только внутри страницы — сервер по такому адресу не достучится.
  if (imageUrl.startsWith('blob:')) {
    notify(TEXT.saveErrorTitle, 'Эта картинка доступна только внутри страницы. Снимите её областью.');
    return;
  }

  try {
    const serverUrl = await getServerUrl();
    const response = await importUrl(serverUrl, { imageUrl, pageUrl: info.pageUrl });
    const result = describeImport(response);
    // Успех и дубль расширение больше не объявляет: приложение «Копирка» само
    // показывает системное уведомление по ленте событий сервера (с этой сборки —
    // и про добавленный файл, и про дубль), и два уведомления об одном действии
    // задваивались. Уведомляем только о том, о чём приложению неоткуда узнать —
    // файл, который так и не сохранился.
    if (!result.ok) {
      notify(TEXT.saveErrorTitle, result.message);
    }
  } catch (error) {
    const failure = describeFailure(error);
    if (failure.unreachable) {
      notify(TEXT.serverDownTitle, TEXT.serverDownHint);
    } else {
      notify(TEXT.saveErrorTitle, failure.message);
    }
  }
}

/**
 * @param {string} title
 * @param {string} message
 */
function notify(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL(NOTIFICATION_ICON),
    title,
    message,
    silent: true,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CAP-02 — скриншот видимой области
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {{ tabId?: number }} message
 * @returns {Promise<{ ok: true, capture: import('../lib/pending.js').PendingCapture } | { ok: false, message: string }>}
 */
async function captureVisibleArea(message) {
  const tab = await resolveTab(message.tabId);
  if (!tab) return { ok: false, message: 'Не удалось определить текущую вкладку' };

  const access = await ensureTabAccess(tab.url);
  if (!access.allowed) return { ok: false, message: access.reason };

  let dataUrl;
  try {
    dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  } catch {
    return { ok: false, message: 'Chrome не дал снять эту страницу. Обновите вкладку и попробуйте снова.' };
  }

  const size = await measureDataUrl(dataUrl);
  const capture = await setPendingCapture({
    dataUrl,
    pageUrl: tab.url,
    suggestedFilename: buildCaptureFilename(tab.url, 'screen'),
    sourceType: 'tab_screenshot',
    width: size.width,
    height: size.height,
  });

  return { ok: true, capture };
}

// ─────────────────────────────────────────────────────────────────────────────
// CAP-08 — скриншот выбранной области
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {{ tabId?: number }} message
 * @returns {Promise<{ ok: true } | { ok: false, message: string }>}
 */
async function startAreaSelect(message) {
  const tab = await resolveTab(message.tabId);
  if (!tab?.id) return { ok: false, message: 'Не удалось определить текущую вкладку' };

  const access = await ensureTabAccess(tab.url);
  if (!access.allowed) return { ok: false, message: access.reason };

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: [AREA_SELECT_SCRIPT],
    });
    return { ok: true };
  } catch {
    return {
      ok: false,
      message: 'Не удалось включить выделение на этой странице. Обновите вкладку и попробуйте снова.',
    };
  }
}

/**
 * Область выбрана: оверлей уже спрятан, можно снимать и резать.
 *
 * @param {{ rect: {x:number,y:number,width:number,height:number}, viewport: {width:number,height:number}, devicePixelRatio: number, pageUrl?: string }} message
 * @param {chrome.runtime.MessageSender} sender
 */
async function handleAreaSelected(message, sender) {
  const tab = sender.tab;
  if (!tab?.id) return { ok: false, message: 'Не удалось определить вкладку' };

  const { rect } = message;
  if (rect.width < MIN_AREA_SIDE_CSS_PX || rect.height < MIN_AREA_SIDE_CSS_PX) {
    return { ok: false, message: 'Область слишком мала' };
  }

  let fullDataUrl;
  try {
    fullDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  } catch {
    return { ok: false, message: 'Chrome не дал снять эту страницу' };
  }

  let cropped;
  try {
    cropped = await cropDataUrl(fullDataUrl, rect, message.viewport, message.devicePixelRatio);
  } catch {
    return { ok: false, message: 'Не удалось вырезать кадр' };
  }

  const pageUrl = message.pageUrl || tab.url;
  await setPendingCapture({
    dataUrl: cropped.dataUrl,
    pageUrl,
    suggestedFilename: buildCaptureFilename(pageUrl, 'area'),
    sourceType: 'area_screenshot',
    width: cropped.width,
    height: cropped.height,
  });

  await showCaptureInPopup();
  return { ok: true };
}

/**
 * Popup был закрыт на время выделения — открываем его обратно с предпросмотром.
 * openPopup() есть не во всех версиях Chrome и требует, чтобы окно было
 * активным: если не вышло — ставим значок на иконке и подсказываем словами.
 */
async function showCaptureInPopup() {
  if (typeof chrome.action.openPopup === 'function') {
    try {
      await chrome.action.openPopup();
      return;
    } catch {
      // окно не активно или версия Chrome старше 127 — уходим в запасной путь
    }
  }

  // Лайм редизайна светлый — по умолчанию Chrome пишет бейдж белым, поэтому
  // текст задан явно тёмным (--color-brand-ink), иначе цифра не читается.
  await chrome.action.setBadgeBackgroundColor({ color: '#c5fd63' });
  await chrome.action.setBadgeTextColor({ color: '#17210a' });
  await chrome.action.setBadgeText({ text: '1' });
  notify(TEXT.notificationTitle, 'Кадр снят. Откройте «Копирку» на панели, чтобы сохранить.');
}

// ─────────────────────────────────────────────────────────────────────────────
// Маршрутизация сообщений
// ─────────────────────────────────────────────────────────────────────────────

const ROUTES = {
  [MSG.CAPTURE_VISIBLE]: captureVisibleArea,
  [MSG.START_AREA_SELECT]: startAreaSelect,
  [MSG.AREA_SELECTED]: handleAreaSelected,
  [MSG.AREA_CANCELLED]: async () => ({ ok: true }),
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = ROUTES[message?.type];
  if (!handler) return false;

  handler(message, sender)
    .then(sendResponse)
    .catch(() => sendResponse({ ok: false, message: 'Внутренняя ошибка расширения' }));

  return true; // ответ придёт асинхронно
});

/**
 * @param {number | undefined} tabId
 * @returns {Promise<chrome.tabs.Tab | null>}
 */
async function resolveTab(tabId) {
  try {
    if (typeof tabId === 'number') return await chrome.tabs.get(tabId);
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    return active ?? null;
  } catch {
    return null;
  }
}
