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
// Поиск-модалка — GET /api/search (NEW-02, решение Сергея 11.09.2026)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Один запрос на всю модалку: файлы, теги, форматы и папки разом. `GET /api/files`
 * остаётся источником для сетки — здесь короткие строки для списка, без тегов,
 * размеров и дат, зато с готовым путём папки («Интерфейсы / Дашборды»).
 */
export interface FileSummary {
  id: number;
  originalFilename: string;
  ext: FileExt;
  folderId: number | null;
  /** Путь папки от корня через « / ». null — файл вне папок («Не разобрано»). */
  folderPath: string | null;
  /** Готовые URL для <img>, как в `FileRecord`. */
  previewUrl: string | null;
  originalUrl: string;
}

export interface SearchTagHit {
  name: string;
  /** Файлов с этим тегом, не считая корзину. */
  count: number;
}

export interface SearchExtHit {
  ext: FileExt;
  /** Файлов этого формата в библиотеке; 0 — формат есть в контракте, но не в библиотеке. */
  count: number;
}

export interface SearchFolderHit {
  id: number;
  name: string;
  /** Полный путь от корня: «Интерфейсы / Дашборды». */
  path: string;
  /** Файлы в папке и всех подпапках, не считая корзину. */
  count: number;
}

/** Параметры `GET /api/search`. Чипы-фильтры (`tags`, `exts`, `folderId`) сужают только файлы. */
export interface SearchQuery {
  /** Подстрока: имя файла, имя тега, имя папки. Пусто — «что тут вообще есть». */
  q?: string;
  tags?: string[];
  exts?: FileExt[];
  folderId?: number | null;
  limit?: number;
}

export interface SearchResponse {
  files: FileSummary[];
  /** С `q` — теги, чьё имя содержит запрос; без `q` — самые частые (top 10). */
  tags: SearchTagHit[];
  /** Всегда весь `ACCEPTED_EXTS` со счётчиками: пустой формат показывается выключенным. */
  exts: SearchExtHit[];
  /** С `q` — папки, чьё имя содержит запрос; без `q` — корневые. */
  folders: SearchFolderHit[];
  /** Сколько файлов подходит под запрос целиком, а не сколько влезло в `limit`. */
  total: number;
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
  /** FDB-03 — куда класть. null и отсутствие поля равны: «Не разобрано». */
  folderId?: number | null;
}

