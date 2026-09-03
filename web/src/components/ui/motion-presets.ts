/**
 * Пресеты появления и ухода слоёв: модалка, поповер, меню, тултип.
 *
 * Живут здесь, а не в `lib/motion.ts`: тот файл сейчас за другим агентом.
 * Значения — те же, что в токенах (`--ease-in`, `--dur-exit`): motion принимает
 * числа, а не CSS-переменные, поэтому они дублируются. Когда `lib/motion.ts`
 * освободится, константы переезжают туда, а этот файл остаётся реэкспортом.
 *
 * Правило системы (дизайн-аудит §8.3): **вход `--ease-out`, выход `--ease-in`,
 * выход всегда короче входа** — 200 → 140. Иначе слой «прилипает» к экрану.
 *
 * Редизайн (Paper, R13 · «Стекло и движение») добавляет второе семейство —
 * пружинное: `glassLayerMotion`, `modalMotion`, `pressMotion`,
 * `toastStackMotion`. Кривые и длительности там не участвуют, всё держит
 * `SPRING_PANEL`. Старые пресеты не тронуты: на них ещё стоят немигрированные
 * слои, и ломать их посреди редизайна нельзя.
 */
import type { TargetAndTransition } from 'motion/react';
import {
  BLUR_ENTER,
  BLUR_MODAL,
  DUR_BASE,
  DUR_FAST,
  DUR_SCRIM,
  EASE_OUT,
  MODAL_SCALE,
  PRESS_SCALE,
  SHIFT_ENTER,
  SPRING_PANEL,
  SPRING_PANEL_EXIT,
  TOAST_STACK_FADE,
  TOAST_STACK_SHIFT,
} from '@/lib/motion';

/** Кривая ухода. Дубль `--ease-in` из токенов. */
export const EASE_IN = [0.4, 0, 1, 1] as const;

/** Уход слоя, секунды. Дубль `--dur-exit` (140 мс). */
export const DUR_EXIT = 0.14;

/** Уход мелкого слоя — тултипа: он и входит быстрее. */
export const DUR_EXIT_FAST = 0.1;

export interface LayerMotionOptions {
  /** Сдвиг по вертикали в состоянии «нет на экране», px. */
  y?: number;
  /** Масштаб в состоянии «нет на экране». */
  scale?: number;
  /** Длительность входа, секунды. */
  enter?: number;
  /** Длительность ухода, секунды. */
  exit?: number;
  /** Системная настройка «уменьшить движение»: сдвиг и масштаб отключаются. */
  reduced?: boolean;
}

export interface LayerMotionProps {
  initial: TargetAndTransition;
  animate: TargetAndTransition;
  exit: TargetAndTransition;
}

/**
 * Пропы для `motion.div` внутри `AnimatePresence`.
 *
 * Кривая и длительность лежат внутри `animate` и `exit`, а не в общем
 * `transition`: у входа и ухода они разные, а общий проп один на оба.
 */
export function layerMotion({
  y = 0,
  scale = 1,
  enter = DUR_BASE,
  exit = DUR_EXIT,
  reduced = false,
}: LayerMotionOptions = {}): LayerMotionProps {
  const hidden: TargetAndTransition = reduced ? { opacity: 0 } : { opacity: 0, y, scale };
  const shown: TargetAndTransition = reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 };

  return {
    initial: hidden,
    animate: { ...shown, transition: { duration: enter, ease: EASE_OUT } },
    exit: { ...hidden, transition: { duration: exit, ease: EASE_IN } },
  };
}

/**
 * Скрим модалки: только прозрачность, 0 → 72 % за 160 мс (R13 · движение).
 * Целевую непрозрачность ставит сам компонент (`--color-scrim` уже с 72 %),
 * здесь — только длительность; скрим и тело модалки стартуют одновременно.
 */
export const scrimMotion = (): LayerMotionProps =>
  layerMotion({ reduced: true, enter: DUR_SCRIM, exit: DUR_SCRIM });

/** Поповер, меню, модалка: подъём с лёгким масштабом. */
export const overlayMotion = (reduced: boolean, y = -4): LayerMotionProps =>
  layerMotion({ y, scale: 0.97, reduced });

/** Тултип: вход `--dur-fast`, выход ещё короче. */
export const tooltipMotion = (reduced: boolean): LayerMotionProps =>
  layerMotion({ y: 2, scale: 0.96, enter: DUR_FAST, exit: DUR_EXIT_FAST, reduced });


/* ── Редизайн: пружинное семейство ───────────────────────────────────────── */

/** Откуда слой приезжает на место. Сдвиг — `SHIFT_ENTER` (8 px) по этой оси. */
export type LayerFrom = 'top' | 'bottom' | 'left' | 'right';

