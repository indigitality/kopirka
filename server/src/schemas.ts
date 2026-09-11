/** Схемы входных данных. Всё, что приходит снаружи, проходит через zod. */
import { z } from 'zod';
import { ACCEPTED_EXTS, NOTIFY_MAX_BODY, NOTIFY_MAX_TITLE } from '../../shared/api.js';

const positiveId = z.number().int().positive();

export const fileIdsSchema = z.object({
  fileIds: z.array(positiveId).min(1, 'нужен хотя бы один файл'),
});

export const bulkMoveSchema = z.object({
  fileIds: z.array(positiveId).min(1),
  folderId: positiveId.nullable(),
});

export const bulkTagSchema = z.object({
  fileIds: z.array(positiveId).min(1),
  add: z.array(z.string()).optional(),
  remove: z.array(z.string()).optional(),
});

export const fileUpdateSchema = z.object({
  folderId: positiveId.nullable().optional(),
  tags: z.array(z.string()).optional(),
});

export const folderCreateSchema = z.object({
  name: z.string().min(1, 'имя папки обязательно'),
  parentFolderId: positiveId.nullable().optional(),
});

export const folderUpdateSchema = z.object({
  name: z.string().optional(),
  parentFolderId: positiveId.nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export const importUrlSchema = z.object({
  imageUrl: z.string().min(1),
  pageUrl: z.string().optional(),
  sourceType: z.literal('context_menu').default('context_menu'),
});

export const importCaptureSchema = z.object({
  dataUrl: z.string().min(1),
  pageUrl: z.string().optional(),
  suggestedFilename: z.string().optional(),
  sourceType: z.enum(['tab_screenshot', 'area_screenshot']),
});

/** Вариант CAP-05 для клиента, который присылает локальные пути, а не байты. */
export const importWatchSchema = z.object({
  paths: z.array(z.string().min(1)).min(1),
});

export const importConfirmSchema = z.object({
  pendingToken: z.string().min(1),
});

/**
 * POST /api/notify — текст уходит в системное уведомление, поэтому длину режем здесь:
 * macOS всё равно обрежет, а через ленту это ещё и попало бы в кольцо на 500 записей.
 */
export const notifySchema = z.object({
  body: z.string().trim().min(1, 'текст уведомления обязателен').max(NOTIFY_MAX_BODY),
  title: z.string().trim().min(1).max(NOTIFY_MAX_TITLE).optional(),
});

export const settingsPatchSchema = z.object({
  libraryPath: z.string().min(1).optional(),
  serverPort: z.number().int().min(1024).max(65535).optional(),
  firstRunCompleted: z.boolean().optional(),
});

/**
 * FDB-05 — экспорт в папку. Сам путь проверяется в маршруте (абсолютность,
 * существование, «не внутри библиотеки»): это вопросы файловой системы,
 * а не формы запроса.
 */
export const filesExportSchema = z.object({
  fileIds: z.array(positiveId).min(1, 'нужен хотя бы один файл'),
  targetDir: z.string().min(1, 'нужна папка назначения'),
});

/** FDB-05 — «Показать в Finder» для произвольной папки. */
export const revealPathSchema = z.object({
  path: z.string().min(1, 'нужен путь'),
});

export const scopeSchema = z.enum(['library', 'untagged', 'trash']);
export const sortSchema = z.enum(['added_desc', 'added_asc', 'name_asc', 'name_desc']);
export const extSchema = z.enum(ACCEPTED_EXTS);
export const syncSourceSchema = z.enum(['drag_drop', 'clipboard']);
/** Булев флаг в query-строке: `1`/`true` — да, `0`/`false` — нет. Регистр не важен. */
export const boolFlagSchema = z
  .enum(['1', 'true', '0', 'false'])
  .transform((value) => value === '1' || value === 'true');
