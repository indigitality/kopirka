/**
 * Дымовой прогон сервера через реальный HTTP на временной библиотеке.
 * Запуск: npm run smoke --workspace=server
 * Ничего не пишет ни в ~/Pictures, ни в ~/Library/Application Support — только во временную папку.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import sharp from 'sharp';
import type {
  FileListResponse,
  FileRecord,
  FolderRecord,
  ImportResponse,
  SettingsResponse,
  StatsResponse,
  TagRecord,
} from '../../shared/api.js';

const SERVER_DIR = fileURLToPath(new URL('..', import.meta.url));
const APP_DIR = path.resolve(SERVER_DIR, '..');
const TSX_BIN = path.join(APP_DIR, 'node_modules', '.bin', 'tsx');

let failures = 0;
let base = '';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function check(name: string, run: () => Promise<void> | void): Promise<void> {
  try {
    await run();
    process.stdout.write(`✓ ${name}\n`);
  } catch (error) {
    failures += 1;
    process.stdout.write(`✗ ${name} — ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

async function api<T>(method: string, pathname: string, body?: unknown): Promise<T> {
  const response = await fetch(`${base}${pathname}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${pathname} → ${response.status}: ${text.slice(0, 300)}`);
  return (text === '' ? undefined : JSON.parse(text)) as T;
}

async function upload(
  pathname: string,
  files: Array<{ name: string; buffer: Buffer }>,
  fields: Record<string, string> = {},
): Promise<ImportResponse> {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  for (const file of files) form.append('files', new Blob([new Uint8Array(file.buffer)]), file.name);
  const response = await fetch(`${base}${pathname}`, { method: 'POST', body: form });
  const text = await response.text();
  if (!response.ok) throw new Error(`POST ${pathname} → ${response.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as ImportResponse;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

// Плазменные узоры: богатые низкие частоты, поэтому перцептивный хэш устойчив и различим.
const WIDTH = 480;
const HEIGHT = 360;

function plasma(seed: number): ReturnType<typeof sharp> {
  const data = Buffer.alloc(WIDTH * HEIGHT * 3);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const dx = x - WIDTH * (0.3 + 0.2 * seed);
      const dy = y - HEIGHT * (0.6 - 0.15 * seed);
      const v =
        128 +
        60 * Math.sin(x / (23 + 7 * seed) + seed) +
        45 * Math.sin(y / (17 + 5 * seed) + seed * 2) +
        35 * Math.sin((x + y) / (31 - 4 * seed)) +
        30 * Math.sin(Math.sqrt(dx * dx + dy * dy) / (13 + 3 * seed));
      const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
      const i = (y * WIDTH + x) * 3;
      data[i] = clamp(v);
      data[i + 1] = clamp(v * 0.7 + 40 * seed);
      data[i + 2] = clamp(255 - v * 0.6);
    }
  }
  return sharp(data, { raw: { width: WIDTH, height: HEIGHT, channels: 3 } });
}

async function main(): Promise<void> {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'kopirka-smoke-'));
  const configDir = path.join(scratch, 'config');
  const libraryPath = path.join(scratch, 'library');
  fs.mkdirSync(configDir, { recursive: true });
  const port = await freePort();
  fs.writeFileSync(
    path.join(configDir, 'config.json'),
    JSON.stringify({ libraryPath, serverPort: port, firstRunCompleted: true }, null, 2),
  );
  base = `http://127.0.0.1:${port}`;

  process.stdout.write(`Библиотека: ${libraryPath}\nПорт: ${port}\n\n`);

  let serverLog = '';
  const spawnServer = (): ChildProcess => {
    const process_ = spawn(TSX_BIN, [path.join(SERVER_DIR, 'src', 'index.ts')], {
      cwd: SERVER_DIR,
      env: { ...process.env, KOPIRKA_CONFIG_DIR: configDir, KOPIRKA_NO_OPEN: '1', KOPIRKA_QUIET: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    process_.stdout?.on('data', (chunk: Buffer) => (serverLog += chunk.toString()));
    process_.stderr?.on('data', (chunk: Buffer) => (serverLog += chunk.toString()));
    return process_;
  };

  const waitHealth = async (): Promise<boolean> => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        if ((await fetch(`${base}/api/health`)).ok) return true;
      } catch {
        await sleep(150);
      }
    }
    return false;
  };

  let child = spawnServer();
  const shutdown = () => {
    if (!child.killed) child.kill('SIGTERM');
  };
  process.on('exit', shutdown);

  if (!(await waitHealth())) {
    process.stdout.write(`✗ сервер не поднялся\n${serverLog}\n`);
    shutdown();
    process.exit(1);
  }

  // ── Данные для прогона ─────────────────────────────────────────────────────
  const pngAlpha = await plasma(0).png().toBuffer();
  const pngBeta = await plasma(1).png().toBuffer();
  const pngGamma = await plasma(2).png().toBuffer();
  const jpgVariant1 = await sharp(pngAlpha).resize(432, 324).jpeg({ quality: 55 }).toBuffer();
  const jpgVariant2 = await sharp(pngAlpha)
    .resize(456, 342)
    .modulate({ brightness: 1.04 })
    .jpeg({ quality: 45 })
    .toBuffer();
  const notAnImage = Buffer.from('%PDF-1.7\n%mock document, not an image\n', 'utf8');

  let idAlpha = 0;
  let idBeta = 0;
  let idVariant1 = 0;
  let idVariant2 = 0;
  let folderId = 0;

  // 1 ────────────────────────────────────────────────────────────────────────
  await check('старт сервера на свободном порту, /api/health и /api/settings отвечают', async () => {
    const health = await api<{ ok: boolean }>('GET', '/api/health');
    assert(health.ok === true, 'health вернул не ok');
    const settings = await api<SettingsResponse>('GET', '/api/settings');
    assert(settings.libraryPath === libraryPath, `библиотека ${settings.libraryPath} вместо ${libraryPath}`);
    assert(settings.serverPort === port, 'порт в настройках не совпал');
    assert(settings.schemaVersion === 1, `версия схемы ${settings.schemaVersion}`);
    assert(settings.logPath.endsWith('kopirka.log'), 'в настройках нет пути к логу');
  });

  // 2 ────────────────────────────────────────────────────────────────────────
  await check('импорт 3 картинок → 3 × added, превью на месте', async () => {
    const result = await upload(
      '/api/import',
      [
        { name: 'plasma-alpha.png', buffer: pngAlpha },
        { name: 'plasma-beta.png', buffer: pngBeta },
        { name: 'plasma-gamma.png', buffer: pngGamma },
      ],
      { sourceType: 'drag_drop' },
    );
    assert(result.summary.added === 3, `added=${result.summary.added}, ожидалось 3 (${JSON.stringify(result.items.map((i) => [i.originalFilename, i.outcome, i.errorMessage]))})`);
    const files = result.items.map((item) => item.file as FileRecord);
    idAlpha = files[0]?.id ?? 0;
    idBeta = files[1]?.id ?? 0;
    assert(idAlpha > 0 && idBeta > 0, 'не вернулись id файлов');
    assert(files.every((file) => file.ext === 'png' && file.width === WIDTH && file.height === HEIGHT), 'размеры или формат прочитались неверно');
    assert(files.every((file) => file.previewUrl !== null && file.hasPreview && !file.isBroken), 'превью не сгенерировалось');
    const preview = await fetch(`${base}/api/files/${idAlpha}/preview`);
    assert(preview.status === 200, `превью отдалось со статусом ${preview.status}`);
    assert(preview.headers.get('content-type') === 'image/webp', 'превью не webp');
    const meta = await sharp(Buffer.from(await preview.arrayBuffer())).metadata();
    assert(meta.width === 600 || meta.height === 600 || (meta.width ?? 0) <= 600, 'превью не вписано в 600px');
    const ranged = await fetch(`${base}/api/files/${idAlpha}/original`, { headers: { Range: 'bytes=0-99' } });
    assert(ranged.status === 206 && (await ranged.arrayBuffer()).byteLength === 100, 'Range на оригинале не работает');
    const stats = await api<StatsResponse>('GET', '/api/stats');
    assert(stats.library === 3, `в библиотеке ${stats.library} файлов вместо 3`);
  });

  // 3 ────────────────────────────────────────────────────────────────────────
  await check('повторный импорт того же файла → duplicate', async () => {
    const result = await upload('/api/import', [{ name: 'plasma-alpha.png', buffer: pngAlpha }], {
      sourceType: 'drag_drop',
    });
    const item = result.items[0];
    assert(item?.outcome === 'duplicate', `outcome=${item?.outcome}`);
    assert(item?.existingFile?.id === idAlpha, 'не вернулся существующий файл');
    assert(result.summary.duplicates === 1, 'сводка не посчитала дубль');
    const stats = await api<StatsResponse>('GET', '/api/stats');
    assert(stats.library === 3, 'дубль всё-таки попал в библиотеку');
  });

  // 4 ────────────────────────────────────────────────────────────────────────
  await check('похожая картинка синхронным путём → needs_confirmation, затем confirm → added', async () => {
    const result = await upload('/api/import', [{ name: 'plasma-alpha-copy.jpg', buffer: jpgVariant1 }], {
      sourceType: 'drag_drop',
    });
    const item = result.items[0];
    assert(item?.outcome === 'needs_confirmation', `outcome=${item?.outcome}`);
    assert(typeof item?.pendingToken === 'string' && item.pendingToken.length > 0, 'нет pendingToken');
    assert(item?.existingFile?.id === idAlpha, 'модалке не показали, на что похоже');
    const before = await api<StatsResponse>('GET', '/api/stats');
    assert(before.library === 3, 'файл сохранился до подтверждения');

    const confirmed = await api<ImportResponse>('POST', '/api/import/confirm', {
      pendingToken: item.pendingToken,
    });
    const added = confirmed.items[0];
    assert(added?.outcome === 'added', `после подтверждения outcome=${added?.outcome}`);
    assert(added?.file?.ext === 'jpg', `формат после подтверждения ${added?.file?.ext}`);
    assert(added?.file?.similarToFileId === null, 'на подтверждённом файле осталась пометка дубля');
    idVariant1 = added?.file?.id ?? 0;
    const after = await api<StatsResponse>('GET', '/api/stats');
    assert(after.library === 4, `после подтверждения в библиотеке ${after.library} файлов`);
  });

  // 5 ────────────────────────────────────────────────────────────────────────
  await check('похожая картинка асинхронным путём → added_similar с similarToFileId', async () => {
    const result = await upload('/api/import/watch', [
      { name: 'plasma-alpha-watch.jpg', buffer: jpgVariant2 },
    ]);
    const item = result.items[0];
    assert(item?.outcome === 'added_similar', `outcome=${item?.outcome}`);
    assert(result.summary.similar === 1, 'сводка не посчитала похожий файл');
    idVariant2 = item?.file?.id ?? 0;
    const similarTo = item?.file?.similarToFileId ?? null;
    assert(similarTo !== null, 'не проставлен similarToFileId');
    assert([idAlpha, idVariant1].includes(similarTo), `similarToFileId=${similarTo}, ожидался ${idAlpha} или ${idVariant1}`);
    assert(item?.file?.sourceType === 'folder_watch', 'источник импорта записался неверно');

    const resolved = await api<FileRecord>('POST', `/api/files/${idVariant2}/resolve-similar`);
    assert(resolved.similarToFileId === null, 'пометка «возможный дубль» не снимается');
  });

  // 6 ────────────────────────────────────────────────────────────────────────
  await check('файл неподдерживаемого формата → error: unsupported_format', async () => {
    const result = await upload('/api/import', [{ name: 'document.png', buffer: notAnImage }], {
      sourceType: 'drag_drop',
    });
    const item = result.items[0];
    assert(item?.outcome === 'error', `outcome=${item?.outcome}`);
    assert(item?.errorCode === 'unsupported_format', `errorCode=${item?.errorCode}`);
    assert(result.summary.errors === 1, 'сводка не посчитала ошибку');
    const stats = await api<StatsResponse>('GET', '/api/stats');
    assert(stats.library === 5, `в библиотеке ${stats.library} файлов вместо 5`);
  });

  // 7 ────────────────────────────────────────────────────────────────────────
  await check('папка, перемещение, теги: файл уходит из «Не разобрано» (SET-05)', async () => {
    const folder = await api<FolderRecord>('POST', '/api/folders', { name: 'Референсы' });
    folderId = folder.id;
    assert(folderId > 0, 'папка не создалась');

    const untaggedBefore = await api<FileListResponse>('GET', '/api/files?scope=untagged&limit=100');
    assert(untaggedBefore.files.some((file) => file.id === idAlpha), 'новый файл не попал в «Не разобрано»');

    await api<FileRecord>('PATCH', `/api/files/${idAlpha}`, { folderId, tags: ['вдохновение'] });
    await api<{ moved: number }>('POST', '/api/files/move', { fileIds: [idBeta], folderId });

    const alpha = await api<FileRecord>('GET', `/api/files/${idAlpha}`);
    assert(alpha.folderId === folderId && alpha.tags.length === 1, 'файл не разложился');

    const untagged = await api<FileListResponse>('GET', '/api/files?scope=untagged&limit=100');
    assert(!untagged.files.some((file) => file.id === idAlpha), 'файл с папкой и тегом остался в «Не разобрано»');
    // OR, а не AND: папка есть, тегов нет — файл всё ещё неразобран.
    assert(untagged.files.some((file) => file.id === idBeta), 'файл с папкой, но без тегов, выпал из «Не разобрано»');

    const inFolder = await api<FileListResponse>('GET', `/api/files?folderId=${folderId}&limit=100`);
    assert(inFolder.total === 2, `в папке ${inFolder.total} файлов вместо 2`);
    const folders = await api<FolderRecord[]>('GET', '/api/folders');
    assert(folders[0]?.fileCount === 2, 'счётчик файлов в папке неверен');
  });

  // 8 ────────────────────────────────────────────────────────────────────────
  await check('нормализация тегов: «Дизайн» и «  дизайн » — один тег', async () => {
    const updated = await api<FileRecord>('PATCH', `/api/files/${idBeta}`, {
      tags: ['Дизайн', '  дизайн ', 'ДИЗАЙН', 'веб   дизайн'],
    });
    assert(updated.tags.includes('дизайн'), 'тег не нормализовался в нижний регистр');
    assert(updated.tags.filter((tag) => tag === 'дизайн').length === 1, 'тег продублировался');
    assert(updated.tags.includes('веб дизайн'), 'внутренние пробелы не схлопнулись');
    assert(updated.tags.length === 2, `тегов ${updated.tags.length} вместо 2`);
    const tags = await api<TagRecord[]>('GET', '/api/tags');
    assert(tags.filter((tag) => tag.name === 'дизайн').length === 1, 'в списке тегов дубликат');
  });

  // 9 ────────────────────────────────────────────────────────────────────────
  await check('корзина: удаление → trash, восстановление → та же папка и теги', async () => {
    const before = await api<FileRecord>('GET', `/api/files/${idAlpha}`);
    await api<{ deleted: number }>('POST', '/api/files/delete', { fileIds: [idAlpha] });

    const trash = await api<FileListResponse>('GET', '/api/files?scope=trash&limit=100');
    assert(trash.files.some((file) => file.id === idAlpha), 'файл не попал в корзину');
    const library = await api<FileListResponse>('GET', '/api/files?scope=library&limit=100');
    assert(!library.files.some((file) => file.id === idAlpha), 'удалённый файл виден в библиотеке');
    const untagged = await api<FileListResponse>('GET', '/api/files?scope=untagged&limit=100');
    assert(!untagged.files.some((file) => file.id === idAlpha), 'файл из корзины виден в «Не разобрано»');

    await api<{ restored: number }>('POST', '/api/files/restore', { fileIds: [idAlpha] });
    const after = await api<FileRecord>('GET', `/api/files/${idAlpha}`);
    assert(after.deletedAt === null, 'файл не восстановился');
    assert(after.folderId === before.folderId, 'папка после восстановления другая');
    assert(after.tags.join(',') === before.tags.join(','), 'теги после восстановления другие');
  });

  // 10 ───────────────────────────────────────────────────────────────────────
  await check('удаление папки: файлы живы, folderId = null, попали в «Не разобрано»', async () => {
    const child = await api<FolderRecord>('POST', '/api/folders', {
      name: 'Подпапка',
      parentFolderId: folderId,
    });
    await api<{ moved: number }>('POST', '/api/files/move', { fileIds: [idVariant1], folderId: child.id });

    await api<{ ok: boolean }>('DELETE', `/api/folders/${folderId}`);

    const folders = await api<FolderRecord[]>('GET', '/api/folders');
    assert(folders.length === 0, 'поддерево папок не удалилось');
    for (const id of [idAlpha, idBeta, idVariant1]) {
      const file = await api<FileRecord>('GET', `/api/files/${id}`);
      assert(file.folderId === null, `у файла ${id} осталась папка`);
      assert(file.deletedAt === null, `файл ${id} исчез вместе с папкой`);
    }
    const untagged = await api<FileListResponse>('GET', '/api/files?scope=untagged&limit=100');
    assert(untagged.files.some((file) => file.id === idAlpha), 'файл без папки не попал в «Не разобрано»');
  });

  // 11 ───────────────────────────────────────────────────────────────────────
  await check('поиск по имени, фильтр по тегу, по расширению, по диапазону дат', async () => {
    const byName = await api<FileListResponse>('GET', '/api/files?query=BETA&limit=100');
    assert(byName.total === 1 && byName.files[0]?.id === idBeta, `поиск по имени вернул ${byName.total}`);

    const byTag = await api<FileListResponse>('GET', '/api/files?tags=%D0%B2%D0%B4%D0%BE%D1%85%D0%BD%D0%BE%D0%B2%D0%B5%D0%BD%D0%B8%D0%B5&limit=100');
    assert(byTag.total === 1 && byTag.files[0]?.id === idAlpha, `фильтр по тегу вернул ${byTag.total}`);

    const twoTags = await api<FileListResponse>('GET', '/api/files?tags=дизайн,веб дизайн&limit=100');
    assert(twoTags.total === 1 && twoTags.files[0]?.id === idBeta, 'И-логика по тегам не работает');
    const impossible = await api<FileListResponse>('GET', '/api/files?tags=дизайн,вдохновение&limit=100');
    assert(impossible.total === 0, 'И-логика по тегам ведёт себя как ИЛИ');

    const byExt = await api<FileListResponse>('GET', '/api/files?exts=jpg&limit=100');
    assert(byExt.total === 2, `фильтр по расширению вернул ${byExt.total} вместо 2`);
    assert(byExt.files.every((file) => file.ext === 'jpg'), 'в выдаче не только jpg');

    const today = new Date().toISOString().slice(0, 10);
    const inRange = await api<FileListResponse>('GET', `/api/files?dateFrom=${today}&dateTo=${today}&limit=100`);
    assert(inRange.total === 5, `за сегодня ${inRange.total} файлов вместо 5`);
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const future = await api<FileListResponse>('GET', `/api/files?dateFrom=${tomorrow}&limit=100`);
    assert(future.total === 0, 'диапазон дат не отсекает будущее');

    const sorted = await api<FileListResponse>('GET', '/api/files?sort=name_asc&limit=2');
    assert(sorted.files.length === 2 && sorted.nextCursor !== null, 'пагинация не отдала курсор');
    const nextPage = await api<FileListResponse>(
      'GET',
      `/api/files?sort=name_asc&limit=2&cursor=${encodeURIComponent(sorted.nextCursor ?? '')}`,
    );
    assert(nextPage.files.length > 0, 'вторая страница пустая');
    const firstIds = new Set(sorted.files.map((file) => file.id));
    assert(nextPage.files.every((file) => !firstIds.has(file.id)), 'страницы пересекаются');
  });

  // Дополнительно: защита от постинга со стороннего сайта.
  await check('CORS: запрос со стороннего origin отклоняется, расширение — пускается', async () => {
    const evil = await fetch(`${base}/api/stats`, { headers: { Origin: 'https://evil.example' } });
    assert(evil.status === 403, `сторонний origin получил ${evil.status}`);
    const extension = await fetch(`${base}/api/stats`, {
      headers: { Origin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop' },
    });
    assert(extension.status === 200, `расширение получило ${extension.status}`);
    assert(
      extension.headers.get('access-control-allow-origin') === 'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
      'нет заголовка CORS для расширения',
    );
  });

  // Дополнительно: окончательное удаление стирает файлы с диска.
  await check('окончательное удаление стирает оригинал и превью с диска', async () => {
    const file = await api<FileRecord>('GET', `/api/files/${idVariant2}`);
    const shard = path.join(libraryPath, 'originals', file.sha256.slice(0, 2), file.sha256.slice(2, 4));
    const original = path.join(shard, `${file.sha256}.${file.ext}`);
    assert(fs.existsSync(original), 'оригинал не найден на диске до удаления');
    await api<{ deleted: number }>('POST', '/api/files/delete', { fileIds: [idVariant2] });
    await api<{ purged: number }>('POST', '/api/files/purge', { fileIds: [idVariant2] });
    assert(!fs.existsSync(original), 'оригинал остался на диске');
    const preview = path.join(
      libraryPath,
      'previews',
      file.sha256.slice(0, 2),
      file.sha256.slice(2, 4),
      `${file.sha256}.webp`,
    );
    assert(!fs.existsSync(preview), 'превью осталось на диске');
    const stats = await api<StatsResponse>('GET', '/api/stats');
    assert(stats.library === 4 && stats.trash === 0, `после очистки library=${stats.library}, trash=${stats.trash}`);
  });

  // Дополнительно: SVG принимается без превью и участвует только в проверке точного дубля.
  await check('SVG: принят без превью, точный дубль ловится', async () => {
    const svg = Buffer.from(
      `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><rect width="200" height="120" fill="#123456"/><circle cx="60" cy="60" r="40" fill="#ffcc00"/></svg>\n`,
      'utf8',
    );
    const result = await upload('/api/import', [{ name: 'logo.svg', buffer: svg }], {
      sourceType: 'drag_drop',
    });
    const file = result.items[0]?.file;
    assert(result.items[0]?.outcome === 'added', `outcome=${result.items[0]?.outcome}`);
    assert(file?.ext === 'svg', `ext=${file?.ext}`);
    assert(file?.previewUrl === null && file.hasPreview === false, 'у SVG появилось превью');
    assert(file?.isBroken === false, 'SVG помечен как битый');
    assert(file?.phash === null, 'для SVG посчитан перцептивный хэш');
    const original = await fetch(`${base}/api/files/${file?.id}/original`);
    assert(original.headers.get('content-type') === 'image/svg+xml', 'SVG отдаётся с чужим Content-Type');
    const again = await upload('/api/import', [{ name: 'logo-copy.svg', buffer: svg }], {
      sourceType: 'drag_drop',
    });
    assert(again.items[0]?.outcome === 'duplicate', 'точный дубль SVG не отловлен');
  });

  // Дополнительно: GIF — превью статичным кадром.
  await check('GIF: принят, превью статичное', async () => {
    const gif = await plasma(5).gif().toBuffer();
    const result = await upload('/api/import', [{ name: 'motion.gif', buffer: gif }], {
      sourceType: 'clipboard',
    });
    const file = result.items[0]?.file;
    assert(result.items[0]?.outcome === 'added', `outcome=${result.items[0]?.outcome}`);
    assert(file?.ext === 'gif' && file.hasPreview, 'GIF без превью');
    const preview = await fetch(`${base}/api/files/${file?.id}/preview`);
    const meta = await sharp(Buffer.from(await preview.arrayBuffer()), { animated: true }).metadata();
    assert((meta.pages ?? 1) === 1, `в превью ${meta.pages} кадров вместо одного`);
  });

  // Дополнительно: SVC-03 — битый файл принимается, импорт не падает.
  await check('битый растр: принят с is_broken, импорт не падает', async () => {
    const broken = Buffer.concat([pngBeta.subarray(0, 40), Buffer.alloc(2048, 0x5a)]);
    const result = await upload('/api/import', [{ name: 'broken.png', buffer: broken }], {
      sourceType: 'drag_drop',
    });
    const file = result.items[0]?.file;
    assert(result.items[0]?.outcome === 'added', `outcome=${result.items[0]?.outcome}`);
    assert(file?.isBroken === true, 'битый файл не помечен');
    assert(file?.hasPreview === false && file.previewUrl === null, 'у битого файла есть превью');
  });

  // Дополнительно: IMP-05 — лимит 50 МБ.
  await check('файл больше 50 МБ → error: too_large', async () => {
    const huge = Buffer.alloc(51 * 1024 * 1024, 0x42);
    const result = await upload('/api/import', [{ name: 'huge.png', buffer: huge }], {
      sourceType: 'drag_drop',
    });
    assert(result.items[0]?.errorCode === 'too_large', `errorCode=${result.items[0]?.errorCode}`);
  });

  // Дополнительно: CAP-01 — сервер сам скачивает картинку по URL.
  await check('импорт по URL (контекстное меню) → added с sourceUrl', async () => {
    const payload = await plasma(3).png().toBuffer();
    const origin = http.createServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': payload.length });
      response.end(payload);
    });
    await new Promise<void>((resolve) => origin.listen(0, '127.0.0.1', () => resolve()));
    const address = origin.address();
    const originPort = typeof address === 'object' && address !== null ? address.port : 0;
    try {
      const result = await api<ImportResponse>('POST', '/api/import/url', {
        imageUrl: `http://127.0.0.1:${originPort}/shot.png`,
        pageUrl: 'https://example.com/article',
        sourceType: 'context_menu',
      });
      const file = result.items[0]?.file;
      assert(result.items[0]?.outcome === 'added', `outcome=${result.items[0]?.outcome}`);
      assert(file?.originalFilename === 'shot.png', `имя файла ${file?.originalFilename}`);
      assert(file?.sourceType === 'context_menu' && file.sourceUrl === 'https://example.com/article', 'источник записан неверно');
    } finally {
      await new Promise<void>((resolve) => origin.close(() => resolve()));
    }
  });

  // Дополнительно: CAP-02 — скриншот вкладки приходит data:URL-ом.
  await check('импорт скриншота из data:URL → added', async () => {
    const payload = await plasma(4).png().toBuffer();
    const result = await api<ImportResponse>('POST', '/api/import/capture', {
      dataUrl: `data:image/png;base64,${payload.toString('base64')}`,
      pageUrl: 'https://example.com/page',
      suggestedFilename: 'tab-shot.png',
      sourceType: 'tab_screenshot',
    });
    const file = result.items[0]?.file;
    assert(result.items[0]?.outcome === 'added', `outcome=${result.items[0]?.outcome}`);
    assert(file?.sourceType === 'tab_screenshot', 'источник записан неверно');
    assert(file?.originalFilename === 'tab-shot.png', `имя файла ${file?.originalFilename}`);
  });

  // Дополнительно: SVC-06 — занятый порт объясняется словами, а не стектрейсом.
  await check('SVC-06: второй экземпляр на занятом порту не стартует и объясняет причину', async () => {
    const second = spawnServer();
    let stderrText = '';
    second.stderr?.on('data', (chunk: Buffer) => (stderrText += chunk.toString()));
    const code = await new Promise<number | null>((resolve) => second.on('exit', (value) => resolve(value)));
    assert(code === 1, `код выхода ${code}, ожидался 1`);
    assert(stderrText.includes(`Порт ${port}`), 'в сообщении нет номера порта');
    assert(stderrText.includes('serverPort'), 'в сообщении не сказано, как сменить порт');
  });

  // Дополнительно: автоочистка корзины при старте (проверка последняя — она перезапускает сервер).
  await check('автоочистка: файлы в корзине старше 30 дней удаляются при старте', async () => {
    const beta = await api<FileRecord>('GET', `/api/files/${idBeta}`);
    await api<{ deleted: number }>('POST', '/api/files/delete', { fileIds: [idBeta] });
    const original = path.join(
      libraryPath,
      'originals',
      beta.sha256.slice(0, 2),
      beta.sha256.slice(2, 4),
      `${beta.sha256}.${beta.ext}`,
    );
    assert(fs.existsSync(original), 'оригинал не найден до автоочистки');

    child.kill('SIGTERM');
    await new Promise<void>((resolve) => child.on('exit', () => resolve()));

    const db = new Database(path.join(libraryPath, 'library.db'));
    db.prepare('UPDATE files SET deleted_at = ? WHERE id = ?').run(
      new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
      idBeta,
    );
    db.close();

    child = spawnServer();
    assert(await waitHealth(), 'сервер не перезапустился');
    const stats = await api<StatsResponse>('GET', '/api/stats');
    assert(stats.trash === 0, `в корзине осталось ${stats.trash} файлов`);
    assert(!fs.existsSync(original), 'оригинал остался на диске после автоочистки');
  });

  child.kill('SIGTERM');
  await sleep(300);
  fs.rmSync(scratch, { recursive: true, force: true });

  process.stdout.write(`\n${failures === 0 ? 'Все проверки прошли' : `Проваленных проверок: ${failures}`}\n`);
  if (failures > 0) {
    process.stdout.write(`\n--- вывод сервера ---\n${serverLog}\n`);
    process.exit(1);
  }
  process.exit(0);
}

void main().catch((error: unknown) => {
  process.stdout.write(`✗ прогон упал: ${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