/**
 * Смещение «нет на экране» по стороне.
 *
 * Соответствие пропу `side` у Radix (сторона якоря, на которой стоит слой):
 * side="bottom" → from="top" (слой выезжает вниз), side="top" → from="bottom",
 * side="right" → from="left", side="left" → from="right".
 * Тост и панель выделения стоят у нижнего края экрана — им from="bottom".
 */
function offsetFrom(from: LayerFrom): { x?: number; y?: number } {
  switch (from) {
    case 'top':
      return { y: -SHIFT_ENTER };
    case 'bottom':
      return { y: SHIFT_ENTER };
    case 'left':
      return { x: -SHIFT_ENTER };
    case 'right':
      return { x: SHIFT_ENTER };
  }
}

/** Сторона якоря у Radix (`side`) — тот же набор имён, что и `LayerFrom`. */
export type RadixSide = 'top' | 'right' | 'bottom' | 'left';

/**
 * Перевод `side` Radix в сторону приезда слоя: слой выезжает от якоря,
 * то есть с противоположной стороны от той, где он встал.
 * side="bottom" (слой под кнопкой) → from="top".
 */
export function sideToFrom(side: RadixSide | undefined): LayerFrom {
  switch (side) {
    case 'top':
      return 'bottom';
    case 'left':
      return 'right';
    case 'right':
      return 'left';
    default:
      return 'top';
  }
}

export interface GlassLayerMotionOptions {
  /** Откуда слой приезжает. По умолчанию сверху — как поповер под кнопкой. */
  from?: LayerFrom;
  /** Системная настройка «уменьшить движение»: остаётся только прозрачность. */
  reduced?: boolean;
}

/**
 * Плавающие панели, поповеры, тосты и тултипы редизайна:
 * blur 8 → 0, opacity 0 → 1, сдвиг 8 px к месту, пружина 380/32.
 * Уход — те же значения назад, вдвое быстрее (`SPRING_PANEL_EXIT`).
 */
export function glassLayerMotion({
  from = 'top',
  reduced = false,
}: GlassLayerMotionOptions = {}): LayerMotionProps {
  const hidden: TargetAndTransition = reduced
    ? { opacity: 0 }
    : { opacity: 0, filter: `blur(${BLUR_ENTER}px)`, x: 0, y: 0, ...offsetFrom(from) };
  const shown: TargetAndTransition = reduced
    ? { opacity: 1 }
    : { opacity: 1, filter: 'blur(0px)', x: 0, y: 0 };

  return {
    initial: hidden,
    animate: { ...shown, transition: reduced ? { duration: DUR_FAST } : SPRING_PANEL },
    exit: { ...hidden, transition: reduced ? { duration: DUR_FAST } : SPRING_PANEL_EXIT },
  };
}

/**
 * Тело модалки: scale 0.96 → 1 и blur 6 → 0 на той же пружине.
 * Скрим — `scrimMotion()`, он стартует одновременно и идёт 160 мс.
 */
export function modalMotion(reduced = false): LayerMotionProps {
  const hidden: TargetAndTransition = reduced
    ? { opacity: 0 }
    : { opacity: 0, scale: MODAL_SCALE, filter: `blur(${BLUR_MODAL}px)` };
  const shown: TargetAndTransition = reduced
    ? { opacity: 1 }
    : { opacity: 1, scale: 1, filter: 'blur(0px)' };

  return {
    initial: hidden,
    animate: { ...shown, transition: reduced ? { duration: DUR_SCRIM } : SPRING_PANEL },
    exit: { ...hidden, transition: reduced ? { duration: DUR_SCRIM } : SPRING_PANEL_EXIT },
  };
}

export interface PressMotionProps {
  whileTap?: TargetAndTransition;
}

/**
 * Нажатие кнопки или строки: scale 0.97, отпускание пружиной.
 * При «уменьшить движение» нажатие не отзывается вовсе — возвращается `{}`.
 */
export function pressMotion(reduced = false): PressMotionProps {
  if (reduced) return {};
  return { whileTap: { scale: PRESS_SCALE, transition: SPRING_PANEL } };
}

/**
 * Стопка тостов: новый снизу, каждый следующий сверху уезжает на 8 px вверх
 * и теряет 20 % непрозрачности. `depth` — сколько тостов пришло после этого
 * (0 у самого нижнего, свежего).
 */
export function toastStackMotion(depth: number, reduced = false): TargetAndTransition {
  const opacity = Math.max(0, 1 - TOAST_STACK_FADE * depth);
  if (reduced) return { opacity, transition: { duration: DUR_FAST } };
  return { y: -TOAST_STACK_SHIFT * depth, opacity, transition: SPRING_PANEL };
}
