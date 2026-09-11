/** Единая ошибка HTTP-уровня: код и статус доезжают до ApiError из контракта. */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, message: string, code = 'bad_request') {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (message: string, code = 'bad_request') => new HttpError(400, message, code);
export const notFound = (message: string, code = 'not_found') => new HttpError(404, message, code);
export const forbidden = (message: string, code = 'forbidden') => new HttpError(403, message, code);
/** Запрос корректен, но противоречит состоянию данных: например, цикл в дереве папок. */
export const conflict = (message: string, code = 'conflict') => new HttpError(409, message, code);
