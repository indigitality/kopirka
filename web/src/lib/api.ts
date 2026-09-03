/**
 * Типизированный клиент HTTP-API «Копирки».
 * Строится строго по карте `API` из `@shared/api`; серверная сторона делается параллельно.
 *
 * В деве Vite проксирует `/api` на 127.0.0.1:43117, в проде статику раздаёт тот же
 * сервер — поэтому базовый путь всегда относительный.
 */
import type {
  ApiError,
  AppConfig,
  BulkFileIdsRequest,
  BulkMoveRequest,
  BulkTagRequest,
  EventsResponse,
  FileListQuery,
  FileListResponse,
  FileRecord,
  FileUpdateRequest,
  FolderCreateRequest,
  FolderRecord,
  FolderUpdateRequest,
  ImportCaptureRequest,
  ImportConfirmRequest,
  ImportResponse,
  ImportUrlRequest,
  RevealResponse,
  SettingsResponse,
  SourceType,
  StatsResponse,
  TagRecord,
} from '@shared/api';

const BASE = '/api';

/** Ошибка запроса в нормальном виде: статус, машинный код, человеческий текст. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
  }

  /** true — сервер не ответил вовсе (не запущен, обрыв сети). */
  get isOffline(): boolean {
    return this.status === 0;
  }
}

/** Ответ мутаций, у которых контракт не объявляет отдельного типа. */
export interface OkResponse {
  ok: boolean;
}

type QueryValue = string | number | boolean | null | undefined | readonly (string | number)[];

function buildQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (value === null) {
      // folderId: null — «файлы вне папок», отличается от «параметр не задан».
      search.append(key, 'null');
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, String(item));
      continue;
    }
    search.append(key, String(value as string | number | boolean));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

async function parseError(response: Response): Promise<ApiRequestError> {
  let message = `Запрос не выполнен (${response.status})`;
  let code: string | undefined;
  try {
    const body = (await response.json()) as Partial<ApiError>;
    if (typeof body.error === 'string' && body.error) message = body.error;
    if (typeof body.code === 'string') code = body.code;
  } catch {
    // тело не JSON — оставляем сообщение по статусу
  }
  return new ApiRequestError(message, response.status, code);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      headers: init?.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
      ...init,
    });
  } catch {
    throw new ApiRequestError('Сервер «Копирки» недоступен', 0, 'offline');
  }

  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;

  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });
const patch = (body: unknown): RequestInit => ({ method: 'PATCH', body: JSON.stringify(body) });

// ── Здоровье и счётчики ────────────────────────────────────────────────────

export const getHealth = () => request<{ ok: boolean; version?: string }>('/health');
export const getStats = () => request<StatsResponse>('/stats');

/**
 * Лента событий (импорты и сообщения-уведомления). `after` — последний увиденный
 * `seq`; без него сервер отдаёт только `last`, то есть точку отсчёта, а историю нет.
 */
export const getEvents = (after?: number) =>
  request<EventsResponse>(`/events${after === undefined ? '' : `?after=${after}`}`);

// ── Файлы ──────────────────────────────────────────────────────────────────

export function listFiles(query: FileListQuery = {}): Promise<FileListResponse> {
  return request<FileListResponse>(
    `/files${buildQuery({
      scope: query.scope,
      folderId: query.folderId,
      query: query.query,
      tags: query.tags,
      exts: query.exts,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      hasSimilar: query.hasSimilar,
      sort: query.sort,
      limit: query.limit,
      cursor: query.cursor,
    })}`,
  );
}

export const getFile = (id: number) => request<FileRecord>(`/files/${id}`);
export const updateFile = (id: number, body: FileUpdateRequest) =>
  request<FileRecord>(`/files/${id}`, patch(body));

/** Прямые URL для <img>. Запросов не делают. */
export const filePreviewUrl = (id: number) => `${BASE}/files/${id}/preview`;
export const fileOriginalUrl = (id: number) => `${BASE}/files/${id}/original`;

/** LIB-06 — «Показать в Finder». */
export const revealFile = (id: number) => request<RevealResponse>(`/files/${id}/reveal`, json({}));
/** LIB-06 — «Скопировать» в системный буфер. */
export const copyFile = (id: number) => request<RevealResponse>(`/files/${id}/copy`, json({}));
/** IMP-01 — снять пометку «возможный дубль». */
export const resolveSimilar = (id: number) => request<FileRecord>(`/files/${id}/resolve-similar`, json({}));

// ── Импорт ─────────────────────────────────────────────────────────────────

/** Синхронные пути импорта: только они умеют показать модалку «Похоже, уже есть». */
export interface SyncImportOptions {
  sourceType?: Extract<SourceType, 'drag_drop' | 'clipboard'>;
  /** Куда положить: сейчас — текущая папка сетки. */
  folderId?: number | null;
  /** Доля отправленного, 0…1. Считается по загрузке, обработка на сервере идёт после. */
  onProgress?: (ratio: number) => void;
}