/** POST /api/import/capture — CAP-02, CAP-08, скриншоты из расширения. */
export interface ImportCaptureRequest {
  /** data:image/png;base64,... */
  dataUrl: string;
  pageUrl?: string;
  suggestedFilename?: string;
  sourceType: Extract<SourceType, 'tab_screenshot' | 'area_screenshot'>;
  /** FDB-03 — куда класть. null и отсутствие поля равны: «Не разобрано». */
  folderId?: number | null;
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

/**
 * FDB-05 — выгрузка оригиналов в обычную папку на диске. `targetDir` —
 * абсолютный путь существующей папки вне библиотеки (её раскладку менять извне
 * нельзя). Файлы кладутся под своими `originalFilename`, совпадения имён
 * разводятся суффиксом: `имя (2).png`.
 */
export interface FileExportRequest extends BulkFileIdsRequest {
  targetDir: string;
}

/** Один не выгруженный файл: имя и причина человеческим языком (для «Подробнее»). */
export interface FileExportFailure {
  id: number;
  name: string;
  reason: string;
}

export interface FileExportResponse {
  exported: number;
  failed: FileExportFailure[];
}

/** LIB-06 — показать в файловом менеджере произвольную папку (куда шёл экспорт). */
export interface RevealPathRequest {
  path: string;
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

/**
 * NEW-03 — перенос папки перетаскиванием (макеты D09–D12 от 11.09.2026).
 * `parentId` — новый родитель (`null` — корень), `index` — место среди его детей,
 * считая без самой переносимой папки. Индекс за границами прижимается к краю.
 * Попытка вложить папку в саму себя или в своего потомка — 409 `folder_cycle`.
 */
export interface FolderMoveRequest {
  parentId: number | null;
  index: number;
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
  /**
   * FDB-10 — глобальный хоткей снимка области (CAP-08) в нотации
   * tauri-plugin-global-shortcut: модификаторы `Alt`/`Control`/`Shift`/`Super`
   * и одна клавиша через `+`, например `Alt+Super+C` (это же значение по
   * умолчанию — ⌥⌘C). `null` — хоткей выключен, съёмка остаётся в трее и меню.
   *
   * Оболочка читает поле из config.json при старте и перерегистрирует сочетание,
   * когда оно изменилось: сервер хоткеи не вешает, он только хранит значение.
   */
  captureShortcut: string | null;
}

/** FDB-10 — ⌥⌘C в нотации плагина. Значение по умолчанию и цель кнопки сброса. */
export const DEFAULT_CAPTURE_SHORTCUT = 'Alt+Super+C';

/** Модификаторы, которые понимает tauri-plugin-global-shortcut. Порядок канонический. */
export const SHORTCUT_MODIFIERS = ['Control', 'Alt', 'Shift', 'Super'] as const;
export type ShortcutModifier = (typeof SHORTCUT_MODIFIERS)[number];

/**
 * FDB-10 — чем кончилась регистрация хоткея в оболочке. Кладётся туда
 * `POST /api/system/shortcut-status`, живёт в памяти сервера (как лента событий)
 * и отдаётся в `GET /api/settings`. Веб по нему показывает «Сочетание сохранено»
 * или ошибку «занято другой программой»: сам он о занятости узнать не может —
 * регистрирует не он, а Rust.
 *
 * `null` в `SettingsResponse` — оболочка ещё не отчиталась (браузер без
 * приложения, только что стартовали, Windows-сборка без плагина).
 */
export interface ShortcutStatus {
  /** Сочетание, о котором отчитались, в нотации плагина. */
  shortcut: string | null;
  ok: boolean;
  /** Для `ok: false` — причина от плагина, как есть. */
  error?: string | null;
  /** ISO 8601, момент отчёта. Проставляет сервер. */
  at: string;
}

/** Тело `POST /api/system/shortcut-status`. `at` сервер ставит сам. */
export interface ShortcutStatusRequest {
  shortcut: string | null;
  ok: boolean;
  error?: string | null;
}

export interface SettingsResponse extends AppConfig {
  schemaVersion: number;
  /** SVC-04 — путь к файлу лога, показывается в настройках. */
  logPath: string;
  appVersion: string;
  /** Место на диске, занятое библиотекой, байт. */
  librarySizeBytes: number;
  /** FDB-10 — последний отчёт оболочки о регистрации хоткея. */
  captureShortcutStatus: ShortcutStatus | null;
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
  | 'port_busy'
  /** FDB-10 — сочетание не разбирается в нотации плагина. */
  | 'invalid_shortcut';

/** LIB-06 — «выход в работу». */
export interface RevealResponse {
  ok: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Лента событий — GET /api/events
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Лента живёт в памяти сервера (кольцо на 500), между перезапусками не сохраняется:
 * это «что только что произошло», а не история.
 *
 * Читают двое: десктопная оболочка — чтобы показать системное уведомление от имени
 * приложения (и с его иконкой), и окно — чтобы дорисовать карточку без перезагрузки.
 * Записи двух видов, различаются полем `kind`.
 */
export type EventKind =
  /** Файл прошёл через конвейер импорта. */
  | 'import'
  /** Сообщение «со стороны» — POST /api/notify. Показать и забыть. */
  | 'notice';

interface EventBase {
  /** Сквозной номер, растёт от 1. Клиент запоминает последний увиденный. */
  seq: number;
  /** ISO 8601. */
  at: string;
  kind: EventKind;
}

export interface ImportEvent extends EventBase {
  kind: 'import';
  /**
   * Файл, о котором речь, — он всегда существует в библиотеке:
   * для `added`/`added_similar` это только что добавленный файл,
   * для `duplicate` — тот, который уже лежал и заблокировал импорт.
   */
  fileId: number;
  /** Каким путём файл приехал (у `duplicate` — путь отклонённой попытки). */
  sourceType: SourceType;
  folderId: number | null;
  /** Имя папки на момент события — чтобы уведомление не ходило за ним отдельно. */
  folderName: string | null;
  /**
   * `duplicate` попадает в ленту наравне с успехами: для пользователя «это уже было»
   * — такой же ответ на его действие, как «добавлено», и сказать об этом должно
   * приложение, а не сторонний скрипт. Окно по таким событиям ничего не дорисовывает.
   */
  outcome: Extract<ImportOutcome, 'added' | 'added_similar' | 'duplicate'>;
}

/**
 * Сообщение, которое приложение должно показать от своего имени. Кладут его туда,
 * кому иначе пришлось бы звать `osascript` и получать чужую иконку: обработчик быстрой
 * команды Finder, Folder Action, любой сторонний скрипт на локальной машине.
 */
export interface NoticeEvent extends EventBase {
  kind: 'notice';
  /** Заголовок уведомления. null — приложение подставит «Копирка». */
  title: string | null;
  body: string;
}

export type LibraryEvent = ImportEvent | NoticeEvent;

export interface EventsResponse {
  /** События строго после `after`. Без `after` — пустой массив: историю не отдаём. */
  events: LibraryEvent[];
  /** Номер последнего события в журнале. С него начинают следить за новыми. */
  last: number;
}

/** POST /api/notify — попросить приложение сказать это системным уведомлением. */
export interface NotifyRequest {
  body: string;
  /** По умолчанию — «Копирка». */
  title?: string;
}

/** Ограничения на текст: уведомление macOS всё равно обрежет длинное. */
export const NOTIFY_MAX_BODY = 300;
export const NOTIFY_MAX_TITLE = 80;

export interface NotifyResponse {
  ok: boolean;
  /** Номер созданного события — по нему видно, что оно легло в ленту. */
  seq: number;
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
  /** Живая лента событий: `?after=<seq>`. Без параметра отдаётся только `last`. */
  events: 'GET /api/events',
  /** Сказать уведомлением от имени приложения — для скриптов вне окна. */
  notify: 'POST /api/notify',

