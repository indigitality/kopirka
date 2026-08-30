/**
 * Адрес локального сервера «Копирки». Хранится в chrome.storage.sync,
 * меняется на странице настроек расширения.
 *
 * DEFAULT_PORT продублирован из app/shared/api.ts (контракт) — расширение
 * не может импортировать TS-модуль, поэтому значение держим синхронно вручную.
 */

/** @see app/shared/api.ts — DEFAULT_PORT */
export const DEFAULT_PORT = 43117;
export const DEFAULT_SERVER_URL = `http://127.0.0.1:${DEFAULT_PORT}`;

const STORAGE_KEY = 'serverUrl';

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
