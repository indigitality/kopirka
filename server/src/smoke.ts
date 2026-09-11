/**
 * Дымовой прогон сервера через реальный HTTP на временной библиотеке.
 * Запуск: npm run smoke --workspace=server
 * Ничего не пишет ни в ~/Pictures, ни в ~/Library/Application Support — только во временную папку.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import sharp from 'sharp';
import type {
  ApiError,
  EventsResponse,
  FileExportResponse,
  FileListResponse,
  FileRecord,
  FolderRecord,
  ImportEvent,
  ImportResponse,
  NoticeEvent,
  NotifyResponse,
  RevealResponse,
  SettingsResponse,
  SettingsUpdateResponse,
  StatsResponse,
  TagRecord,
} from '../../shared/api.js';
import { resolveStaticCandidate } from './app.js';
import { defaultLibraryPathFor, expandHomeWith, supportDirFor } from './config.js';

const SERVER_DIR = fileURLToPath(new URL('..', import.meta.url));
const APP_DIR = path.resolve(SERVER_DIR, '..');
/**
 * Сервер поднимаем тем же node, которым запущен сам прогон, и напрямую через cli.mjs
 * из tsx — а не через node_modules/.bin/tsx. В .bin лежит шелл-шим без расширения:
 * на Windows spawn такого файла даёт ENOENT (там исполняемым был бы tsx.cmd).
 * Тот же приём уже работает в tests/ui/lib/processes.mjs.
 */
const NODE_BIN = process.execPath;
const TSX_CLI = path.join(APP_DIR, 'node_modules', 'tsx', 'dist', 'cli.mjs');

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

