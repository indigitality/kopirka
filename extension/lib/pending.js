/**
 * Снятый, но ещё не сохранённый кадр.
 *
 * Popup закрывается на время выделения области (CAP-08), поэтому кадр нельзя
 * держать в его памяти: складываем в chrome.storage.session — она живёт до
 * перезапуска браузера и не попадает на диск.
 *
 * @typedef {Object} PendingCapture
 * @property {string} dataUrl
 * @property {string} [pageUrl]
 * @property {string} suggestedFilename
 * @property {'tab_screenshot'|'area_screenshot'} sourceType
 * @property {number} width физические пиксели кадра
 * @property {number} height
 * @property {number} createdAt
 */

const KEY = 'pendingCapture';

/** Кадр старше этого срока считаем забытым — не показываем при открытии popup. */
const MAX_AGE_MS = 10 * 60 * 1000;

/** @returns {Promise<PendingCapture | null>} */
export async function getPendingCapture() {
  try {
    const stored = await chrome.storage.session.get(KEY);
    const capture = stored?.[KEY];
    if (!capture || typeof capture.dataUrl !== 'string') return null;
    if (Date.now() - (capture.createdAt ?? 0) > MAX_AGE_MS) {
      await clearPendingCapture();
      return null;
    }
    return capture;
  } catch {
    return null;
  }
}

/**
 * @param {Omit<PendingCapture, 'createdAt'>} capture
 * @returns {Promise<PendingCapture>}
 */
export async function setPendingCapture(capture) {
  const record = { ...capture, createdAt: Date.now() };
  await chrome.storage.session.set({ [KEY]: record });
  return record;
}

/** @returns {Promise<void>} */
export async function clearPendingCapture() {
  try {
    await chrome.storage.session.remove(KEY);
  } catch {
    // сессионное хранилище могло быть уже очищено — молча
  }
}
