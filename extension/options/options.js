/**
 * Настройки расширения: адрес сервера с автосохранением и проверкой связи.
 * Больше на этой странице ничего нет — документ 06 §3.1.
 */

import { getServerUrl, setServerUrl, normalizeServerUrl, DEFAULT_SERVER_URL } from '../lib/config.js';
import { checkHealth } from '../lib/api.js';

const SAVE_DEBOUNCE_MS = 400;

const input = document.getElementById('server-url');
const checkButton = document.getElementById('check');
const status = document.getElementById('status');

let saveTimer = 0;

/**
 * @param {string} text
 * @param {'ok' | 'error' | 'muted'} tone
 */
function setStatus(text, tone = 'muted') {
  status.textContent = text;
  status.classList.toggle('options__status--ok', tone === 'ok');
  status.classList.toggle('options__status--error', tone === 'error');
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, SAVE_DEBOUNCE_MS);
}

async function save() {
  const normalized = normalizeServerUrl(input.value);
  if (!normalized.ok) {
    setStatus(normalized.message, 'error');
    return;
  }

  await setServerUrl(normalized.url);
  setStatus('Сохранено', 'muted');
}

async function check() {
  const normalized = normalizeServerUrl(input.value);
  if (!normalized.ok) {
    setStatus(normalized.message, 'error');
    return;
  }

  // Проверяем ровно тот адрес, что в поле, и заодно фиксируем его.
  await setServerUrl(normalized.url);
  input.value = normalized.url;

  checkButton.disabled = true;
  setStatus('Проверяем…', 'muted');

  try {
    await checkHealth(normalized.url);
    setStatus('Копирка отвечает', 'ok');
  } catch {
    setStatus(
      isLoopback(normalized.url)
        ? 'Копирка не отвечает — приложение не запущено или порт другой'
        : 'Расширению разрешены только 127.0.0.1 и localhost',
      'error',
    );
  } finally {
    checkButton.disabled = false;
  }
}

/** host_permissions в манифесте ограничены петлевым адресом — снаружи расширение не ходит. */
function isLoopback(url) {
  const host = new URL(url).hostname;
  return host === '127.0.0.1' || host === 'localhost' || host === '[::1]' || host === '::1';
}

input.addEventListener('input', scheduleSave);
input.addEventListener('blur', () => {
  clearTimeout(saveTimer);
  void save();
});
input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') void check();
});
checkButton.addEventListener('click', () => void check());

(async function start() {
  const current = await getServerUrl();
  input.value = current;
  input.placeholder = DEFAULT_SERVER_URL;
})();
