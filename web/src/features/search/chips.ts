/**
 * Чип-фильтр поиск-модалки: то, что закреплено слева от курсора в поле запроса
 * (артборд D03 «Поиск — выбраны фильтры»). Три вида, но живут они одним списком —
 * так Backspace на пустом поле снимает «последний закреплённый», не разбираясь,
 * что это было.
 */
import type { FileExt, SearchQuery } from '@shared/api';

export type SearchChip =
  | { kind: 'tag'; value: string }
  | { kind: 'ext'; value: FileExt }
  | { kind: 'folder'; value: string; folderId: number };

/** Подпись на чипе: тег с решёткой, формат заглавными, папка — путём как есть. */
export function chipLabel(chip: SearchChip): string {
  if (chip.kind === 'tag') return `#${chip.value}`;
  if (chip.kind === 'ext') return chip.value.toUpperCase();
  return chip.value;
}

/** Ключ для React и для сравнения «такой чип уже есть». */
export function chipKey(chip: SearchChip): string {
  return `${chip.kind}:${chip.kind === 'folder' ? chip.folderId : chip.value}`;
}

export function hasChip(chips: readonly SearchChip[], chip: SearchChip): boolean {
  const key = chipKey(chip);
  return chips.some((item) => chipKey(item) === key);
}

/**
 * Добавить чип. Папка одна: вторая заменяет первую — «в двух папках сразу» в
 * `FileListQuery` не выражается, там один `folderId`.
 */
export function addChip(chips: readonly SearchChip[], chip: SearchChip): SearchChip[] {
  if (hasChip(chips, chip)) return [...chips];
  const rest = chip.kind === 'folder' ? chips.filter((item) => item.kind !== 'folder') : chips;
  return [...rest, chip];
}

export function removeChip(chips: readonly SearchChip[], key: string): SearchChip[] {
  return chips.filter((item) => chipKey(item) !== key);
}

/** Разложить чипы по осям запроса — и для `GET /api/search`, и для фильтров сетки. */
export function chipsToQuery(chips: readonly SearchChip[]): {
  tags: string[];
  exts: FileExt[];
  folderId?: number;
} {
  const tags: string[] = [];
  const exts: FileExt[] = [];
  let folderId: number | undefined;
  for (const chip of chips) {
    if (chip.kind === 'tag') tags.push(chip.value);
    else if (chip.kind === 'ext') exts.push(chip.value);
    else folderId = chip.folderId;
  }
  return folderId === undefined ? { tags, exts } : { tags, exts, folderId };
}

/** Запрос к `GET /api/search` из текущего состояния модалки. */
export function searchQuery(text: string, chips: readonly SearchChip[]): SearchQuery {
  const { tags, exts, folderId } = chipsToQuery(chips);
  const query: SearchQuery = {};
  const trimmed = text.trim();
  if (trimmed !== '') query.q = trimmed;
  if (tags.length > 0) query.tags = tags;
  if (exts.length > 0) query.exts = exts;
  if (folderId !== undefined) query.folderId = folderId;
  return query;
}