/** Лента разнородная — сужаем до записей об импорте. */
const importEvents = (response: EventsResponse): ImportEvent[] =>
  response.events.filter((event): event is ImportEvent => event.kind === 'import');

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
    const process_ = spawn(NODE_BIN, [TSX_CLI, path.join(SERVER_DIR, 'src', 'index.ts')], {
      cwd: SERVER_DIR,
      env: {
        ...process.env,
        KOPIRKA_CONFIG_DIR: configDir,
        KOPIRKA_NO_OPEN: '1',
        KOPIRKA_QUIET: '1',
        // Ни Finder/Explorer, ни буфер обмена человека проверка трогать не должна.
        KOPIRKA_NO_SHELL: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    process_.stdout?.on('data', (chunk: Buffer) => (serverLog += chunk.toString()));
    process_.stderr?.on('data', (chunk: Buffer) => (serverLog += chunk.toString()));
    return process_;
  };

  /**
   * Останов сервера. macOS — SIGTERM, как и раньше. На Windows сигналов нет: kill там
   * сводится к TerminateProcess и убивает только прямого потомка, а tsx запускает
   * настоящий сервер отдельным процессом — иначе он остался бы держать порт, и проверки
   * перезапуска стали бы ложно-красными. Поэтому на Windows гасим дерево через taskkill.
   */
  const stopServer = (target: ChildProcess): void => {
    if (target.exitCode !== null || target.signalCode !== null) return;
    if (process.platform !== 'win32') {
      target.kill('SIGTERM');
      return;
    }
    if (target.pid === undefined) return;
    spawnSync('taskkill', ['/PID', String(target.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
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
    if (!child.killed) stopServer(child);
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
  const jpgVariant3 = await sharp(pngAlpha).resize(408, 306).jpeg({ quality: 65 }).toBuffer();
  const notAnImage = Buffer.from('%PDF-1.7\n%mock document, not an image\n', 'utf8');

  let idAlpha = 0;
  let idBeta = 0;
  let idGamma = 0;
  let idVariant1 = 0;
  let idVariant2 = 0;
  let idSvg = 0;
  let folderId = 0;
  let subFolderId = 0;

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
    idGamma = files[2]?.id ?? 0;
    assert(idAlpha > 0 && idBeta > 0 && idGamma > 0, 'не вернулись id файлов');
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
  });

  // 6 ────────────────────────────────────────────────────────────────────────
  await check('IMP-01: фильтр hasSimilar и счётчик stats.similar, resolve-similar их обнуляет', async () => {
    const before = await api<StatsResponse>('GET', '/api/stats');
    assert(before.similar === 1, `stats.similar=${before.similar}, ожидалась 1`);

    const marked = await api<FileListResponse>('GET', '/api/files?hasSimilar=1&limit=100');
    assert(marked.total === 1 && marked.files[0]?.id === idVariant2, `hasSimilar вернул ${marked.total} файлов вместо 1`);
    const all = await api<FileListResponse>('GET', '/api/files?limit=100');
    assert(all.total > marked.total, 'hasSimilar не сузил выдачу');

    const resolved = await api<FileRecord>('POST', `/api/files/${idVariant2}/resolve-similar`);
    assert(resolved.similarToFileId === null, 'пометка «возможный дубль» не снимается');

    const after = await api<StatsResponse>('GET', '/api/stats');
    assert(after.similar === 0, `после снятия пометки stats.similar=${after.similar}`);
    const empty = await api<FileListResponse>('GET', '/api/files?hasSimilar=true&limit=100');
    assert(empty.total === 0, `hasSimilar всё ещё возвращает ${empty.total} файлов`);
  });

  // 7 ────────────────────────────────────────────────────────────────────────
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

  // 8 ────────────────────────────────────────────────────────────────────────
  await check('«Не разобрано» — это файлы без папки, теги не в счёт (SET-05 от 02.09.2026)', async () => {
    const folder = await api<FolderRecord>('POST', '/api/folders', { name: 'Референсы' });
    folderId = folder.id;
    assert(folderId > 0, 'папка не создалась');

    const untaggedBefore = await api<FileListResponse>('GET', '/api/files?scope=untagged&limit=100');
    assert(untaggedBefore.files.some((file) => file.id === idAlpha), 'новый файл не попал в «Не разобрано»');

    await api<FileRecord>('PATCH', `/api/files/${idAlpha}`, { folderId, tags: ['вдохновение'] });
    await api<{ moved: number }>('POST', '/api/files/move', { fileIds: [idBeta], folderId });
    // Тег без папки разобранным файл не делает.
    await api<FileRecord>('PATCH', `/api/files/${idGamma}`, { tags: ['ссылка'] });

    const alpha = await api<FileRecord>('GET', `/api/files/${idAlpha}`);
    assert(alpha.folderId === folderId && alpha.tags.length === 1, 'файл не разложился');

    const untagged = await api<FileListResponse>('GET', '/api/files?scope=untagged&limit=100');
    assert(!untagged.files.some((file) => file.id === idAlpha), 'файл с папкой и тегом остался в «Не разобрано»');
    // Правило считает только папку: папка есть, тегов нет — файл разобран.
    assert(!untagged.files.some((file) => file.id === idBeta), 'файл с папкой, но без тегов, остался в «Не разобрано»');
    assert(untagged.files.some((file) => file.id === idGamma), 'файл без папки, но с тегом, выпал из «Не разобрано»');

    // Счётчик сайдбара и список считаются одной и той же функцией.
    const stats = await api<StatsResponse>('GET', '/api/stats');
    assert(stats.untagged === untagged.total, `счётчик «Не разобрано» ${stats.untagged} против списка ${untagged.total}`);

    const inFolder = await api<FileListResponse>('GET', `/api/files?folderId=${folderId}&limit=100`);
    assert(inFolder.total === 2, `в папке ${inFolder.total} файлов вместо 2`);
    const folders = await api<FolderRecord[]>('GET', '/api/folders');
    assert(folders[0]?.fileCount === 2, 'счётчик файлов в папке неверен');
  });

  // 9 ────────────────────────────────────────────────────────────────────────
  await check('папка показывает всё поддерево, totalFileCount суммарный (решение 02.09.2026)', async () => {
    const child = await api<FolderRecord>('POST', '/api/folders', {
      name: 'Наброски',
      parentFolderId: folderId,
    });
    subFolderId = child.id;
    assert(child.fileCount === 0 && child.totalFileCount === 0, 'у новой папки ненулевые счётчики');
    await api<{ moved: number }>('POST', '/api/files/move', { fileIds: [idGamma], folderId: subFolderId });

    const parent = await api<FileListResponse>('GET', `/api/files?folderId=${folderId}&limit=100`);
    assert(parent.total === 3, `родительская папка показывает ${parent.total} файлов вместо 3`);
    assert(parent.files.some((file) => file.id === idGamma), 'файл из подпапки не виден при запросе родителя');

    const inChild = await api<FileListResponse>('GET', `/api/files?folderId=${subFolderId}&limit=100`);
    assert(inChild.total === 1 && inChild.files[0]?.id === idGamma, `в подпапке ${inChild.total} файлов вместо 1`);

    const folders = await api<FolderRecord[]>('GET', '/api/folders');
    const root = folders.find((item) => item.id === folderId);
    assert(root?.fileCount === 2, `fileCount родителя ${root?.fileCount} вместо 2 — это только свои файлы`);
    assert(root?.totalFileCount === 3, `totalFileCount родителя ${root?.totalFileCount} вместо 3 — свои плюс вложенные`);
    const nested = root?.children[0];
    assert(
      nested?.id === subFolderId && nested.fileCount === 1 && nested.totalFileCount === 1,
      'счётчики подпапки неверны',
    );

    // total и курсор считаются по тому же поддереву, что и страница.
    const firstPage = await api<FileListResponse>('GET', `/api/files?folderId=${folderId}&sort=name_asc&limit=2`);
    assert(
      firstPage.total === 3 && firstPage.files.length === 2 && firstPage.nextCursor !== null,
      'постраничность по поддереву сломана',
    );
    const secondPage = await api<FileListResponse>(
      'GET',
      `/api/files?folderId=${folderId}&sort=name_asc&limit=2&cursor=${encodeURIComponent(firstPage.nextCursor ?? '')}`,
    );
    assert(secondPage.total === 3 && secondPage.files.length === 1, 'вторая страница поддерева неверна');
    const firstIds = new Set(firstPage.files.map((file) => file.id));
    assert(secondPage.files.every((file) => !firstIds.has(file.id)), 'страницы поддерева пересекаются');

    // Несуществующая папка — пустой список, а не ошибка: поведение сохранено.
    const missing = await api<FileListResponse>('GET', '/api/files?folderId=999999&limit=100');
    assert(missing.total === 0 && missing.files.length === 0, 'несуществующая папка вернула файлы');
  });

  // 10 ───────────────────────────────────────────────────────────────────────
  await check('подтверждение похожего дубля сохраняет папку исходного запроса', async () => {
    const result = await upload('/api/import', [{ name: 'plasma-alpha-third.jpg', buffer: jpgVariant3 }], {
      sourceType: 'drag_drop',
      folderId: String(subFolderId),
    });
    const item = result.items[0];
    assert(item?.outcome === 'needs_confirmation', `outcome=${item?.outcome}`);

    const confirmed = await api<ImportResponse>('POST', '/api/import/confirm', {
      pendingToken: item?.pendingToken ?? '',
    });
    const added = confirmed.items[0];
    assert(added?.outcome === 'added', `после подтверждения outcome=${added?.outcome} (${added?.errorMessage})`);
    assert(added?.file?.folderId === subFolderId, `файл лёг в папку ${added?.file?.folderId} вместо ${subFolderId}`);

    // Проверка самодостаточна: файл убираем, чтобы не смещать счётчики следующих проверок.
    const id = added?.file?.id ?? 0;
    await api<{ deleted: number }>('POST', '/api/files/delete', { fileIds: [id] });
    await api<{ purged: number }>('POST', '/api/files/purge', { fileIds: [id] });
  });

  // 11 ───────────────────────────────────────────────────────────────────────
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

  // 12 ───────────────────────────────────────────────────────────────────────
  await check('корзина: удаление → trash, восстановление → та же папка и теги', async () => {
    const before = await api<FileRecord>('GET', `/api/files/${idAlpha}`);
    await api<{ deleted: number }>('POST', '/api/files/delete', { fileIds: [idAlpha] });

    const trash = await api<FileListResponse>('GET', '/api/files?scope=trash&limit=100');
    assert(trash.files.some((file) => file.id === idAlpha), 'файл не попал в корзину');
    const library = await api<FileListResponse>('GET', '/api/files?scope=library&limit=100');
    assert(!library.files.some((file) => file.id === idAlpha), 'удалённый файл виден в библиотеке');

    // Корзина в «Не разобрано» не попадает — проверяем на файле, у которого папки и так нет.
    await api<{ deleted: number }>('POST', '/api/files/delete', { fileIds: [idVariant1] });
    const untagged = await api<FileListResponse>('GET', '/api/files?scope=untagged&limit=100');
    assert(!untagged.files.some((file) => file.id === idVariant1), 'файл из корзины виден в «Не разобрано»');
    await api<{ restored: number }>('POST', '/api/files/restore', { fileIds: [idVariant1] });

    await api<{ restored: number }>('POST', '/api/files/restore', { fileIds: [idAlpha] });
    const after = await api<FileRecord>('GET', `/api/files/${idAlpha}`);
    assert(after.deletedAt === null, 'файл не восстановился');
    assert(after.folderId === before.folderId, 'папка после восстановления другая');
    assert(after.tags.join(',') === before.tags.join(','), 'теги после восстановления другие');
  });

  // 13 ───────────────────────────────────────────────────────────────────────
  await check('удаление папки: файлы живы, folderId = null, попали в «Не разобрано»', async () => {
    const child = await api<FolderRecord>('POST', '/api/folders', {
      name: 'Подпапка',
      parentFolderId: folderId,
    });
    await api<{ moved: number }>('POST', '/api/files/move', { fileIds: [idVariant1], folderId: child.id });

    await api<{ ok: boolean }>('DELETE', `/api/folders/${folderId}`);

    const folders = await api<FolderRecord[]>('GET', '/api/folders');
    assert(folders.length === 0, 'поддерево папок не удалилось');
    for (const id of [idAlpha, idBeta, idGamma, idVariant1]) {
      const file = await api<FileRecord>('GET', `/api/files/${id}`);
      assert(file.folderId === null, `у файла ${id} осталась папка`);
      assert(file.deletedAt === null, `файл ${id} исчез вместе с папкой`);
    }
    const untagged = await api<FileListResponse>('GET', '/api/files?scope=untagged&limit=100');
    assert(untagged.files.some((file) => file.id === idAlpha), 'файл без папки не попал в «Не разобрано»');
  });

  // 13a ──────────────────────────────────────────────────────────────────────
  await check('NEW-03: перенос папки — вложить, в корень, порядок, цикл → 409', async () => {
    const mk = (name: string, parentFolderId: number | null = null) =>
      api<FolderRecord>('POST', '/api/folders', { name, parentFolderId });
    const roots = async () => {
      const tree = await api<FolderRecord[]>('GET', '/api/folders');
      return tree.map((item) => item.name);
    };

    const alpha = await mk('Альфа');
    const beta = await mk('Бета');
    const gamma = await mk('Гамма');
    const inner = await mk('Альфа-1', alpha.id);
    assert(
      (await roots()).join(',') === 'Альфа,Бета,Гамма',
      `исходный порядок корня: ${(await roots()).join(',')}`,
    );

    // (а) вложить: «Гамма» уезжает внутрь «Альфы» первой, выше уже лежащей «Альфа-1».
    const moved = await api<FolderRecord>('PATCH', `/api/folders/${gamma.id}/move`, {
      parentId: alpha.id,
      index: 0,
    });
    assert(moved.parentFolderId === alpha.id, `после переноса родитель ${moved.parentFolderId}`);
    const afterInto = await api<FolderRecord[]>('GET', '/api/folders');
    const alphaNode = afterInto.find((item) => item.id === alpha.id);
    assert(
      alphaNode?.children.map((child) => child.name).join(',') === 'Гамма,Альфа-1',
      `порядок внутри «Альфы»: ${alphaNode?.children.map((child) => child.name).join(',')}`,
    );
    assert((await roots()).join(',') === 'Альфа,Бета', 'папка осталась и в корне');

    // (б) в корень, между строками: «Гамма» возвращается наверх, выше «Альфы».
    await api<FolderRecord>('PATCH', `/api/folders/${gamma.id}/move`, { parentId: null, index: 0 });
    assert((await roots()).join(',') === 'Гамма,Альфа,Бета', `порядок корня: ${(await roots()).join(',')}`);

    // Индекс за границей списка прижимается к краю, а не ломает перенос.
    await api<FolderRecord>('PATCH', `/api/folders/${gamma.id}/move`, { parentId: null, index: 99 });
    assert((await roots()).join(',') === 'Альфа,Бета,Гамма', `порядок после клампа: ${(await roots()).join(',')}`);

    // (в) цикл: в собственного потомка и в саму себя — 409 folder_cycle, дерево не тронуто.
    for (const [label, target] of [
      ['в потомка', inner.id],
      ['в саму себя', alpha.id],
    ] as Array<[string, number]>) {
      const response = await fetch(`${base}/api/folders/${alpha.id}/move`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId: target, index: 0 }),
      });
      assert(response.status === 409, `перенос ${label} вернул ${response.status}`);
      const body = (await response.json()) as ApiError;
      assert(body.code === 'folder_cycle', `код ошибки ${label}: ${body.code}`);
    }
    const intact = await api<FolderRecord[]>('GET', '/api/folders');
    assert(
      intact.find((item) => item.id === alpha.id)?.parentFolderId === null,
      'после отказа «Альфа» всё же переехала',
    );

    for (const item of [alpha, beta, gamma]) {
      await api<{ ok: boolean }>('DELETE', `/api/folders/${item.id}`);
    }
    assert((await api<FolderRecord[]>('GET', '/api/folders')).length === 0, 'папки прогона не убрались');
  });

  // 14 ───────────────────────────────────────────────────────────────────────
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
    idSvg = file?.id ?? 0;
    const original = await fetch(`${base}/api/files/${file?.id}/original`);
    assert(original.headers.get('content-type') === 'image/svg+xml', 'SVG отдаётся с чужим Content-Type');
    const again = await upload('/api/import', [{ name: 'logo-copy.svg', buffer: svg }], {
      sourceType: 'drag_drop',
    });
    assert(again.items[0]?.outcome === 'duplicate', 'точный дубль SVG не отловлен');
  });

  /**
   * Дополнительно: LIB-06 — «выход в работу». Сам вызов системной утилиты подменён
   * KOPIRKA_NO_SHELL: настоящий Finder/Explorer в проверке открывать нечего, а буфер
   * обмена принадлежит человеку, который запустил прогон. Проверяем то, что от платформы
   * не зависит: маршрутизацию, разбор id, обе ветви (растр и SVG) и коды ошибок.
   */
  await check('LIB-06: reveal и copy отвечают на растр, на SVG, на чужой id и на пропавший файл', async () => {
    const reveal = await api<RevealResponse>('POST', `/api/files/${idAlpha}/reveal`);
    assert(reveal.ok === true, 'reveal не вернул ok');
    const copyRaster = await api<RevealResponse>('POST', `/api/files/${idAlpha}/copy`);
    assert(copyRaster.ok === true, 'copy растра не вернул ok');
    assert(idSvg > 0, 'не нашли id SVG из предыдущей проверки');
    // SVG идёт другой ветвью — как текст, без превращения в PNG.
    const copySvg = await api<RevealResponse>('POST', `/api/files/${idSvg}/copy`);
    assert(copySvg.ok === true, 'copy SVG не вернул ok');

    for (const action of ['reveal', 'copy']) {
      const response = await fetch(`${base}/api/files/999999/${action}`, { method: 'POST' });
      assert(response.status === 404, `${action} чужого id вернул ${response.status}`);
      const body = (await response.json()) as ApiError;
      assert(body.code === 'file_not_found', `${action} чужого id: code=${body.code}`);
    }

    // Файл есть в базе, но пропал с диска: строку прятать некуда, поэтому просто
    // уводим оригинал в сторону и возвращаем обратно.
    const file = await api<FileRecord>('GET', `/api/files/${idAlpha}`);
    const original = path.join(
      libraryPath,
      'originals',
      file.sha256.slice(0, 2),
      file.sha256.slice(2, 4),
      `${file.sha256}.${file.ext}`,
    );
    const parked = `${original}.parked`;
    fs.renameSync(original, parked);
    try {
      for (const action of ['reveal', 'copy']) {
        const response = await fetch(`${base}/api/files/${idAlpha}/${action}`, { method: 'POST' });
        assert(response.status === 404, `${action} пропавшего файла вернул ${response.status}`);
        const body = (await response.json()) as ApiError;
        assert(body.code === 'original_missing', `${action} пропавшего файла: code=${body.code}`);
      }
    } finally {
      fs.renameSync(parked, original);
    }
  });

  /**
   * Дополнительно: FDB-04 — второй размер превью. Проверяем лень (файла нет, пока
   * его не попросили), кэш (второй запрос не пересоздаёт), отсечку для мелких
   * картинок (увеличивать нечего) и уборку обоих превью при окончательном удалении.
   */
  await check('FDB-04: превью 2x строится лениво, кэшируется и уходит вместе с файлом', async () => {
    // Плазма 480×360 меньше обычного превью — крупное ей не положено.
    const smallPreview2x = await fetch(`${base}/api/files/${idAlpha}/preview?size=2x`);
    assert(smallPreview2x.status === 200, `мелкая картинка: статус ${smallPreview2x.status}`);
    const smallMeta = await sharp(Buffer.from(await smallPreview2x.arrayBuffer())).metadata();
    assert((smallMeta.width ?? 0) <= 600, `мелкой картинке отдали ${smallMeta.width}px вместо обычного превью`);
    const alphaRow = await api<FileRecord>('GET', `/api/files/${idAlpha}`);
    const small2xPath = path.join(
      libraryPath,
      'previews',
      alphaRow.sha256.slice(0, 2),
      alphaRow.sha256.slice(2, 4),
      `${alphaRow.sha256}@2x.webp`,
    );
    assert(!fs.existsSync(small2xPath), 'для мелкой картинки зря создали файл @2x');

    // Крупный оригинал: 1800×1350, обычное превью ужимает его до 600. Сид 13 —
    // свой, чтобы плазма не оказалась похожей ни на один уже загруженный узор
    // (иначе IMP-01 увёл бы импорт в needs_confirmation).
    const big = await plasma(13).resize(1800, 1350, { kernel: 'cubic' }).png().toBuffer();
    const imported = await upload('/api/import', [{ name: 'plasma-huge.png', buffer: big }], {
      sourceType: 'drag_drop',
    });
    const bigFile = imported.items[0]?.file as FileRecord | undefined;
    assert(
      bigFile !== undefined && bigFile.id > 0,
      `крупный файл не импортировался: ${JSON.stringify(imported.items[0])}`,
    );
    assert(bigFile.width === 1800 && bigFile.height === 1350, `размеры ${bigFile.width}×${bigFile.height}`);

    const shard = path.join(libraryPath, 'previews', bigFile.sha256.slice(0, 2), bigFile.sha256.slice(2, 4));
    const preview1x = path.join(shard, `${bigFile.sha256}.webp`);
    const preview2x = path.join(shard, `${bigFile.sha256}@2x.webp`);
    assert(fs.existsSync(preview1x), 'обычное превью не появилось при импорте');
    assert(!fs.existsSync(preview2x), 'крупное превью создалось до первого запроса — лень сломана');

    const hiDpi = await fetch(`${base}/api/files/${bigFile.id}/preview?size=2x`);
    assert(hiDpi.status === 200, `крупное превью отдалось со статусом ${hiDpi.status}`);
    assert(hiDpi.headers.get('content-type') === 'image/webp', 'крупное превью не webp');
    const hiMeta = await sharp(Buffer.from(await hiDpi.arrayBuffer())).metadata();
    assert(Math.max(hiMeta.width ?? 0, hiMeta.height ?? 0) === 1400, `крупная сторона ${hiMeta.width}×${hiMeta.height}, ожидалось 1400`);
    assert(fs.existsSync(preview2x), 'крупное превью не легло рядом с обычным');

    // Второй запрос идёт из кэша: файл не пересоздаётся.
    const mtime = fs.statSync(preview2x).mtimeMs;
    const again = await fetch(`${base}/api/files/${bigFile.id}/preview?size=2x`);
    assert(again.status === 200, `повторный запрос: статус ${again.status}`);
    await again.arrayBuffer();
    assert(fs.statSync(preview2x).mtimeMs === mtime, 'крупное превью пересоздали вместо отдачи из кэша');

    // Без параметра — по-прежнему обычные 600.
    const plain = await fetch(`${base}/api/files/${bigFile.id}/preview`);
    const plainMeta = await sharp(Buffer.from(await plain.arrayBuffer())).metadata();
    assert(Math.max(plainMeta.width ?? 0, plainMeta.height ?? 0) === 600, 'обычное превью перестало быть 600px');

    // Окончательное удаление уносит оба превью и оригинал.
    await api<{ deleted: number }>('POST', '/api/files/delete', { fileIds: [bigFile.id] });
    await api<{ purged: number }>('POST', '/api/files/purge', { fileIds: [bigFile.id] });
    assert(!fs.existsSync(preview1x), 'обычное превью осталось на диске');
    assert(!fs.existsSync(preview2x), 'крупное превью осталось на диске');
  });

  /**
   * Дополнительно: FDB-05 — экспорт оригиналов в обычную папку. Проверяем то, ради
   * чего эндпоинт и писался: имена как у оригиналов, совпадения разводятся
   * суффиксом, папка назначения не может быть ни относительной, ни внутри
   * библиотеки, а не выгруженные файлы возвращаются списком с причиной.
   */
  await check('FDB-05: экспорт в папку — имена, коллизии, отказы и проверки targetDir', async () => {
    const outDir = path.join(scratch, 'export-out');
    fs.mkdirSync(outDir, { recursive: true });

    const alpha = await api<FileRecord>('GET', `/api/files/${idAlpha}`);
    const beta = await api<FileRecord>('GET', `/api/files/${idBeta}`);

    const first = await api<FileExportResponse>('POST', '/api/files/export', {
      fileIds: [idAlpha, idBeta],
      targetDir: outDir,
    });
    assert(first.exported === 2, `exported=${first.exported}, ожидалось 2`);
    assert(first.failed.length === 0, `failed=${JSON.stringify(first.failed)}`);
    assert(fs.existsSync(path.join(outDir, alpha.originalFilename)), 'первый файл не лёг под своим именем');
    assert(fs.existsSync(path.join(outDir, beta.originalFilename)), 'второй файл не лёг под своим именем');
    assert(
      fs.statSync(path.join(outDir, alpha.originalFilename)).size === alpha.sizeBytes,
      'размер копии не совпал с оригиналом',
    );

    // Повтор в ту же папку — имя занято, значит «имя (2).ext».
    const again = await api<FileExportResponse>('POST', '/api/files/export', {
      fileIds: [idAlpha],
      targetDir: outDir,
    });
    assert(again.exported === 1, `повторный экспорт: exported=${again.exported}`);
    const ext = path.extname(alpha.originalFilename);
    const stem = alpha.originalFilename.slice(0, alpha.originalFilename.length - ext.length);
    assert(fs.existsSync(path.join(outDir, `${stem} (2)${ext}`)), 'коллизия имён не развелась суффиксом «(2)»');

    // Чужой id не роняет весь экспорт — он попадает в failed с причиной.
    const partial = await api<FileExportResponse>('POST', '/api/files/export', {
      fileIds: [idBeta, 999999],
      targetDir: outDir,
    });
    assert(partial.exported === 1, `частичный экспорт: exported=${partial.exported}`);
    assert(partial.failed.length === 1 && partial.failed[0]?.id === 999999, `failed=${JSON.stringify(partial.failed)}`);
    assert((partial.failed[0]?.reason ?? '') !== '', 'у отказа нет причины');

    // Относительный путь.
    const relative = await fetch(`${base}/api/files/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileIds: [idAlpha], targetDir: 'export-out' }),
    });
    assert(relative.status === 400, `относительный путь приняли со статусом ${relative.status}`);
    assert(((await relative.json()) as ApiError).code === 'invalid_target_dir', 'не тот код у относительного пути');

    // Несуществующая папка.
    const missing = await fetch(`${base}/api/files/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileIds: [idAlpha], targetDir: path.join(scratch, 'нет-такой-папки') }),
    });
    assert(missing.status === 400, `несуществующую папку приняли со статусом ${missing.status}`);
    assert(((await missing.json()) as ApiError).code === 'target_dir_missing', 'не тот код у несуществующей папки');

    // Внутрь самой библиотеки экспортировать нельзя: там раскладка originals/ab/cd.
    const inside = await fetch(`${base}/api/files/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileIds: [idAlpha], targetDir: path.join(libraryPath, 'originals') }),
    });
    assert(inside.status === 400, `путь внутри библиотеки приняли со статусом ${inside.status}`);
    assert(((await inside.json()) as ApiError).code === 'target_dir_in_library', 'не тот код у пути внутри библиотеки');

    // Браузерный режим экспорта: тот же оригинал, но как вложение.
    const plain = await fetch(`${base}/api/files/${idAlpha}/original`);
    assert(plain.headers.get('content-disposition') === null, 'обычная отдача оригинала стала вложением');
    const download = await fetch(`${base}/api/files/${idAlpha}/original?download=1`);
    const disposition = download.headers.get('content-disposition') ?? '';
    assert(disposition.startsWith('attachment;'), `Content-Disposition=${disposition}`);
    assert(disposition.includes(encodeURIComponent(alpha.originalFilename)), 'в заголовке нет имени файла');

    fs.rmSync(outDir, { recursive: true, force: true });
  });

  /**
   * Дополнительно: раскладка путей на обеих платформах. Windows-ветки считаются чистыми
   * функциями с явной платформой и path.win32 — так они проверяются на macOS, без подмены
   * process.platform. Контракт с Rust-оболочкой: %APPDATA%\Kopirka и %USERPROFILE%\Pictures\Копирка.
   */
  await check('кроссплатформенность: папка конфига, библиотека по умолчанию и разбор «~»', () => {
    const macHome = '/Users/tester';
    const winHome = 'C:\\Users\\Тестер';

    assert(
      supportDirFor('darwin', {}, macHome) === '/Users/tester/Library/Application Support/Kopirka',
      `macOS: ${supportDirFor('darwin', {}, macHome)}`,
    );
    const roaming = 'C:\\Users\\Тестер\\AppData\\Roaming';
    assert(
      supportDirFor('win32', { APPDATA: roaming }, winHome) === `${roaming}\\Kopirka`,
      `Windows: ${supportDirFor('win32', { APPDATA: roaming }, winHome)}`,
    );
    // APPDATA не задан — не падаем, собираем тот же Roaming от профиля.
    assert(
      supportDirFor('win32', {}, winHome) === `${roaming}\\Kopirka`,
      `Windows без APPDATA: ${supportDirFor('win32', {}, winHome)}`,
    );
    // KOPIRKA_CONFIG_DIR сильнее платформы — на нём держится вся изоляция прогона.
    assert(
      supportDirFor('win32', { APPDATA: roaming, KOPIRKA_CONFIG_DIR: 'D:\\tmp\\cfg' }, winHome) === 'D:\\tmp\\cfg',
      'KOPIRKA_CONFIG_DIR не перебил платформенный путь',
    );

    assert(
      defaultLibraryPathFor(macHome, path.posix) === '/Users/tester/Pictures/Копирка',
      'библиотека по умолчанию на macOS',
    );
    assert(
      defaultLibraryPathFor(winHome, path.win32) === 'C:\\Users\\Тестер\\Pictures\\Копирка',
      'библиотека по умолчанию на Windows',
    );

    assert(expandHomeWith('~', winHome, 'win32') === winHome, '«~» на Windows');
    assert(
      expandHomeWith('~\\Pictures\\Копирка', winHome, 'win32') === 'C:\\Users\\Тестер\\Pictures\\Копирка',
      '«~\\» на Windows',
    );
    assert(
      expandHomeWith('~/Pictures/Копирка', winHome, 'win32') === 'C:\\Users\\Тестер\\Pictures\\Копирка',
      '«~/» на Windows',
    );
    assert(
      expandHomeWith('~/Pictures/Копирка', macHome, 'darwin') === '/Users/tester/Pictures/Копирка',
      '«~/» на macOS',
    );
    assert(expandHomeWith('D:\\Мои картинки', winHome, 'win32') === 'D:\\Мои картинки', 'абсолютный путь Windows');
    assert(
      expandHomeWith('/Volumes/Disk/Копирка', macHome, 'darwin') === '/Volumes/Disk/Копирка',
      'абсолютный путь macOS',
    );
  });

  /** Дополнительно: статика не выпускает за web/dist ни на одной платформе. */
  await check('кроссплатформенность: статика остаётся внутри web/dist (POSIX и Windows)', () => {
    const posixRoot = '/app/web/dist';
    const winRoot = 'C:\\Program Files\\Kopirka\\web\\dist';
    const mac = (pathname: string) => resolveStaticCandidate(posixRoot, pathname, path.posix, false);
    const win = (pathname: string) => resolveStaticCandidate(winRoot, pathname, path.win32, true);

    assert(mac('/index.html') === '/app/web/dist/index.html', `macOS: ${mac('/index.html')}`);
    assert(win('/index.html') === `${winRoot}\\index.html`, `Windows: ${win('/index.html')}`);
    assert(win('/assets/app-Ab12.js') === `${winRoot}\\assets\\app-Ab12.js`, 'вложенный ресурс на Windows');
    // Корень остаётся разрешённым: дальше его отсекает statSync().isFile().
    assert(mac('/') === posixRoot && win('/') === winRoot, 'корень web/dist перестал считаться своим');

    assert(mac('/../../etc/passwd') === null, 'macOS: обход каталога через ..');
    assert(win('/../../windows/win.ini') === null, 'Windows: обход каталога через ..');
    // %5C декодируется в обратный слэш: на Windows это разделитель, значит настоящий обход.
    assert(win('/..\\..\\windows\\win.ini') === null, 'Windows: обход каталога через обратный слэш');
    // На macOS обратный слэш — обычный символ имени, путь остаётся внутри (так было и раньше).
    assert(mac('/..\\..\\etc\\passwd') === '/app/web/dist/..\\..\\etc\\passwd', 'macOS: обратный слэш в имени');
    // NTFS-поток того же файла отдавать нельзя.
    assert(win('/index.html::$DATA') === null, 'Windows: альтернативный поток NTFS');
    assert(mac('/index.html:weird') !== null, 'macOS: двоеточие в имени файла не запрещено');
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

  // Дополнительно: журнал импорта — им живут уведомления оболочки и живое обновление окна.
  await check('GET /api/events: без after — только last, с after — новые события с именем папки', async () => {
    const start = await api<EventsResponse>('GET', '/api/events');
    assert(start.events.length === 0, 'без after сервер отдал историю');
    assert(start.last > 0, `last=${start.last}, хотя импорты уже были`);

    const box = await api<FolderRecord>('POST', '/api/folders', { name: 'Сэбач' });
    const inFolder = await upload(
      '/api/import',
      [{ name: 'events-shot.png', buffer: await plasma(6).png().toBuffer() }],
      { sourceType: 'drag_drop', folderId: String(box.id) },
    );
    assert(inFolder.items[0]?.outcome === 'added', `outcome=${inFolder.items[0]?.outcome}`);
    const fileId = inFolder.items[0]?.file?.id ?? 0;

    const fresh = await api<EventsResponse>('GET', `/api/events?after=${start.last}`);
    assert(fresh.events.length === 1, `новых событий ${fresh.events.length} вместо 1`);
    const event = importEvents(fresh)[0];
    assert(event?.kind === 'import', `kind=${fresh.events[0]?.kind} вместо import`);
    assert(event?.seq === start.last + 1, `seq=${event?.seq} вместо ${start.last + 1}`);
    assert(event?.fileId === fileId, 'в событии не тот файл');
    assert(event?.outcome === 'added' && event.sourceType === 'drag_drop', 'событие описано неверно');
    assert(event?.folderId === box.id && event.folderName === 'Сэбач', `папка в событии: ${event?.folderName}`);
    assert(fresh.last === event?.seq, 'last не совпал с номером последнего события');
    assert(typeof event?.at === 'string' && !Number.isNaN(Date.parse(event.at)), 'время события не разбирается');

    // Опрос с того же номера — пусто: одно событие клиент получает ровно один раз.
    const again = await api<EventsResponse>('GET', `/api/events?after=${fresh.last}`);
    assert(again.events.length === 0, 'событие пришло второй раз');

    // CAP-05 — именно на этот sourceType оболочка шлёт системное уведомление.
    const watched = await upload('/api/import/watch', [
      { name: 'events-watch.png', buffer: await plasma(7).png().toBuffer() },
    ]);
    assert(watched.items[0]?.outcome === 'added', `watch outcome=${watched.items[0]?.outcome}`);
    const tail = await api<EventsResponse>('GET', `/api/events?after=${again.last}`);
    const watchedEvent = importEvents(tail)[0];
    assert(watchedEvent?.sourceType === 'folder_watch', `sourceType=${watchedEvent?.sourceType}`);
    assert(
      watchedEvent?.folderId === null && watchedEvent.folderName === null,
      'у файла без папки в событии оказалась папка',
    );

    // Проверка самодостаточна: следы убираем, чтобы не смещать счётчики соседних проверок.
    const ids = [fileId, watched.items[0]?.file?.id ?? 0];
    await api<{ deleted: number }>('POST', '/api/files/delete', { fileIds: ids });
    await api<{ purged: number }>('POST', '/api/files/purge', { fileIds: ids });
    await api<{ ok: boolean }>('DELETE', `/api/folders/${box.id}`);
  });

  // Дополнительно: точный дубль тоже событие. Без него приложение молчит там, где
  // человек нажал «Добавить в Копирку» и вправе услышать «это уже есть».
  await check('GET /api/events: повторный импорт того же файла → событие duplicate', async () => {
    const before = await api<EventsResponse>('GET', '/api/events');
    const payload = await plasma(21).png().toBuffer();

    const first = await upload('/api/import', [{ name: 'events-dupe.png', buffer: payload }], {
      sourceType: 'drag_drop',
    });
    assert(first.items[0]?.outcome === 'added', `первый импорт: ${first.items[0]?.outcome}`);
    const fileId = first.items[0]?.file?.id ?? 0;

    // Тот же байт-в-байт файл другим путём: sourceType в событии должен быть путём
    // текущей попытки, а не тем, которым файл попал в библиотеку в первый раз.
    const repeat = await upload('/api/import/watch', [
      { name: 'events-dupe.png', buffer: payload },
    ]);
    assert(repeat.items[0]?.outcome === 'duplicate', `повтор: ${repeat.items[0]?.outcome}`);

    const events = importEvents(await api<EventsResponse>('GET', `/api/events?after=${before.last}`));
    assert(events.length === 2, `событий ${events.length} вместо 2 (added + duplicate)`);
    const dupe = events[1];
    assert(dupe?.outcome === 'duplicate', `второе событие: ${dupe?.outcome}`);
    assert(dupe?.fileId === fileId, 'в событии дубля не тот файл, который уже лежит в библиотеке');
    assert(dupe?.sourceType === 'folder_watch', `sourceType дубля: ${dupe?.sourceType}`);

    await api<{ deleted: number }>('POST', '/api/files/delete', { fileIds: [fileId] });
    await api<{ purged: number }>('POST', '/api/files/purge', { fileIds: [fileId] });
  });

  // Дополнительно: POST /api/notify — им говорит обработчик быстрой команды Finder,
  // чтобы уведомление пришло с иконкой «Копирки», а не Script Editor.
  await check('POST /api/notify: сообщение ложится в ленту, мусор отбивается', async () => {
    const before = await api<EventsResponse>('GET', '/api/events');
    const sent = await api<NotifyResponse>('POST', '/api/notify', { body: 'Копирка не отвечает' });
    assert(sent.ok && sent.seq === before.last + 1, `ответ notify: ${JSON.stringify(sent)}`);

    const fresh = await api<EventsResponse>('GET', `/api/events?after=${before.last}`);
    const notice = fresh.events.find((item): item is NoticeEvent => item.kind === 'notice');
    assert(notice !== undefined, 'событие-уведомление в ленту не попало');
    assert(notice?.body === 'Копирка не отвечает', `body=${notice?.body}`);
    assert(notice?.title === null, 'без title в ленте должен лежать null — заголовок ставит оболочка');

    const titled = await api<NotifyResponse>('POST', '/api/notify', {
      body: 'Не удалось добавить: 2',
      title: 'Быстрая команда',
    });
    const withTitle = await api<EventsResponse>('GET', `/api/events?after=${titled.seq - 1}`);
    const second = withTitle.events.find((item): item is NoticeEvent => item.kind === 'notice');
    assert(second?.title === 'Быстрая команда', `title=${second?.title}`);

    const empty = await fetch(`${base}/api/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: '   ' }),
    });
    assert(empty.status === 400, `пустой текст приняли со статусом ${empty.status}`);

    const long = await fetch(`${base}/api/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: 'я'.repeat(5000) }),
    });
    assert(long.status === 400, `простыню на 5000 знаков приняли со статусом ${long.status}`);

    // Тот же замок, что у остальных эндпоинтов: сказать уведомление может только
    // локальный скрипт, а не сайт, открытый в браузере рядом.
    const evil = await fetch(`${base}/api/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
      body: JSON.stringify({ body: 'Введите пароль на evil.example' }),
    });
    assert(evil.status === 403, `сторонний origin получил ${evil.status}`);
  });

  // Дополнительно: SVC-06 — занятый порт нельзя записать в настройки, иначе после
  // перезапуска сервер не поднимется, а вернуть порт будет уже неоткуда.
  await check('SVC-06: PATCH /api/settings с занятым портом → 400 port_busy, конфиг не меняется', async () => {
    const busyPort = await freePort();
    const squatter = net.createServer();
    await new Promise<void>((resolve) => squatter.listen(busyPort, '127.0.0.1', () => resolve()));
    try {
      const response = await fetch(`${base}/api/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverPort: busyPort }),
      });
      assert(response.status === 400, `занятый порт приняли со статусом ${response.status}`);
      const body = (await response.json()) as ApiError;
      assert(body.code === 'port_busy', `code=${body.code}`);
      assert(body.error.includes(String(busyPort)), 'в сообщении нет номера порта');
    } finally {
      await new Promise<void>((resolve) => squatter.close(() => resolve()));
    }

    const settings = await api<SettingsResponse>('GET', '/api/settings');
    assert(settings.serverPort === port, `порт в конфиге стал ${settings.serverPort} вместо ${port}`);
    // Собственный порт — это «без изменений», его проверка занятости пропускает.
    const same = await api<SettingsUpdateResponse>('PATCH', '/api/settings', { serverPort: port });
    assert(same.restartRequired === false, 'смена порта на текущий потребовала перезапуска');
    assert(same.serverPort === port, 'текущий порт не принялся');
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

    stopServer(child);
    await new Promise<void>((resolve) => child.on('exit', () => resolve()));
    // На Windows выход прямого потомка (tsx) не значит, что умер и сам сервер: taskkill
    // гасит дерево, но освобождение файлов базы отстаёт на мгновение. Даём ему это время.
    if (process.platform === 'win32') await sleep(500);

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

  stopServer(child);
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
