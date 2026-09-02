/**
 * Контракт HTTP-API «Копирки». Единственный источник правды для сервера и веб-интерфейса.
 * Поля соответствуют модели данных из PRD §7.5 и документа 05.
 *
 * Правило: этот файл меняется только осознанно и одновременно с обеими сторонами.
 */

export const SCHEMA_VERSION = 1;
export const DEFAULT_PORT = 43117;

/** Откуда файл попал в библиотеку. PRD §7.5. */
export type SourceType =
  | 'context_menu' // CAP-01 — контекстное меню «Сохранить в Копирку»
  | 'tab_screenshot' // CAP-02 — скриншот видимой области
  | 'area_screenshot' // CAP-08 — скриншот выбранной области
  | 'drag_drop' // CAP-03
  | 'clipboard' // CAP-04 — ⌘V
  | 'folder_watch'; // CAP-05 — автоимпорт папки скриншотов

/** Форматы, принимаемые при импорте. IMP-04. */
export const RASTER_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif'] as const;
export const ACCEPTED_EXTS = [...RASTER_EXTS, 'svg'] as const;
export type FileExt = (typeof ACCEPTED_EXTS)[number];

/** IMP-05 — лимит размера файла. */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** IMP-01 — порог похожести перцептивного хэша: не более 10 бит из 64. */
export const PHASH_MAX_DISTANCE = 10;

// ─────────────────────────────────────────────────────────────────────────────
// Сущности
// ─────────────────────────────────────────────────────────────────────────────

export interface FileRecord {
  id: number;
  sha256: string;
  phash: string | null;
  /** IMP-01 — ссылка на похожий файл, проставляется на асинхронных путях импорта. */
  similarToFileId: number | null;
  originalFilename: string;
  ext: FileExt;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  folderId: number | null;
  sourceType: SourceType;
  sourceUrl: string | null;
  /** SVC-03 — файл принят, но превью сгенерировать не удалось. */
  isBroken: boolean;
  /** true, если превью нет по формату (svg), а не из-за ошибки. */
  hasPreview: boolean;
  /** ISO 8601. */
  addedAt: string;
  /** ORG-05 — soft-delete. null = файл в библиотеке. */
  deletedAt: string | null;
  tags: string[];
  /** Готовые URL для <img>: /api/files/:id/preview и /original. */
  previewUrl: string | null;
  originalUrl: string;
}

export interface FolderRecord {
  id: number;
  name: string;
  parentFolderId: number | null;
  sortOrder: number;
  createdAt: string;
  /** Количество файлов непосредственно в папке (без подпапок), не считая корзину. */
  fileCount: number;
  /** Файлы в папке и всех подпапках, не считая корзину. */
  totalFileCount: number;
  children: FolderRecord[];
}

