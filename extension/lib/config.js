/**
 * Адрес локального сервера «Копирки» и папка, в которую расширение кладёт файлы.
 *
 * Адрес живёт в chrome.storage.sync (меняется на странице настроек расширения),
 * папка — в chrome.storage.local: идентификатор папки имеет смысл только рядом
 * с конкретной библиотекой на этой машине, и синхронизировать его между
 * профилями Chrome было бы прямо вредно.
 *
 * DEFAULT_PORT продублирован из app/shared/api.ts (контракт) — расширение
 * не может импортировать TS-модуль, поэтому значение держим синхронно вручную.
 */

/** @see app/shared/api.ts — DEFAULT_PORT */
export const DEFAULT_PORT = 43117;
export const DEFAULT_SERVER_URL = `http://127.0.0.1:${DEFAULT_PORT}`;

const STORAGE_KEY = 'serverUrl';
/** FDB-03 — «Сохранять в»: id папки или null («Не разобрано»). */
const FOLDER_KEY = 'targetFolderId';

/**
 * Приводит введённый пользователем адрес к виду `http://host:port`.
 * @param {string} raw
 * @returns {{ ok: true, url: string } | { ok: false, message: string }}
 */
export function normalizeServerUrl(raw) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return { ok: false, message: 'Укажите адрес сервера' };

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;

  let parsed;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { ok: false, message: 'Это не похоже на адрес' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, message: 'Поддерживаются только http и https' };
  }

  // Путь и параметры отбрасываем: к адресу всегда дописывается /api/...
  return { ok: true, url: `${parsed.protocol}//${parsed.host}` };
}

/** @returns {Promise<string>} */
export async function getServerUrl() {
  try {
    const stored = await chrome.storage.sync.get(STORAGE_KEY);
    const value = stored?.[STORAGE_KEY];
    if (typeof value === 'string') {
      const normalized = normalizeServerUrl(value);
      if (normalized.ok) return normalized.url;
    }
  } catch {
    // storage.sync недоступен (профиль без синхронизации) — работаем на умолчании
  }
  return DEFAULT_SERVER_URL;
}

/**
 * @param {string} url уже нормализованный адрес
 * @returns {Promise<void>}
 */
export async function setServerUrl(url) {
  await chrome.storage.sync.set({ [STORAGE_KEY]: url });
}

/** Порт из адреса сервера — для строки статуса в popup. */
export function serverPort(url) {
  try {
    const parsed = new URL(url);
    if (parsed.port) return Number(parsed.port);
    return parsed.protocol === 'https:' ? 443 : 80;
  } catch {
    return DEFAULT_PORT;
  }
}

/**
 * FDB-03 — выбранная папка. `null` — «Не разобрано».
 * @returns {Promise<number | null>}
 */
export async function getTargetFolderId() {
  try {
    const stored = await chrome.storage.local.get(FOLDER_KEY);
    const value = stored?.[FOLDER_KEY];
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  } catch {
    // storage недоступен — кладём в «Не разобрано», это безопасное умолчание
  }
  return null;
}

/**
 * @param {number | null} folderId
 * @returns {Promise<void>}
 */
export async function setTargetFolderId(folderId) {
  const value = typeof folderId === 'number' && Number.isInteger(folderId) && folderId > 0 ? folderId : null;
  try {
    await chrome.storage.local.set({ [FOLDER_KEY]: value });
  } catch {
    // не сохранилось — выбор проживёт до закрытия popup, ронять из-за этого нечего
  }
}
