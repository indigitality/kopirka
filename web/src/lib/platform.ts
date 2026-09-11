/**
 * Определение платформы окна: подписи хоткеев и платформенные строки интерфейса.
 *
 * Оболочка выставляет на `<html>` атрибут `data-kopirka-platform` (`macos`
 * либо `windows`) синхронно до первого кадра — контракт с десктопной
 * обёрткой, тот же дух, что у `--kopirka-titlebar-inset` в `tokens.css`.
 * В браузере (не в оболочке) атрибута нет: весь модуль в этом случае молча
 * вырождается в macOS-набор — так вело себя приложение до Windows-сборки,
 * и по умолчанию это поведение не меняем (см. отчёт агента).
 *
 * Соседствует с `tauri.ts` (мост к Tauri API): там — про то, доступна ли
 * нативная оболочка вообще, здесь — про то, какая именно это ОС и как
 * подписывать её органы управления.
 */

export type KopirkaPlatform = 'macos' | 'windows';

/** Сырое значение атрибута. `undefined` — вне оболочки (браузер) или атрибут ещё не поставлен. */
export function shellPlatform(): KopirkaPlatform | undefined {
  if (typeof document === 'undefined') return undefined;
  const value = document.documentElement.dataset.kopirkaPlatform;
  return value === 'macos' || value === 'windows' ? value : undefined;
}

/** Windows-сборка. */
export function isWindowsShell(): boolean {
  return shellPlatform() === 'windows';
}

/** Оболочка macOS. Вне оболочки (браузер) — тоже `false`: это честный ответ «не в оболочке», а не «умолчание macOS». */
export function isMacShell(): boolean {
  return shellPlatform() === 'macos';
}

/**
 * Mac ли под нами вообще — в оболочке по атрибуту, в браузере по user-agent.
 * Отличается от `isMacShell` нарочно: вопрос «что делает ctrl+клик» решает сама
 * система, а не то, запущены мы в окне приложения или в Safari рядом.
 */
export function isMacLike(): boolean {
  const shell = shellPlatform();
  if (shell !== undefined) return shell === 'macos';
  if (typeof navigator === 'undefined') return false;
  const source = `${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`;
  return /mac|iphone|ipad|ipod/i.test(source);
}

/**
 * Подпись хоткея под текущую платформу: на Windows заменяет command-символ
 * на «Ctrl+» — ⌘K → Ctrl+K, ⌘C → Ctrl+C, ⌘V → Ctrl+V, ⌘1 / ⌘2 / ⌘3 →
 * Ctrl+1 / Ctrl+2 / Ctrl+3. Вне Windows-оболочки (macOS и браузер) возвращает
 * подпись как есть — символ ⌘ был единственной до появления Windows-сборки.
 *
 * Логику самих хоткеев не трогает: обработчики уже читают `metaKey ||
 * ctrlKey` (`useGridHotkeys`, `SearchField`) и на Windows реагируют на Ctrl
 * сами по себе — это только про то, что показано человеку.
 */
export function hotkeyLabel(macLabel: string): string {
  return isWindowsShell() ? macLabel.replace(/⌘/g, 'Ctrl+') : macLabel;
}

interface PlatformStrings {
  /** Имя системного файлового менеджера в именительном падеже — «Finder», «Проводник». */
  fileManager: string;
  /**
   * Тот же файловый менеджер в предложном падеже, с предлогом — «в Finder»,
   * «в Проводнике». «Проводник» склоняется, «Finder» в русском тексте нет
   * (несклоняемое заимствование), поэтому падеж хранится строкой, а не
   * выводится склонением на лету.
   */
  inFileManager: string;
  /** Пункт контекстного меню карточки: «Показать в Finder» / «Показать в Проводнике». */
  revealMenuItem: string;
  /** Короткая подпись кнопки в панели деталей: «В Finder» / «В Проводнике». */
  revealButton: string;
  /** Тост при ошибке открытия файлового менеджера. */
  revealFailedToast: string;
  /** Путь библиотеки по умолчанию, как его увидит пользователь этой ОС. */
  defaultLibraryPath: string;
}

const PLATFORM_STRINGS: Record<KopirkaPlatform, PlatformStrings> = {
  macos: {
    fileManager: 'Finder',
    inFileManager: 'в Finder',
    revealMenuItem: 'Показать в Finder',
    revealButton: 'В Finder',
    revealFailedToast: 'Не удалось открыть Finder',
    defaultLibraryPath: '~/Pictures/Копирка',
  },
  windows: {
    fileManager: 'Проводник',
    inFileManager: 'в Проводнике',
    revealMenuItem: 'Показать в Проводнике',
    revealButton: 'В Проводнике',
    revealFailedToast: 'Не удалось открыть Проводник',
    // %USERPROFILE%\Pictures\Копирка — стандартная библиотека изображений Windows.
    defaultLibraryPath: String.raw`%USERPROFILE%\Pictures\Копирка`,
  },
};

/**
 * Платформенные строки интерфейса — имена системных программ и путей, которые
 * иначе разошлись бы по компонентам локальными тернарниками. Вне
 * Windows-оболочки всегда возвращает набор macOS (браузер ведёт себя как раньше).
 */
export function platformStrings(): PlatformStrings {
  return PLATFORM_STRINGS[isWindowsShell() ? 'windows' : 'macos'];
}