export interface TagRecord {
  id: number;
  /** Нормализованное имя: нижний регистр, обрезаны края, пробелы схлопнуты. 05 §3.4. */
  name: string;
  fileCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Список файлов — GET /api/files
// ─────────────────────────────────────────────────────────────────────────────

/** Какой срез библиотеки показываем. Соответствует разделам сайдбара. */
export type LibraryScope =
  | 'library' // Вся библиотека
  | 'untagged' // «Не разобрано» — SET-05 в редакции 02.09.2026: файл без папки
  | 'trash'; // Корзина

export type SortKey = 'added_desc' | 'added_asc' | 'name_asc' | 'name_desc';

export interface FileListQuery {
  scope?: LibraryScope;
  /** Папка и всё её поддерево (решение 02.09.2026). null — файлы без папки. */
  folderId?: number | null;
  /** IMP-01 — только файлы с непринятой пометкой похожести (similarToFileId). */
  hasSimilar?: boolean;
  /** SEARCH-02 — подстрока в имени файла. */
  query?: string;
  /** SEARCH-01 — И-логика: файл должен иметь все перечисленные теги. */
  tags?: string[];
  /** SEARCH-04 — фильтр по расширению. */
  exts?: FileExt[];
  /** SEARCH-03 — диапазон дат добавления, ISO 8601. */
  dateFrom?: string;
  dateTo?: string;
  /** LIB-04 */
  sort?: SortKey;
  limit?: number;
  cursor?: string | null;
}

export interface FileListResponse {
  files: FileRecord[];
  total: number;
  nextCursor: string | null;
}

/** Счётчики для сайдбара. */
export interface StatsResponse {
  library: number;
  untagged: number;
  trash: number;
  /** IMP-01 — файлы с непринятой пометкой похожести, не в корзине. */
  similar: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Импорт — IMP-01, IMP-05, SVC-02, SVC-03
// ─────────────────────────────────────────────────────────────────────────────

export type ImportOutcome =
  /** Файл добавлен. */
  | 'added'
  /** Файл добавлен, но похож на существующий: проставлен similarToFileId. Асинхронные пути. */
  | 'added_similar'
  /** Точный дубль по sha256 — импорт заблокирован. */
  | 'duplicate'
  /** Синхронный путь: нашли похожий, ждём решения пользователя. Файл НЕ сохранён. */
  | 'needs_confirmation'
  /** Отклонён валидацией или упал. */
  | 'error';

export type ImportErrorCode =
  | 'unsupported_format'
  | 'too_large'
  | 'unreadable'
  | 'disk_error'
  | 'internal';

export interface ImportResultItem {
  originalFilename: string;
  outcome: ImportOutcome;
  /** Для 'added' и 'added_similar'. */
  file?: FileRecord;
  /** Для 'duplicate', 'added_similar', 'needs_confirmation' — на что похоже / что уже есть. */
  existingFile?: FileRecord;
  /** Для 'needs_confirmation' — токен, чтобы досохранить файл после подтверждения. */
  pendingToken?: string;
  /** Для 'error'. */
  errorCode?: ImportErrorCode;
  errorMessage?: string;
}

export interface ImportResponse {
  items: ImportResultItem[];
  /** Сводка для одного тоста при массовом импорте: «Добавлено 48 · Дубли 2 · Ошибки 1». */
  summary: { added: number; duplicates: number; similar: number; errors: number };
}

/** POST /api/import/url — CAP-01, контекстное меню на картинке. */
export interface ImportUrlRequest {
  imageUrl: string;
  /** Страница, с которой сохранили. Пишется в sourceUrl. */
  pageUrl?: string;
  sourceType: Extract<SourceType, 'context_menu'>;
}

/** POST /api/import/capture — CAP-02, CAP-08, скриншоты из расширения. */
export interface ImportCaptureRequest {
  /** data:image/png;base64,... */
  dataUrl: string;
  pageUrl?: string;
  suggestedFilename?: string;
  sourceType: Extract<SourceType, 'tab_screenshot' | 'area_screenshot'>;
}

/**
 * POST /api/import/confirm — досохранить файл, отложенный как 'needs_confirmation'.
 * Папка берётся из исходного запроса импорта, повторно её передавать не нужно.
 */
export interface ImportConfirmRequest {
  pendingToken: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Операции над файлами
// ─────────────────────────────────────────────────────────────────────────────

export interface FileUpdateRequest {
  folderId?: number | null;
  tags?: string[];
}

/** ORG-03, ORG-04, ORG-05 — массовые операции. */
export interface BulkFileIdsRequest {
  fileIds: number[];
}
export interface BulkMoveRequest extends BulkFileIdsRequest {
  folderId: number | null;
}
export interface BulkTagRequest extends BulkFileIdsRequest {
  add?: string[];
  remove?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Папки — ORG-02
// ─────────────────────────────────────────────────────────────────────────────

export interface FolderCreateRequest {
  name: string;
  parentFolderId?: number | null;
}
export interface FolderUpdateRequest {
  name?: string;
  parentFolderId?: number | null;
  sortOrder?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Настройки и конфиг — SET-01…SET-03, SET-05
// ─────────────────────────────────────────────────────────────────────────────

export interface AppConfig {
  /** SET-01/02 — путь библиотеки. По умолчанию ~/Pictures/Копирка. */
  libraryPath: string;
  /** SET-03 */
  serverPort: number;
  firstRunCompleted: boolean;
}

export interface SettingsResponse extends AppConfig {
  schemaVersion: number;
  /** SVC-04 — путь к файлу лога, показывается в настройках. */
  logPath: string;
  appVersion: string;
  /** Место на диске, занятое библиотекой, байт. */
  librarySizeBytes: number;
}

/**
 * Ответ на `PATCH /api/settings`. Отличается от `SettingsResponse` одним полем:
 * порт применяется только после перезапуска — переподнимать слушателя на лету незачем,
 * а расширению нужен заранее известный адрес.
 */
export interface SettingsUpdateResponse extends SettingsResponse {
  /** true, если порт действительно изменился и нужен перезапуск сервера. */
  restartRequired: boolean;
}

/** Коды ошибок `PATCH /api/settings` — интерфейс подсвечивает ими конкретное поле. */
export type SettingsErrorCode =
  /** Путь библиотеки существует, но это не папка. */
  | 'invalid_library_path'
  /** Порт вне допустимого диапазона. */
  | 'invalid_port'
  /** SVC-06 — новый порт занят другой программой, менять его нельзя. */
  | 'port_busy';

/** LIB-06 — «выход в работу». */
export interface RevealResponse {
  ok: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Журнал событий импорта — GET /api/events
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Один успешно импортированный файл. Журнал живёт в памяти сервера (кольцо на 500),
 * между перезапусками не сохраняется: это лента «что только что приехало», а не история.
 *
 * Читают двое: десктопная оболочка — чтобы показать системное уведомление от имени
 * приложения, и окно — чтобы дорисовать карточку без перезагрузки. Обоим нужен только
 * факт события, поэтому запись сама по себе, без содержимого файла.
 */
export interface ImportEvent {
  /** Сквозной номер, растёт от 1. Клиент запоминает последний увиденный. */
  seq: number;
  /** ISO 8601. */
  at: string;
  fileId: number;
  sourceType: SourceType;
  folderId: number | null;
  /** Имя папки на момент импорта — чтобы уведомление не ходило за ним отдельно. */
  folderName: string | null;
  outcome: Extract<ImportOutcome, 'added' | 'added_similar'>;
}

export interface EventsResponse {
  /** События строго после `after`. Без `after` — пустой массив: историю не отдаём. */
  events: ImportEvent[];
  /** Номер последнего события в журнале. С него начинают следить за новыми. */
  last: number;
}

export interface ApiError {
  error: string;
  /** Машинный код: например, `SettingsErrorCode` для `PATCH /api/settings`. */
  code?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Карта эндпоинтов
// ─────────────────────────────────────────────────────────────────────────────

export const API = {
  health: 'GET /api/health',

  stats: 'GET /api/stats',
  /** Живые события импорта: `?after=<seq>`. Без параметра отдаётся только `last`. */
  events: 'GET /api/events',

  listFiles: 'GET /api/files',
  getFile: 'GET /api/files/:id',
  updateFile: 'PATCH /api/files/:id',
  filePreview: 'GET /api/files/:id/preview',
  fileOriginal: 'GET /api/files/:id/original',
  /** LIB-06 — «Показать в Finder», open -R. */
  revealFile: 'POST /api/files/:id/reveal',
  /** LIB-06 — «Скопировать» в системный буфер обмена. */
  copyFile: 'POST /api/files/:id/copy',
  /** IMP-01 — снять пометку «возможный дубль». */
  resolveSimilar: 'POST /api/files/:id/resolve-similar',

  importFiles: 'POST /api/import', // multipart/form-data — CAP-03, CAP-04
  importUrl: 'POST /api/import/url', // CAP-01
  importCapture: 'POST /api/import/capture', // CAP-02, CAP-08
  importWatch: 'POST /api/import/watch', // CAP-05, Folder Action
  importConfirm: 'POST /api/import/confirm',

  moveFiles: 'POST /api/files/move', // ORG-03
  tagFiles: 'POST /api/files/tag', // ORG-01
  deleteFiles: 'POST /api/files/delete', // ORG-05 → корзина
  restoreFiles: 'POST /api/files/restore',
  purgeFiles: 'POST /api/files/purge', // окончательное удаление
  emptyTrash: 'POST /api/trash/empty',

  listFolders: 'GET /api/folders',
  createFolder: 'POST /api/folders',
  updateFolder: 'PATCH /api/folders/:id',
  deleteFolder: 'DELETE /api/folders/:id', // 5.4 — файлы не удаляются, folderId = NULL

  listTags: 'GET /api/tags',

  getSettings: 'GET /api/settings',
  updateSettings: 'PATCH /api/settings',
  completeOnboarding: 'POST /api/onboarding/complete',
} as const;