function importForm(files: readonly File[], options: SyncImportOptions): FormData {
  const form = new FormData();
  for (const file of files) form.append('files', file, file.name);
  form.append('sourceType', options.sourceType ?? 'drag_drop');
  if (options.folderId !== undefined && options.folderId !== null) {
    form.append('folderId', String(options.folderId));
  }
  return form;
}

/**
 * CAP-03, CAP-04 — перетаскивание и вставка из буфера.
 * Когда нужен прогресс, идём через XHR: у fetch нет событий отправки тела.
 */
export function importFiles(
  files: readonly File[],
  options: SyncImportOptions = {},
): Promise<ImportResponse> {
  const form = importForm(files, options);
  if (!options.onProgress) {
    return request<ImportResponse>('/import', { method: 'POST', body: form });
  }

  const onProgress = options.onProgress;
  return new Promise<ImportResponse>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}/import`);
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        try {
          resolve(JSON.parse(xhr.responseText) as ImportResponse);
        } catch {
          reject(new ApiRequestError('Сервер вернул неожиданный ответ', xhr.status));
        }
        return;
      }
      let message = `Запрос не выполнен (${xhr.status})`;
      let code: string | undefined;
      try {
        const body = JSON.parse(xhr.responseText) as Partial<ApiError>;
        if (typeof body.error === 'string' && body.error) message = body.error;
        if (typeof body.code === 'string') code = body.code;
      } catch {
        // тело не JSON — оставляем сообщение по статусу
      }
      reject(new ApiRequestError(message, xhr.status, code));
    });
    xhr.addEventListener('error', () =>
      reject(new ApiRequestError('Сервер «Копирки» недоступен', 0, 'offline')),
    );
    xhr.send(form);
  });
}

/** CAP-01 — «Сохранить в Копирку» из контекстного меню браузера. */
export const importUrl = (body: ImportUrlRequest) => request<ImportResponse>('/import/url', json(body));

/** CAP-02, CAP-08 — скриншоты из расширения. */
export const importCapture = (body: ImportCaptureRequest) =>
  request<ImportResponse>('/import/capture', json(body));

/**
 * CAP-05 — автоимпорт папки скриншотов через Folder Action.
 * Контракт тело запроса не объявляет; передаём локальные пути, как их отдаёт Folder Action.
 */
export interface ImportWatchRequest {
  paths: string[];
}
export const importWatch = (body: ImportWatchRequest) =>
  request<ImportResponse>('/import/watch', json(body));

/** Досохранить файл, отложенный как 'needs_confirmation'. */
export const importConfirm = (body: ImportConfirmRequest) =>
  request<ImportResponse>('/import/confirm', json(body));

// ── Массовые операции ──────────────────────────────────────────────────────

/** Массовые операции возвращают затронутые записи — их кладём в список без перезапроса. */
export interface BulkFilesResponse extends OkResponse {
  files?: FileRecord[];
}

/** ORG-03 */
export const moveFiles = (body: BulkMoveRequest) =>
  request<BulkFilesResponse>('/files/move', json(body));
/** ORG-01 */
export const tagFiles = (body: BulkTagRequest) => request<BulkFilesResponse>('/files/tag', json(body));
/** ORG-05 — мягкое удаление в корзину. */
export const deleteFiles = (body: BulkFileIdsRequest) =>
  request<BulkFilesResponse>('/files/delete', json(body));
export const restoreFiles = (body: BulkFileIdsRequest) =>
  request<BulkFilesResponse>('/files/restore', json(body));
/** Окончательное удаление. */
export const purgeFiles = (body: BulkFileIdsRequest) => request<OkResponse>('/files/purge', json(body));
export const emptyTrash = () => request<OkResponse>('/trash/empty', json({}));

// ── Папки и теги ───────────────────────────────────────────────────────────

export const listFolders = () => request<FolderRecord[]>('/folders');
export const createFolder = (body: FolderCreateRequest) => request<FolderRecord>('/folders', json(body));
export const updateFolder = (id: number, body: FolderUpdateRequest) =>
  request<FolderRecord>(`/folders/${id}`, patch(body));
/** 5.4 — файлы не удаляются, у них обнуляется folderId. */
export const deleteFolder = (id: number) => request<OkResponse>(`/folders/${id}`, { method: 'DELETE' });

export const listTags = () => request<TagRecord[]>('/tags');

// ── Настройки ──────────────────────────────────────────────────────────────

export const getSettings = () => request<SettingsResponse>('/settings');
export const updateSettings = (body: Partial<AppConfig>) => request<SettingsResponse>('/settings', patch(body));
export const completeOnboarding = () => request<SettingsResponse>('/onboarding/complete', json({}));
