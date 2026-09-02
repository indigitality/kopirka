/**
 * Мостик к десктопной оболочке. Тот же самый бандл открывается и в обычном браузере
 * (`npm run dev`, `http://127.0.0.1:43117` в Safari), поэтому всё здесь обязано
 * молча вырождаться в «ничего не умеем».
 *
 * Код плагина подтягивается динамическим `import()`: в браузерной сборке он остаётся
 * отдельным чанком, который никогда не запрашивается, и главный бандл не тяжелеет.
 */

/**
 * Работаем ли внутри окна Tauri. `__TAURI_INTERNALS__` кладёт в окно сама оболочка
 * до загрузки страницы; в браузере его нет и быть не может.
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export interface PickDirectoryOptions {
  /** С какой папки открыть диалог. */
  defaultPath?: string;
  /** Заголовок окна диалога. */
  title?: string;
}

/**
 * Системный выбор папки. Возвращает абсолютный путь, `null` — отмена диалога
 * или запуск в браузере, где нативного диалога нет.
 *
 * Исключения не глотает: вызывающий экран показывает причину под полем.
 */
export async function pickDirectory(options: PickDirectoryOptions = {}): Promise<string | null> {
  if (!isTauri()) return null;
  const { open } = await import('@tauri-apps/plugin-dialog');
  // Тильду системный диалог не разворачивает, а «~/Pictures/Копирка» — ровно то, что
  // стоит в поле по умолчанию. Неабсолютный путь просто не передаём: macOS откроет
  // папку по своему усмотрению, и это лучше, чем прыжок в несуществующий каталог.
  const defaultPath =
    options.defaultPath !== undefined && options.defaultPath.startsWith('/')
      ? options.defaultPath
      : undefined;
  const selected = await open({
    directory: true,
    multiple: false,
    defaultPath,
    title: options.title,
  });
  // multiple: false и directory: true дают строку либо null; массив сюда не приходит.
  return typeof selected === 'string' ? selected : null;
}
