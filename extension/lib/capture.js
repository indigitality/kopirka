/**
 * Работа с кадром в service worker: раскодировать dataURL, вырезать
 * прямоугольник, собрать обратно в dataURL. DOM здесь нет — только
 * OffscreenCanvas и createImageBitmap.
 */

/** Меньший фрагмент считаем случайным кликом, а не выделением. */
export const MIN_AREA_SIDE_CSS_PX = 5;

/**
 * @param {string} dataUrl
 * @returns {Blob}
 */
export function dataUrlToBlob(dataUrl) {
  const comma = dataUrl.indexOf(',');
  const header = dataUrl.slice(0, comma);
  const base64 = dataUrl.slice(comma + 1);
  const mime = /:(.*?);/.exec(header)?.[1] ?? 'image/png';

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

  return new Blob([bytes], { type: mime });
}

/**
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
export async function blobToDataUrl(blob) {
  const buffer = new Uint8Array(await blob.arrayBuffer());

  // btoa не принимает большие строки целиком — собираем по кускам.
  const CHUNK = 0x8000;
  let binary = '';
  for (let offset = 0; offset < buffer.length; offset += CHUNK) {
    binary += String.fromCharCode.apply(null, buffer.subarray(offset, offset + CHUNK));
  }

  return `data:${blob.type || 'image/png'};base64,${btoa(binary)}`;
}

/**
 * Вырезает прямоугольник из снимка видимой области.
 *
 * Координаты приходят из страницы в CSS-пикселях, а снимок — в физических:
 * на ретине это разные величины. Масштаб берём из самого снимка
 * (ширина картинки / ширина вьюпорта), а не из devicePixelRatio: так кадр
 * не поедет при зуме страницы и при нестандартном dpr. devicePixelRatio —
 * запасной вариант, если размеры вьюпорта не пришли.
 *
 * @param {string} fullDataUrl снимок всей видимой области
 * @param {{ x:number, y:number, width:number, height:number }} rectCss в CSS-пикселях
 * @param {{ width:number, height:number }} viewport innerWidth/innerHeight страницы
 * @param {number} devicePixelRatio
 * @returns {Promise<{ dataUrl: string, width: number, height: number }>}
 */
export async function cropDataUrl(fullDataUrl, rectCss, viewport, devicePixelRatio) {
  const bitmap = await createImageBitmap(dataUrlToBlob(fullDataUrl));

  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1;
  const scaleX = viewport?.width > 0 ? bitmap.width / viewport.width : dpr;
  const scaleY = viewport?.height > 0 ? bitmap.height / viewport.height : dpr;

  // Округляем края наружу, затем прижимаем к границам снимка.
  const left = clamp(Math.floor(rectCss.x * scaleX), 0, bitmap.width);
  const top = clamp(Math.floor(rectCss.y * scaleY), 0, bitmap.height);
  const right = clamp(Math.ceil((rectCss.x + rectCss.width) * scaleX), left, bitmap.width);
  const bottom = clamp(Math.ceil((rectCss.y + rectCss.height) * scaleY), top, bitmap.height);

  const width = right - left;
  const height = bottom - top;
  if (width < 1 || height < 1) {
    bitmap.close();
    throw new Error('Выделенная область пуста');
  }

  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('Не удалось подготовить кадр');
  }

  context.drawImage(bitmap, left, top, width, height, 0, 0, width, height);
  bitmap.close();

  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return { dataUrl: await blobToDataUrl(blob), width, height };
}

/**
 * Размер кадра в физических пикселях — для подписи под предпросмотром.
 * @param {string} dataUrl
 * @returns {Promise<{ width: number, height: number }>}
 */
export async function measureDataUrl(dataUrl) {
  const bitmap = await createImageBitmap(dataUrlToBlob(dataUrl));
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
