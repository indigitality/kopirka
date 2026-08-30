/** Отдача файлов с диска: Content-Type, ETag, Range. Плюс мелкие HTTP-помощники. */
import fs from 'node:fs';
import { Readable } from 'node:stream';
import type { Context } from 'hono';
import { z } from 'zod';
import { badRequest } from './errors.js';

interface RangeSpec {
  start: number;
  end: number;
}

function parseRange(header: string | undefined, size: number): RangeSpec | 'invalid' | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return 'invalid';
  const rawStart = match[1] ?? '';
  const rawEnd = match[2] ?? '';
  if (rawStart === '' && rawEnd === '') return 'invalid';
  let start: number;
  let end: number;
  if (rawStart === '') {
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return 'invalid';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? size - 1 : Number(rawEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return 'invalid';
    end = Math.min(end, size - 1);
  }
  if (start > end || start >= size) return 'invalid';
  return { start, end };
}

function bodyFor(absPath: string, range: RangeSpec | null): ReadableStream<Uint8Array> {
  const stream = range
    ? fs.createReadStream(absPath, { start: range.start, end: range.end })
    : fs.createReadStream(absPath);
  return Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>;
}

export interface SendFileOptions {
  contentType: string;
  /** Значение ETag без кавычек. Обычно sha256 содержимого. */
  etag: string;
  cacheControl?: string;
  /**
   * Отдать файл в песочнице: запретить исполнение скриптов и любые подгрузки.
   * Нужно для пользовательского содержимого — SVG лежит на нашем origin и иначе
   * мог бы выполнить скрипт. НЕ включать для собственной сборки интерфейса:
   * этот CSP заблокирует её же JS и CSS, и приложение не запустится.
   */
  sandbox?: boolean;
}

export function sendFile(c: Context, absPath: string, options: SendFileOptions): Response {
  const stat = fs.statSync(absPath);
  const etag = `"${options.etag}"`;
  const baseHeaders: Record<string, string> = {
    'Content-Type': options.contentType,
    ETag: etag,
    'Accept-Ranges': 'bytes',
    'Last-Modified': stat.mtime.toUTCString(),
    'Cache-Control': options.cacheControl ?? 'private, max-age=86400',
    'X-Content-Type-Options': 'nosniff',
  };

  if (options.sandbox) {
    baseHeaders['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
  }

  const ifNoneMatch = c.req.header('if-none-match');
  if (ifNoneMatch && ifNoneMatch.split(',').some((value) => value.trim() === etag)) {
    return new Response(null, { status: 304, headers: baseHeaders });
  }

  const range = parseRange(c.req.header('range'), stat.size);
  if (range === 'invalid') {
    return new Response(null, {
      status: 416,
      headers: { ...baseHeaders, 'Content-Range': `bytes */${stat.size}` },
    });
  }

  if (c.req.method === 'HEAD') {
    return new Response(null, { status: 200, headers: { ...baseHeaders, 'Content-Length': String(stat.size) } });
  }

  if (range) {
    return new Response(bodyFor(absPath, range), {
      status: 206,
      headers: {
        ...baseHeaders,
        'Content-Range': `bytes ${range.start}-${range.end}/${stat.size}`,
        'Content-Length': String(range.end - range.start + 1),
      },
    });
  }

  return new Response(bodyFor(absPath, null), {
    status: 200,
    headers: { ...baseHeaders, 'Content-Length': String(stat.size) },
  });
}

/** Разбор JSON-тела через zod. Любое несоответствие — понятная 400. */
export async function parseJsonBody<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw badRequest('Ожидается корректный JSON', 'invalid_json');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue && issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
    throw badRequest(`${where}${issue?.message ?? 'неверное тело запроса'}`, 'validation_failed');
  }
  return parsed.data;
}

export function parseId(raw: string | undefined): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw badRequest('Некорректный идентификатор', 'invalid_id');
  return id;
}
