/** Работа с `FileListQuery`: счётчик, сброс, пресеты дат. SEARCH-01, 03, 04 и LIB-04. */
import type { FileExt, FileListQuery, SortKey } from '@shared/api';

/** SEARCH-04 — то, что реально лежит на диске: сервер нормализует jpeg → jpg. */
export const FILTER_EXTS: readonly FileExt[] = ['jpg', 'png', 'webp', 'gif', 'svg'];

/** LIB-04 — обе оси в обе стороны. */
export const SORT_OPTIONS: readonly { value: SortKey; label: string }[] = [
  { value: 'added_desc', label: 'Сначала новые' },
  { value: 'added_asc', label: 'Сначала старые' },
  { value: 'name_asc', label: 'По имени: А → Я' },
  { value: 'name_desc', label: 'По имени: Я → А' },
];

export const DEFAULT_SORT: SortKey = 'added_desc';

export type DatePreset = 'today' | 'week' | 'month' | 'year';

export const DATE_PRESETS: readonly { value: DatePreset; label: string }[] = [
  { value: 'today', label: 'Сегодня' },
  { value: 'week', label: 'Неделя' },
  { value: 'month', label: 'Месяц' },
  { value: 'year', label: 'Год' },
];

/** `YYYY-MM-DD` в локальной зоне: `toISOString` увёл бы дату на день назад западнее UTC. */
export function toDateInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Границы пресета. Сервер сам расширяет дату до начала и конца дня. */
export function presetRange(preset: DatePreset): { dateFrom: string; dateTo: string } {
  const today = new Date();
  const from = new Date(today);
  if (preset === 'week') from.setDate(from.getDate() - 6);
  if (preset === 'month') from.setMonth(from.getMonth() - 1);
  if (preset === 'year') from.setFullYear(from.getFullYear() - 1);
  return { dateFrom: toDateInput(from), dateTo: toDateInput(today) };
}

/** Какой пресет соответствует текущему диапазону; null — произвольный или пустой. */
export function matchPreset(query: FileListQuery): DatePreset | null {
  if (!query.dateFrom || !query.dateTo) return null;
  for (const { value } of DATE_PRESETS) {
    const range = presetRange(value);
    if (range.dateFrom === query.dateFrom && range.dateTo === query.dateTo) return value;
  }
  return null;
}

/**
 * Счётчик на кнопке «Фильтр». Считаем конкретные ограничения, а не разделы:
 * каждый тег и каждый тип — единица, диапазон дат — одна, независимо от границ.
 * Сортировка фильтром не считается.
 */
export function countActiveFilters(query: FileListQuery): number {
  return (
    (query.tags?.length ?? 0) +
    (query.exts?.length ?? 0) +
    (query.dateFrom || query.dateTo ? 1 : 0)
  );
}

/**
 * Сброс — снимает фильтры, но не трогает раздел, папку, строку поиска и сортировку.
 * Сортировка с 02.09.2026 живёт в верхней панели (решение D6) и фильтром не считается:
 * «Сбросить» в панели не должно молча менять видимый порядок.
 */
export function clearFilters(query: FileListQuery): FileListQuery {
  const { tags: _tags, exts: _exts, dateFrom: _from, dateTo: _to, ...rest } = query;
  return { ...rest, cursor: null };
}

/** Есть ли что сбрасывать. */
export function isDirty(query: FileListQuery): boolean {
  return countActiveFilters(query) > 0;
}