  listFiles: 'GET /api/files',
  getFile: 'GET /api/files/:id',
  updateFile: 'PATCH /api/files/:id',
  filePreview: 'GET /api/files/:id/preview',
  fileOriginal: 'GET /api/files/:id/original',
  /** LIB-06 — «Показать в папке»: macOS — `open -R`, Windows — `explorer /select,…`. */
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
  /** FDB-05 — копия оригиналов в обычную папку на диске. */
  exportFiles: 'POST /api/files/export',

  listFolders: 'GET /api/folders',
  createFolder: 'POST /api/folders',
  updateFolder: 'PATCH /api/folders/:id',
  deleteFolder: 'DELETE /api/folders/:id', // 5.4 — файлы не удаляются, folderId = NULL
  moveFolder: 'PATCH /api/folders/:id/move', // NEW-03 — перенос папки перетаскиванием

  listTags: 'GET /api/tags',

  getSettings: 'GET /api/settings',
  updateSettings: 'PATCH /api/settings',
  completeOnboarding: 'POST /api/onboarding/complete',

  /** NEW-02 — поиск-модалка: файлы, теги, форматы и папки одним запросом. */
  search: 'GET /api/search',

  /** FDB-05 — показать в файловом менеджере папку, куда только что выгрузили. */
  revealPath: 'POST /api/system/reveal-path',
  /** FDB-10 — оболочка отчитывается, зарегистрировался ли хоткей. */
  shortcutStatus: 'POST /api/system/shortcut-status',
} as const;
