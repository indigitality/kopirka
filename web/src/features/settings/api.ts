/**
 * Запросы настроек и онбординга.
 *
 * Живут здесь, а не в `lib/api.ts`, по двум причинам: файл клиента принадлежит
 * другому агенту, и `PATCH /api/settings` отдаёт поле `restartRequired`, которого
 * нет в `SettingsResponse` — типизировать его надо отдельно.
 */
import type { AppConfig, ApiError, SettingsResponse } from '@shared/api';

const BASE = '/api';

/** Ответ PATCH /api/settings: контракт + флаг «нужен перезапуск» (SET-03). */
export interface SettingsPatchResponse extends SettingsResponse {
  restartRequired: boolean;
}

/** Ошибка запроса с машинным кодом — по нему раскладываем текст к нужному полю. */
export class SettingsRequestError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'SettingsRequestError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
  } catch {
    throw new SettingsRequestError('Сервер «Копирки» недоступен', 0, 'offline');
  }

  if (!response.ok) {
    let message = `Запрос не выполнен (${response.status})`;
    let code: string | undefined;
    try {
      const body = (await response.json()) as Partial<ApiError>;
      if (typeof body.error === 'string' && body.error) message = body.error;
      if (typeof body.code === 'string') code = body.code;
    } catch {
      // тело не JSON — оставляем сообщение по статусу
    }
    throw new SettingsRequestError(message, response.status, code);
  }

  return (await response.json()) as T;
}

export const fetchSettings = () => request<SettingsResponse>('/settings');

export const patchSettings = (body: Partial<AppConfig>) =>
  request<SettingsPatchResponse>('/settings', { method: 'PATCH', body: JSON.stringify(body) });

/** Онбординг: путь сохраняем отдельным PATCH — эндпоинт complete тела не принимает. */
export async function completeOnboarding(libraryPath: string): Promise<SettingsResponse> {
  await patchSettings({ libraryPath });
  return request<SettingsResponse>('/onboarding/complete', { method: 'POST', body: '{}' });
}
