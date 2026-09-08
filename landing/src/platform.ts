/**
 * Какая система у посетителя — и что от этого меняется в тексте страницы.
 *
 * Сборок с 09.09.2026 две, и половина текста на странице платформенная:
 * хоткеи (⌘V ↔ Ctrl+V), имя файлового менеджера (Finder ↔ Проводник), путь
 * библиотеки. Модуль повторяет решение, уже принятое в приложении
 * (`app/web/src/lib/platform.ts`): там платформу сообщает оболочка атрибутом
 * `data-kopirka-platform`, здесь её приходится определять по браузеру.
 *
 * Правило то же, что в приложении: **набор macOS — умолчание**. Windows-набор
 * показывается только когда браузер прямо говорит, что это Windows; во всех
 * прочих случаях (`other` — Linux, телефон, неизвестный браузер) страница
 * выглядит так, как выглядела до появления Windows-сборки.
 *
 * Посмотреть глазами обе версии текста можно параметром адреса — `?os=windows`,
 * `?os=macos`, `?os=other`. Тот же приём, что `?hero=video` у первого экрана:
 * ни виртуалки, ни подмены userAgent не нужно.
 */
import { useState } from 'react';

/** Системы, под которые есть сборки. */
export type PlatformId = 'macos' | 'windows';

/** Что мы знаем о системе гостя. `other` — ни Windows, ни Mac. */
export type Platform = PlatformId | 'other';

/** Имя параметра адреса для ручной проверки. */
const PARAM = 'os';

function fromQuery(): Platform | null {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get(PARAM);
  return value === 'windows' || value === 'macos' || value === 'other' ? value : null;
}

/**
 * Определение по браузеру. Смотрим сразу три источника: `userAgentData.platform`
 * (Chrome отдаёт «Windows» / «macOS» без запроса разрешений), устаревший
 * `navigator.platform` («Win32», «MacIntel») и userAgent — вместе они закрывают
 * и Safari, и Firefox, и старые версии.
 */
export function detectPlatform(): Platform {
  const forced = fromQuery();
  if (forced) return forced;
  if (typeof navigator === 'undefined') return 'other';

  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const hint = `${nav.userAgentData?.platform ?? ''} ${nav.platform ?? ''} ${nav.userAgent}`;

  // Телефон и планшет — всегда `other`: сборок под них нет, и обещать
  // человеку с телефона «похоже, у вас macOS» незачем. iPad с iPadOS 13+
  // представляется как «MacIntel»; отличает его число тач-точек — у Mac ноль.
  if (/iphone|ipod|android/i.test(hint)) return 'other';
  if (/ipad/i.test(hint) || (/mac/i.test(hint) && nav.maxTouchPoints > 1)) return 'other';

  if (/win(dows|32|64)/i.test(hint)) return 'windows';
  if (/mac/i.test(hint)) return 'macos';
  return 'other';
}

/**
 * Платформа для разметки. Читается один раз, до первого кадра: ни адрес, ни
 * браузер за время жизни страницы не меняются, а платформенный текст не должен
 * подмениваться у посетителя на глазах (так же лениво читает ширину
 * `useCompact`).
 */
export function usePlatform(): Platform {
  const [platform] = useState(detectPlatform);
  return platform;
}

/** Windows ли это — с оговоркой «мы уверены». */
export function isWindows(platform: Platform): boolean {
  return platform === 'windows';
}

/**
 * Платформенные слова. Значения — те же строки, что показывает само
 * приложение (`app/web/src/lib/platform.ts`, `PLATFORM_STRINGS`): человек
 * должен встретить в интерфейсе ровно то, что прочитал на странице.
 * «Проводник» склоняется, «Finder» в русском тексте нет, поэтому падежи
 * хранятся строками, а не выводятся на лету.
 */
export interface PlatformCopy {
  /** Имя файлового менеджера: «Finder» / «Проводник». */
  fileManager: string;
  /** Родительный с предлогом: «из Finder» / «из Проводника». */
  fromFileManager: string;
  /** Предложный с предлогом: «в Finder» / «в Проводнике». */
  inFileManager: string;
  /** Пункт контекстного меню карточки — ровно как в приложении. */
  revealMenuItem: string;
}

const COPY: Record<PlatformId, PlatformCopy> = {
  macos: {
    fileManager: 'Finder',
    fromFileManager: 'из Finder',
    inFileManager: 'в Finder',
    revealMenuItem: 'Показать в Finder',
  },
  windows: {
    fileManager: 'Проводник',
    fromFileManager: 'из Проводника',
    inFileManager: 'в Проводнике',
    revealMenuItem: 'Показать в Проводнике',
  },
};

/** Слова под систему гостя. Всё, что не Windows, получает набор macOS. */
export function platformCopy(platform: Platform): PlatformCopy {
  return COPY[platform === 'windows' ? 'windows' : 'macos'];
}

/**
 * Подпись хоткея: на Windows command-символ заменяется на «Ctrl+» — ⌘K →
 * Ctrl+K, ⌘C → Ctrl+C, ⌘V → Ctrl+V. Ровно та же функция, что в приложении
 * (`hotkeyLabel`), и ровно те же сочетания: обработчики там читают
 * `metaKey || ctrlKey`, так что Ctrl на Windows работает сам по себе.
 *
 * Мак-хоткеи, которых на Windows нет вовсе (⌥⌘C — захват области), через эту
 * функцию не проводятся: их нечем заменить, о них сказано отдельно.
 */
export function hotkey(macLabel: string, platform: Platform): string {
  return platform === 'windows' ? macLabel.replace(/⌘/g, 'Ctrl+') : macLabel;
}
