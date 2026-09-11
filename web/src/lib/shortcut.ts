/**
 * FDB-10 — перевод между нотацией tauri-plugin-global-shortcut и тем, что видит
 * человек.
 *
 * Нотация плагина: модификаторы `Control` / `Alt` / `Shift` / `Super` и ровно одна
 * клавиша, соединённые `+`, например `Alt+Super+C`. Клавиша записана кодом
 * раскладки (`KeyC`, `Digit4`, `F5`), а не буквой: так сочетание не зависит от
 * того, на какой раскладке его нажали. Та же функция разбора живёт на сервере
 * (`server/src/config.ts::normalizeShortcut`) — расходиться им нельзя.
 *
 * Файл намеренно без зависимостей, даже от контракта: его же импортирует дымовой
 * прогон сервера, чтобы проверить обе стороны перевода одним запуском.
 */

/** Модификаторы в каноническом порядке — он же порядок кейкапов на экране. */
export const MODIFIERS = ['Control', 'Alt', 'Shift', 'Super'] as const;
export type Modifier = (typeof MODIFIERS)[number];

/** ⌥⌘C — умолчание и цель кнопки сброса. Дубль `DEFAULT_CAPTURE_SHORTCUT`. */
export const DEFAULT_SHORTCUT = 'Alt+Super+C';

export interface ShortcutParts {
  modifiers: Modifier[];
  /** Код клавиши: `KeyC`, `Digit4`, `F5`. */
  key: string;
}

/** Как `event.key` называет сами модификаторы — их нажатие сочетание не завершает. */
const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta', 'AltGraph', 'CapsLock']);

/** Подписи модификаторов: символы macOS и слова Windows. */
const SYMBOL: Record<Modifier, string> = {
  Control: '⌃',
  Alt: '⌥',
  Shift: '⇧',
  Super: '⌘',
};

const WORD: Record<Modifier, string> = {
  Control: 'Ctrl',
  Alt: 'Alt',
  Shift: 'Shift',
  Super: 'Win',
};

/** Имена, которыми модификатор могут записать в конфиге руками. */
const ALIAS: Record<string, Modifier> = {
  alt: 'Alt',
  option: 'Alt',
  control: 'Control',
  ctrl: 'Control',
  shift: 'Shift',
  super: 'Super',
  meta: 'Super',
  command: 'Super',
  cmd: 'Super',
};

/**
 * Системные сочетания macOS, которые отбиваем сразу, не дожидаясь отказа от
 * плагина: система их не отдаёт никому, и «занято другой программой» было бы
 * неправдой — занято не программой, а самой macOS.
 */
const SYSTEM: Record<string, string> = {
  'Shift+Super+Digit3': 'снимок всего экрана macOS',
  'Shift+Super+Digit4': 'снимок экрана macOS',
  'Shift+Super+Digit5': 'запись экрана macOS',
  'Super+KeyQ': 'выход из программы',
  'Super+KeyW': 'закрытие окна',
  'Super+Space': 'Spotlight',
};

/** Разобрать нотацию плагина. `null` — строка не сочетание. */
export function parseShortcut(spec: string): ShortcutParts | null {
  const parts = spec
    .split('+')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  if (parts.length < 2 || parts.length > 4) return null;

  const modifiers: Modifier[] = [];
  for (const part of parts.slice(0, -1)) {
    const name = ALIAS[part.toLowerCase()];
    if (name === undefined || modifiers.includes(name)) return null;
    modifiers.push(name);
  }

  const key = parts[parts.length - 1] as string;
  if (ALIAS[key.toLowerCase()] !== undefined) return null;
  if (!/^[A-Za-z0-9]+$/.test(key)) return null;

  modifiers.sort((a, b) => MODIFIERS.indexOf(a) - MODIFIERS.indexOf(b));
  return { modifiers, key };
}

/** Собрать нотацию обратно. Порядок модификаторов канонический. */
export function formatShortcut(parts: ShortcutParts): string {
  const modifiers = [...parts.modifiers].sort(
    (a, b) => MODIFIERS.indexOf(a) - MODIFIERS.indexOf(b),
  );
  return [...modifiers, parts.key].join('+');
}

