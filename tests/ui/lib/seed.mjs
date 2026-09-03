/**
 * Наполнение песочницы: ~14 вложенных папок (чтобы список в диалоге «Переместить
 * в папку» прокручивался) и 12 картинок разных пропорций и цветов (чтобы у
 * перцептивного хэша не было повода счесть их «похожими» — IMP-01 иначе увёл бы
 * часть импорта в needs_confirmation, и сценариям пришлось бы это разгребать).
 *
 * Картинки рисуются как SVG-сцены и растрируются sharp'ом — sharp берём из
 * app/node_modules через createRequire, как просил Сергей, а не устанавливаем
 * второй раз в tests/ui.
 */
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function loadSharp(appDir) {
  return require(path.join(appDir, 'node_modules', 'sharp'));
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Простая, но визуально различимая сцена: заливка + акцентная фигура + подпись. */
function svgScene({ width, height, bg, fg, label }) {
  const cx = width * 0.5;
  const cy = height * 0.42;
  const r = Math.min(width, height) * 0.28;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="${bg}"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${fg}" opacity="0.9"/>
    <rect x="${width * 0.12}" y="${height * 0.68}" width="${width * 0.76}" height="${height * 0.1}" rx="${Math.min(width, height) * 0.02}" fill="${fg}" opacity="0.35"/>
    <text x="${width / 2}" y="${height * 0.9}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.max(14, Math.min(width, height) * 0.055)}" font-weight="700" fill="${fg}" text-anchor="middle">${esc(label)}</text>
  </svg>`;
}

/**
 * 12 сцен разной формы (портрет/пейзаж/квадрат/панорама) и палитры — по одной на
 * файл. Имена подобраны так, чтобы алфавитный порядок (name_asc) заведомо не
 * совпадал с порядком импорта (added_desc наоборот) — сценарий сортировки должен
 * увидеть реальную смену порядка карточек, а не совпадение по случайности.
 */
export const IMAGE_SPECS = [
  { name: 'zebra-scene-01', ext: 'png', width: 1000, height: 600, bg: '#1c2b1f', fg: '#c5fd63' },
  { name: 'mango-scene-02', ext: 'png', width: 600, height: 1000, bg: '#201a12', fg: '#ffb347' },
  { name: 'nova-scene-03', ext: 'png', width: 800, height: 800, bg: '#10131c', fg: '#7c9dff' },
  { name: 'crimson-scene-04', ext: 'png', width: 1200, height: 500, bg: '#1a0f12', fg: '#ff4d6d' },
  { name: 'willow-scene-05', ext: 'png', width: 500, height: 1200, bg: '#0f1a13', fg: '#63d4ad' },
  { name: 'quartz-scene-06', ext: 'png', width: 900, height: 650, bg: '#17151f', fg: '#c9a6ff' },
  { name: 'ember-scene-07', ext: 'png', width: 650, height: 900, bg: '#1f1712', fg: '#ff8a5c' },
  { name: 'basalt-scene-08', ext: 'png', width: 750, height: 750, bg: '#14151a', fg: '#9aa0ac' },
  { name: 'harbor-scene-09', ext: 'png', width: 1100, height: 450, bg: '#101820', fg: '#63b8fd' },
  { name: 'lumen-scene-10', ext: 'png', width: 450, height: 1100, bg: '#1a1810', fg: '#fde663' },
  { name: 'granite-scene-11', ext: 'png', width: 700, height: 950, bg: '#16171a', fg: '#b7bdc7' },
  { name: 'violet-scene-12', ext: 'png', width: 950, height: 700, bg: '#180f1c', fg: '#c463fd' },
];

/** Первые 3 идут в «Интерфейсы», следующие 2 — в «Логотипы» (вложена в «Айдентика»), остальные 7 — без папки. */
const FOLDER_FOR_IMAGE = {
  'zebra-scene-01': 'Интерфейсы',
  'mango-scene-02': 'Интерфейсы',
  'nova-scene-03': 'Интерфейсы',
  'crimson-scene-04': 'Логотипы',
  'willow-scene-05': 'Логотипы',
};

/** 13 корневых + 2 вложенные = 15 папок: список в «Переместить в папку» точно не влезет в 320px без прокрутки. */
export const FOLDER_TREE = [
  { name: 'Интерфейсы', children: ['Мобильные'] },
  { name: 'Дашборды', children: [] },
  { name: 'Айдентика', children: ['Логотипы'] },
  { name: 'Типографика', children: [] },
  { name: 'Лендинги', children: [] },
  { name: 'Иллюстрация', children: [] },
  { name: 'Моушн', children: [] },
  { name: 'Иконки', children: [] },
  { name: '3D', children: [] },
  { name: 'Портфолио', children: [] },
  { name: 'Раскадровки', children: [] },
  { name: 'Настроение', children: [] },
  { name: 'Палитры', children: [] },
];

/** Создать дерево папок через API. Возвращает Map<имя, id> (включая вложенные). */
async function createFolders(api) {
  const idByName = new Map();
  for (const root of FOLDER_TREE) {
    const created = await api('POST', '/api/folders', { name: root.name });
    idByName.set(root.name, created.id);
    for (const childName of root.children) {
      const child = await api('POST', '/api/folders', { name: childName, parentFolderId: created.id });
      idByName.set(childName, child.id);
    }
  }
  return idByName;
}

async function importOne(api, baseUrl, buffer, filename, folderId) {
  const form = new FormData();
  form.append('sourceType', 'drag_drop');
  if (folderId) form.append('folderId', String(folderId));
  form.append('files', new Blob([new Uint8Array(buffer)], { type: 'image/png' }), filename);
  const response = await fetch(`${baseUrl}/api/import`, { method: 'POST', headers: { Origin: baseUrl }, body: form });
  const text = await response.text();
  if (!response.ok) throw new Error(`POST /api/import (${filename}) → ${response.status}: ${text.slice(0, 300)}`);
  const json = JSON.parse(text);
  const item = json.items[0];
  if (item.outcome === 'needs_confirmation') {
    // Не должно случиться при достаточно разных сценах, но на всякий случай подтверждаем,
    // а не проваливаем весь прогон: смоук должен переживать редкую случайность в pHash.
    const confirmed = await api('POST', '/api/import/confirm', { pendingToken: item.pendingToken });
    return confirmed.items[0].file;
  }
  if (item.outcome !== 'added' && item.outcome !== 'added_similar') {
    throw new Error(`импорт ${filename}: неожиданный outcome ${item.outcome} (${item.errorMessage ?? ''})`);
  }
  return item.file;
}

/**
 * Полное наполнение песочницы. Возвращает { filesByName, folderIds, imageOrder }
 * — сценарии используют это, чтобы обращаться к конкретным файлам/папкам по имени,
 * а не по хрупкому «первая карточка в сетке».
 */
export async function seedLibrary({ appDir, api, baseUrl }) {
  const sharp = loadSharp(appDir);

  const folderIds = await createFolders(api);

  const filesByName = new Map();
  for (const spec of IMAGE_SPECS) {
    const svg = svgScene({ width: spec.width, height: spec.height, bg: spec.bg, fg: spec.fg, label: spec.name });
    const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
    const folderName = FOLDER_FOR_IMAGE[spec.name] ?? null;
    const folderId = folderName ? folderIds.get(folderName) : null;
    const file = await importOne(api, baseUrl, buffer, `${spec.name}.png`, folderId);
    filesByName.set(spec.name, file);
  }

  return {
    filesByName,
    folderIds,
    imageOrder: IMAGE_SPECS.map((spec) => spec.name),
    totalFiles: IMAGE_SPECS.length,
    totalFolders: FOLDER_TREE.reduce((sum, root) => sum + 1 + root.children.length, 0),
    filedCount: Object.keys(FOLDER_FOR_IMAGE).length,
    unfiledCount: IMAGE_SPECS.length - Object.keys(FOLDER_FOR_IMAGE).length,
  };
}

