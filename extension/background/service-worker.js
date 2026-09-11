/**
 * Service worker расширения: контекстное меню (CAP-01), захват кадров
 * (CAP-02, CAP-08) и уведомления. Модуль — чтобы переиспользовать lib/.
 */

import { getServerUrl, getTargetFolderId } from '../lib/config.js';
import { flattenFolders, importUrl, listFolders } from '../lib/api.js';
import { TEXT, describeImport, describeFailure } from '../lib/messages.js';
import { ensureTabAccess, buildCaptureFilename } from '../lib/tabs.js';
import { cropDataUrl, measureDataUrl, MIN_AREA_SIDE_CSS_PX } from '../lib/capture.js';
import { setPendingCapture } from '../lib/pending.js';
import { MSG } from '../lib/protocol.js';

const MENU_ID = 'kopirka-save-image';
/** FDB-03 — пункт подменю «Не разобрано». Папки идут как `folder:<id>`. */
const MENU_UNSORTED_ID = 'kopirka-folder-none';
const MENU_FOLDER_PREFIX = 'folder:';
const AREA_SELECT_SCRIPT = 'content/area-select.js';
const NOTIFICATION_ICON = 'icons/icon128.png';

/**
 * Как часто пересобираем подменю папок при живом сервере. Минуты хватает: папки
 * заводят руками, а не пачками, и каждый лишний запрос будит service worker.
 */
const MENU_REFRESH_MS = 60_000;
const MENU_ALARM = 'kopirka-menu-refresh';

/** Отступ уровня в подменю Chrome: вложенность там рисовать нечем, кроме текста. */
const MENU_INDENT = '\u2007\u2007'; // figure space — не схлопывается и шириной с цифру

// ─────────────────────────────────────────────────────────────────────────────
// CAP-01 — контекстное меню на изображении
// ─────────────────────────────────────────────────────────────────────────────

/**
 * FDB-03, вариант 2 (решение Сергея 11.09): родительский пункт «Сохранить в
 * Копирку» и подменю с «Не разобрано» и деревом папок. Клик по самому
 * родительскому пункту кладёт в папку, выбранную в popup, — так привычный
 * однокликовый сценарий не подорожал.
 *
 * Дерево перестраивается целиком (`removeAll` + `create`): пункт переживает
 * перезапуск браузера, и повторный `create` с тем же id иначе падает, а
 * выборочная синхронизация ради десятка пунктов не стоит своей сложности.
 *
 * @param {Array<{id:number,name:string,depth:number}>} folders
 */
function installContextMenu(folders = []) {
  return new Promise((resolve) => {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: MENU_ID,
        title: 'Сохранить в Копирку',
        contexts: ['image'],
      });
      chrome.contextMenus.create({
        id: MENU_UNSORTED_ID,
        parentId: MENU_ID,
        title: 'Не разобрано',
        contexts: ['image'],
      });
      if (folders.length > 0) {
        chrome.contextMenus.create({
          id: 'kopirka-folder-separator',
          parentId: MENU_ID,
          type: 'separator',
          contexts: ['image'],
        });
      }
      for (const folder of folders) {
        chrome.contextMenus.create({
          id: `${MENU_FOLDER_PREFIX}${folder.id}`,
          parentId: MENU_ID,
          title: `${MENU_INDENT.repeat(folder.depth)}${folder.name}`,
          contexts: ['image'],
        });
      }
      // lastError читаем, иначе Chrome напишет о нём в консоль расширения сам.
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

/**
 * Сходить за папками и пересобрать подменю. Сервер не отвечает — оставляем
 * подменю с одним «Не разобрано»: пункт должен работать и без приложения,
 * человек увидит осмысленное «Копирка не запущена», а не пустое меню.
 */
async function refreshContextMenu() {
  let folders = [];
  try {
    const serverUrl = await getServerUrl();
    folders = flattenFolders(await listFolders(serverUrl));
  } catch {
    folders = [];
  }
  await installContextMenu(folders);
  return folders.length;
}

/*
  Будильник, а не setInterval: service worker MV3 засыпает, и интервал умрёт
  вместе с ним, а будильник сон переживает и сам поднимает воркер. Заводим его
  только на установке и на старте браузера: `create` с тем же именем на каждом
  пробуждении обнулял бы отсчёт, и минута никогда бы не истекла.
*/
function scheduleMenuRefresh() {
  chrome.alarms.create(MENU_ALARM, { periodInMinutes: MENU_REFRESH_MS / 60_000 });
}

chrome.runtime.onInstalled.addListener(() => {
  scheduleMenuRefresh();
  void refreshContextMenu();
});
chrome.runtime.onStartup.addListener(() => {
  scheduleMenuRefresh();
  void refreshContextMenu();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === MENU_ALARM) void refreshContextMenu();
});

chrome.contextMenus.onClicked.addListener((info) => {
  const id = String(info.menuItemId);
  if (id === MENU_ID) {
    /*
      Запасной путь. Пункт с подменю Chrome сам по себе не нажимается — он только
      раскрывается, — но если подменю по какой-то причине не собралось, клик по
      родителю придёт сюда, и файл уйдёт в папку из popup, как раньше.
    */
    void saveImageFromPage(info, undefined);
    return;
  }
  if (id === MENU_UNSORTED_ID) {
    void saveImageFromPage(info, null);
    return;
  }
  if (id.startsWith(MENU_FOLDER_PREFIX)) {
    void saveImageFromPage(info, Number(id.slice(MENU_FOLDER_PREFIX.length)));
  }
});

/**
 * @param {chrome.contextMenus.OnClickData} info
 * @param {number | null | undefined} folderId `undefined` — взять папку из popup,
 *   `null` — «Не разобрано», число — конкретная папка из подменю.
 */
async function saveImageFromPage(info, folderId) {
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
    const target = folderId === undefined ? await getTargetFolderId() : folderId;
    const response = await importUrl(serverUrl, {
      imageUrl,
      pageUrl: info.pageUrl,
      folderId: target,
    });
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
  // FDB-03 — popup открылся: он уже сходил за папками, повод обновить и подменю.
  [MSG.REFRESH_MENU]: async () => ({ ok: true, folders: await refreshContextMenu() }),
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