/** Привести к канону: `Cmd+alt+C` → `Alt+Super+C`. `null` — не сочетание. */
export function normalizeShortcut(spec: string): string | null {
  const parts = parseShortcut(spec);
  return parts === null ? null : formatShortcut(parts);
}

/**
 * Подпись клавиши на кейкапе. `KeyC` → `C`, `Digit4` → `4`, `F5` → `F5`,
 * `Space` → `Пробел`. Незнакомый код показываем как есть: соврать хуже, чем
 * показать техническое имя.
 */
export function keyLabel(key: string): string {
  if (/^Key[A-Z]$/.test(key)) return key.slice(3);
  if (/^Digit\d$/.test(key)) return key.slice(5);
  if (/^Numpad(\d)$/.test(key)) return `№${key.slice(6)}`;
  const named: Record<string, string> = {
    Space: 'Пробел',
    Enter: '⏎',
    Escape: 'Esc',
    Backquote: '`',
    Minus: '−',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
  };
  return named[key] ?? key;
}

/** Подпись одного модификатора: ⌥ на macOS, «Alt» на Windows. */
export function modifierLabel(modifier: Modifier, windows = false): string {
  return windows ? WORD[modifier] : SYMBOL[modifier];
}

/**
 * Кейкапы для показа. `windows` — оболочка Windows: там вместо символов слова,
 * потому что ⌘ и ⌥ на этой клавиатуре не написаны ни на одной клавише.
 */
export function shortcutKeycaps(spec: string, windows = false): string[] {
  const parts = parseShortcut(spec);
  if (parts === null) return [spec];
  const table = windows ? WORD : SYMBOL;
  return [...parts.modifiers.map((modifier) => table[modifier]), keyLabel(parts.key)];
}

/** Одной строкой — для подписей вне поля-рекордера: «⌥⌘C». */
export function shortcutLabel(spec: string, windows = false): string {
  return shortcutKeycaps(spec, windows).join(windows ? '+' : '');
}

/**
 * Сочетание занято системой? Возвращает, чем именно, — текст уходит в ошибку.
 * `null` — свободно (насколько об этом можно судить, не спросив систему).
 */
export function systemConflict(spec: string): string | null {
  const normalized = normalizeShortcut(spec);
  return normalized === null ? null : (SYSTEM[normalized] ?? null);
}

/** Только модификаторы, без клавиши, — «живой» показ во время записи. */
export function modifiersFromEvent(event: {
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}): Modifier[] {
  const modifiers: Modifier[] = [];
  if (event.ctrlKey) modifiers.push('Control');
  if (event.altKey) modifiers.push('Alt');
  if (event.shiftKey) modifiers.push('Shift');
  if (event.metaKey) modifiers.push('Super');
  return modifiers;
}

export interface RecordedKey {
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  /** `KeyboardEvent.code` — код клавиши, независимый от раскладки. */
  code: string;
  /** `KeyboardEvent.key` — им отличаем нажатие самого модификатора. */
  key: string;
}

/**
 * Что получилось из нажатия.
 *   `pending`   — нажаты только модификаторы, ждём последнюю клавишу;
 *   `shortcut`  — сочетание собрано;
 *   `no-modifier` — клавиша без модификаторов: глобальным хоткеем такое
 *                 вешать нельзя, оно отняло бы букву у всей системы.
 */
export type RecordResult =
  | { kind: 'pending'; modifiers: Modifier[] }
  | { kind: 'shortcut'; spec: string }
  | { kind: 'no-modifier' };

export function recordFromEvent(event: RecordedKey): RecordResult {
  const modifiers = modifiersFromEvent(event);
  if (MODIFIER_KEYS.has(event.key)) return { kind: 'pending', modifiers };
  if (modifiers.length === 0) return { kind: 'no-modifier' };
  return { kind: 'shortcut', spec: formatShortcut({ modifiers, key: event.code }) };
}
