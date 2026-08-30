/** Человеческие форматы для служебного блока настроек. */

const UNITS = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'] as const;

/** 1_503_238_553 → «1,4 ГБ». Десятичный разделитель — запятая, как принято в русском. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 Б';

  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }

  // Байты целые; дальше — один знак после запятой, но «12,0 МБ» не показываем.
  const digits = unit === 0 ? 0 : value >= 100 ? 0 : 1;
  const text = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(value);

  return `${text} ${UNITS[unit]}`;
}

/**
 * Длинный путь с многоточием посередине — спека §3: начало и хвост важнее середины.
 * Режем по границе сегментов, чтобы имя файла осталось целым.
 */
export function truncateMiddle(text: string, max = 44): string {
  if (text.length <= max) return text;
  const head = Math.ceil((max - 1) / 2);
  const tail = max - 1 - head;
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`;
}
