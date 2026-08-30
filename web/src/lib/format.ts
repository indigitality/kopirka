/** Форматирование технических значений: размеры, даты, пути, источники. */

const MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

/** «1,8 МБ» — разделитель дробной части запятая, как в спеке §3. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0).replace('.', ',')} КБ`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0).replace('.', ',')} МБ`;
  return `${(mb / 1024).toFixed(1).replace('.', ',')} ГБ`;
}

/** «2400 × 1600» либо «—», если размеры неизвестны (битый файл). */
export function formatDimensions(width: number | null, height: number | null): string {
  if (width === null || height === null) return '—';
  return `${width} × ${height}`;
}

/** «12 августа 2026, 14:30» */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const month = MONTHS[date.getMonth()] ?? '';
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `${date.getDate()} ${month} ${date.getFullYear()}, ${time}`;
}

/** «12 августа» — короткая форма для подписи под похожим файлом. */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.getDate()} ${MONTHS[date.getMonth()] ?? ''}`;
}

/** Многоточие посередине — путь на диске должен сохранять начало и имя файла. */
export function middleTruncate(value: string, max = 42): string {
  if (value.length <= max) return value;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${value.slice(0, head)}…${value.slice(value.length - tail)}`;
}

/** «dribbble.com/shots/24518903» — хост и путь без схемы. */
export function hostAndPath(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const path = url.pathname === '/' ? '' : url.pathname;
    return `${url.host}${path}`;
  } catch {
    return rawUrl;
  }
}

/** Русское склонение по числу: 1 файл, 2 файла, 5 файлов. */
export function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

const SOURCE_LABELS: Record<string, string> = {
  context_menu: 'Контекстное меню браузера',
  tab_screenshot: 'Скриншот вкладки',
  area_screenshot: 'Скриншот области',
  drag_drop: 'Перетаскивание',
  clipboard: 'Вставка из буфера',
  folder_watch: 'Автоимпорт папки',
};

export function sourceLabel(sourceType: string): string {
  return SOURCE_LABELS[sourceType] ?? sourceType;
}
