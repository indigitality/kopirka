/**
 * Единые тексты интерфейса и разбор ответа импорта.
 * Тексты русские, имена — английские (правило проекта).
 */

import { FAILURE } from './api.js';

export const TEXT = {
  serverDownTitle: 'Копирка не запущена',
  serverDownHint: 'Откройте приложение «Копирка» и повторите.',
  saveErrorTitle: 'Не удалось сохранить',
  notificationTitle: 'Копирка',
};

/** ImportErrorCode → человеческий текст. Коды — из app/shared/api.ts. */
const ERROR_CODE_TEXT = {
  unsupported_format: 'Формат не поддерживается',
  too_large: 'Файл больше 50 МБ',
  unreadable: 'Файл не читается',
  disk_error: 'Ошибка записи на диск',
  internal: 'Внутренняя ошибка приложения',
};

/**
 * Разбирает ImportResponse в текст для интерфейса.
 * Расширение импортирует ровно один файл за раз, поэтому смотрим items[0].
 *
 * @param {import('./api.js').ImportResponse} response
 * @returns {{ ok: boolean, outcome: string, message: string }}
 */
export function describeImport(response) {
  const item = response.items[0];

  switch (item.outcome) {
    case 'added':
      return { ok: true, outcome: item.outcome, message: 'Добавлено в библиотеку' };

    case 'added_similar':
      return { ok: true, outcome: item.outcome, message: 'Сохранено (похоже на уже имеющийся)' };

    case 'duplicate':
      return { ok: true, outcome: item.outcome, message: 'Уже есть в библиотеке' };

    // Синхронный путь импорта; для расширения (асинхронный путь, документ 06 §3.1)
    // сервер так отвечать не должен — но ответ по контракту возможен, поэтому
    // честно говорим, что файл ещё не сохранён.
    case 'needs_confirmation':
      return {
        ok: false,
        outcome: item.outcome,
        message: 'Похоже на уже имеющийся — подтвердите импорт в приложении',
      };

    case 'error':
    default:
      return {
        ok: false,
        outcome: 'error',
        message:
          item.errorMessage ||
          ERROR_CODE_TEXT[item.errorCode] ||
          'Приложение отклонило файл',
      };
  }
}

/**
 * Ошибка сети/сервера → текст для интерфейса.
 * @param {unknown} error
 * @returns {{ unreachable: boolean, message: string }}
 */
export function describeFailure(error) {
  if (error && typeof error === 'object' && 'kind' in error) {
    const failure = /** @type {import('./api.js').ApiFailure} */ (error);
    return {
      unreachable: failure.kind === FAILURE.UNREACHABLE,
      message: failure.message,
    };
  }
  return { unreachable: false, message: 'Неизвестная ошибка' };
}
