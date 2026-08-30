/**
 * Клиент HTTP-API «Копирки». Контракт — app/shared/api.ts, менять его нельзя.
 * Типы продублированы комментариями JSDoc там, где это помогает читать код.
 *
 * @typedef {'context_menu'|'tab_screenshot'|'area_screenshot'} ExtensionSourceType
 * @typedef {'added'|'added_similar'|'duplicate'|'needs_confirmation'|'error'} ImportOutcome
 * @typedef {'unsupported_format'|'too_large'|'unreadable'|'disk_error'|'internal'} ImportErrorCode
 *
 * @typedef {Object} ImportResultItem
 * @property {string} originalFilename
 * @property {ImportOutcome} outcome
 * @property {object} [file]
 * @property {object} [existingFile]
 * @property {string} [pendingToken]
 * @property {ImportErrorCode} [errorCode]
 * @property {string} [errorMessage]
 *
 * @typedef {Object} ImportResponse
 * @property {ImportResultItem[]} items
 * @property {{added:number,duplicates:number,similar:number,errors:number}} summary
 */

/** Отказ сети выявляется быстро — приложение либо запущено, либо нет. */
export const HEALTH_TIMEOUT_MS = 5000;

/**
 * Импорт считает sha256, pHash и превью — это дольше пяти секунд на большом
 * кадре и медленном диске. Порог «сервер не отвечает» тот же (5 с) применяется
 * к /api/health при открытии popup; здесь запас, чтобы не рвать удачный импорт.
 */
export const IMPORT_TIMEOUT_MS = 15000;

/** Вид отказа: сервер не отвечает / ответил ошибкой / ответил непонятным. */
export const FAILURE = {
  UNREACHABLE: 'unreachable',
  SERVER: 'server',
  MALFORMED: 'malformed',
};

export class ApiFailure extends Error {
  /**
   * @param {string} kind один из FAILURE
   * @param {string} message текст для интерфейса
   * @param {string} [code] код из ApiError, если сервер его вернул
   */
  constructor(kind, message, code) {
    super(message);
    this.name = 'ApiFailure';
    this.kind = kind;
    this.code = code;
  }

  get isUnreachable() {
    return this.kind === FAILURE.UNREACHABLE;
  }
}

/**
 * @param {string} serverUrl
 * @param {string} path
 * @param {{ method?: string, body?: unknown, timeoutMs?: number }} [options]
 * @returns {Promise<any>}
 */
async function request(serverUrl, path, options = {}) {
  const { method = 'GET', body, timeoutMs = HEALTH_TIMEOUT_MS } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(`${serverUrl}${path}`, {
      method,
      signal: controller.signal,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // Сюда попадают и отказ соединения, и таймаут — для пользователя это одно и то же.
    throw new ApiFailure(FAILURE.UNREACHABLE, 'Копирка не отвечает');
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text().catch(() => '');
  /** @type {any} */
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const message =
      (payload && typeof payload.error === 'string' && payload.error) ||
      `Сервер ответил ${response.status}`;
    throw new ApiFailure(FAILURE.SERVER, message, payload?.code);
  }

  return payload;
}

/**
 * GET /api/health — жив ли сервер.
 * @param {string} serverUrl
 * @returns {Promise<void>} бросает ApiFailure, если нет
 */
export async function checkHealth(serverUrl) {
  await request(serverUrl, '/api/health', { timeoutMs: HEALTH_TIMEOUT_MS });
}

/**
 * POST /api/import/url — CAP-01, контекстное меню.
 * @param {string} serverUrl
 * @param {{ imageUrl: string, pageUrl?: string }} payload
 * @returns {Promise<ImportResponse>}
 */
export async function importUrl(serverUrl, payload) {
  const response = await request(serverUrl, '/api/import/url', {
    method: 'POST',
    timeoutMs: IMPORT_TIMEOUT_MS,
    body: {
      imageUrl: payload.imageUrl,
      pageUrl: payload.pageUrl,
      sourceType: 'context_menu',
    },
  });
  return asImportResponse(response);
}

/**
 * POST /api/import/capture — CAP-02 и CAP-08, скриншоты.
 * @param {string} serverUrl
 * @param {{ dataUrl: string, pageUrl?: string, suggestedFilename?: string, sourceType: 'tab_screenshot'|'area_screenshot' }} payload
 * @returns {Promise<ImportResponse>}
 */
export async function importCapture(serverUrl, payload) {
  const response = await request(serverUrl, '/api/import/capture', {
    method: 'POST',
    timeoutMs: IMPORT_TIMEOUT_MS,
    body: {
      dataUrl: payload.dataUrl,
      pageUrl: payload.pageUrl,
      suggestedFilename: payload.suggestedFilename,
      sourceType: payload.sourceType,
    },
  });
  return asImportResponse(response);
}

/**
 * @param {any} response
 * @returns {ImportResponse}
 */
function asImportResponse(response) {
  if (!response || !Array.isArray(response.items) || response.items.length === 0) {
    throw new ApiFailure(FAILURE.MALFORMED, 'Непонятный ответ сервера');
  }
  return response;
}
