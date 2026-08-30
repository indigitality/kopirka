/**
 * Работа с вкладкой: где расширению запрещено работать и как назвать кадр.
 */

/**
 * Схемы и хосты, на которых Chrome запрещает и инжект скриптов,
 * и захват содержимого. Проверяем заранее, чтобы вместо молчаливого сбоя
 * показать понятный текст.
 */
const BLOCKED_SCHEMES = [
  'chrome:',
  'chrome-untrusted:',
  'devtools:',
  'edge:',
  'about:',
  'view-source:',
  'chrome-extension:',
  'moz-extension:',
];

const BLOCKED_HOSTS = ['chrome.google.com', 'chromewebstore.google.com'];

/**
 * @param {string | undefined} url
 * @returns {Promise<{ allowed: true } | { allowed: false, reason: string }>}
 */
export async function ensureTabAccess(url) {
  if (!url) {
    return { allowed: false, reason: 'Не удалось определить текущую вкладку' };
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { allowed: false, reason: 'Не удалось определить текущую вкладку' };
  }

  if (BLOCKED_SCHEMES.includes(parsed.protocol)) {
    return {
      allowed: false,
      reason: 'На служебных страницах Chrome расширения не работают. Откройте обычную страницу.',
    };
  }

  if (parsed.protocol === 'https:' && BLOCKED_HOSTS.includes(parsed.hostname)) {
    return {
      allowed: false,
      reason: 'Chrome Web Store закрыт для расширений. Откройте обычную страницу.',
    };
  }

  // Локальные файлы доступны, только если пользователь сам включил галочку
  // «Разрешить доступ к файлам» на странице расширения.
  if (parsed.protocol === 'file:' && !(await hasFileAccess())) {
    return {
      allowed: false,
      reason: 'Для локальных файлов включите «Разрешить доступ к файлам» на странице расширения.',
    };
  }

  return { allowed: true };
}

/** @returns {Promise<boolean>} */
async function hasFileAccess() {
  if (typeof chrome.extension?.isAllowedFileSchemeAccess !== 'function') return true;
  try {
    return await chrome.extension.isAllowedFileSchemeAccess();
  } catch {
    return true; // не смогли спросить — пусть решает сам вызов Chrome
  }
}

/**
 * Имя файла для кадра: хост страницы + вид съёмки + отметка времени.
 * Только латиница и цифры — имя уезжает на диск, лишние символы не нужны.
 *
 * @param {string | undefined} pageUrl
 * @param {'screen' | 'area'} kind
 * @returns {string}
 */
export function buildCaptureFilename(pageUrl, kind) {
  let host = 'page';
  if (pageUrl) {
    try {
      host = new URL(pageUrl).hostname.replace(/^www\./, '') || 'page';
    } catch {
      host = 'page';
    }
  }

  const safeHost = host.toLowerCase().replace(/[^a-z0-9.-]/g, '-').slice(0, 40) || 'page';
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  const stamp =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;

  return `${safeHost}-${kind}-${stamp}.png`;
}
