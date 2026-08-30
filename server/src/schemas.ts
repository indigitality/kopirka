/** Схемы входных данных. Всё, что приходит снаружи, проходит через zod. */
import { z } from 'zod';
import { ACCEPTED_EXTS } from '../../shared/api.js';

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

export const settingsPatchSchema = z.object({
  libraryPath: z.string().min(1).optional(),
  serverPort: z.number().int().min(1024).max(65535).optional(),
  firstRunCompleted: z.boolean().optional(),
});

export const scopeSchema = z.enum(['library', 'untagged', 'trash']);
export const sortSchema = z.enum(['added_desc', 'added_asc', 'name_asc', 'name_desc']);
export const extSchema = z.enum(ACCEPTED_EXTS);
export const syncSourceSchema = z.enum(['drag_drop', 'clipboard']);
