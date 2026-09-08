/**
 * Два варианта первого экрана — чтобы Сергей мог сравнить их на живом сайте.
 *
 *   `shot`  — как было: шейдерный фон и снимок приложения под текстом.
 *   `video` — фон-петля `media/hero-loop.webm` во весь экран, снимка нет,
 *             под текстом градиент.
 *
 * Переключается адресом: `?hero=video` и `?hero=shot`. Без параметра страница
 * работает как раньше (`shot`) — публичная ссылка ничего не знает о сравнении.
 * Когда параметр есть, внизу появляется переключатель `VariantSwitch`.
 *
 * // Временный механизм на время выбора. Когда Сергей решит — вариант
 * // зашивается в `Hero`, а этот файл и `VariantSwitch.tsx` удаляются.
 */
export type HeroVariant = 'shot' | 'video';

/** Имя параметра в адресной строке. */
const PARAM = 'hero';

/** Значение параметра, если оно вообще задано и осмысленно. */
function readParam(): HeroVariant | null {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get(PARAM);
  return value === 'video' || value === 'shot' ? value : null;
}

/** Какой вариант показывать. По умолчанию — прежний. */
export function readHeroVariant(): HeroVariant {
  return readParam() ?? 'shot';
}

/** Открыта ли страница в режиме сравнения (в адресе есть `?hero=…`). */
export function isVariantPreview(): boolean {
  return readParam() !== null;
}

/** Адрес той же страницы с другим вариантом. */
export function variantHref(variant: HeroVariant): string {
  if (typeof window === 'undefined') return `?${PARAM}=${variant}`;
  const url = new URL(window.location.href);
  url.searchParams.set(PARAM, variant);
  url.hash = '';
  return url.toString();
}
