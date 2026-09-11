/** NEW-02 — эндпоинт поиск-модалки: `GET /api/search`. Логика среза живёт в `search.ts`. */
import type { Hono } from 'hono';
import { ACCEPTED_EXTS, type FileExt, type SearchResponse } from '../../shared/api.js';
import { badRequest } from './errors.js';
import { normalizeSearchLimit, search, type SearchParams } from './search.js';
import type { AppState } from './state.js';
import { normalizeTagList } from './tags.js';

/** `?tags=a,b&tags=c` и `?tags=a&tags=b` читаются одинаково — как в `GET /api/files`. */
function multiParam(values: string[]): string[] {
  return values
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter((value) => value !== '');
}

function parseSearchQuery(url: URL): SearchParams {
  const params = url.searchParams;

  const exts = multiParam(params.getAll('exts')).map((value) => value.toLowerCase());
  const unknownExt = exts.find((value) => !(ACCEPTED_EXTS as readonly string[]).includes(value));
  if (unknownExt !== undefined) throw badRequest(`Неизвестный формат: ${unknownExt}`, 'invalid_ext');

  const result: SearchParams = {
    q: (params.get('q') ?? '').trim(),
    tags: normalizeTagList(multiParam(params.getAll('tags'))),
    exts: exts as FileExt[],
    limit: normalizeSearchLimit(params.get('limit') === null ? undefined : Number(params.get('limit'))),
  };

  const folderRaw = params.get('folderId');
  if (folderRaw !== null) {
    if (folderRaw === '' || folderRaw === 'null' || folderRaw === 'none') result.folderId = null;
    else {
      const folderId = Number(folderRaw);
      if (!Number.isInteger(folderId) || folderId <= 0) {
        throw badRequest(`Некорректная папка: ${folderRaw}`, 'invalid_folder');
      }
      result.folderId = folderId;
    }
  }

  return result;
}

export function registerSearchRoutes(app: Hono, state: AppState): void {
  app.get('/api/search', (c) => {
    const result: SearchResponse = search(state.db, parseSearchQuery(new URL(c.req.url)));
    return c.json(result);
  });
}
