/**
 * Язык движения лендинга.
 *
 * Значения перенесены из приложения — `app/web/src/lib/motion.ts` и
 * `app/web/src/components/ui/motion-presets.ts` (первоисточник там, он снят
 * с узла «Панель · Движение», артборд R13). Motion принимает числа, а не
 * CSS-переменные, поэтому константы дублируются, а не читаются из токенов.
 */
import type { TargetAndTransition, Transition } from 'motion/react';

/** Кривая входа. Дубль `--ease-out`. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Кривая ухода. Дубль `--ease-in`. */
export const EASE_IN = [0.4, 0, 1, 1] as const;

export const DUR_FAST = 0.12;
export const DUR_HOVER = 0.14;
export const DUR_BASE = 0.2;
export const DUR_SLOW = 0.32;

/** Пружина плавающих слоёв: жёсткость 380, демпфирование 32. */
export const SPRING_PANEL = { type: 'spring', stiffness: 380, damping: 32 } as const;

/** Размытие на входе слоя, px: blur 8 → 0. */
export const BLUR_ENTER = 8;

/** Нажатие кнопки: scale 0.97. */
export const PRESS_SCALE = 0.97;

/** Сдвиг блока при появлении по прокрутке, px. */
export const REVEAL_SHIFT = 12;

/** Задержка между соседями в списке, с. */
export const STAGGER = 0.06;

/** Задержка между словами заголовка первого экрана, с. */
export const WORD_STAGGER = 0.04;

export interface RevealProps {
  initial: TargetAndTransition;
  animate: TargetAndTransition;
  transition: Transition;
}

/**
 * Общий рецепт появления: blur 8 → 0, y 12 → 0, opacity 0 → 1, пружина 380/32.
 * При «уменьшить движение» остаётся только прозрачность.
 */
export function revealMotion(reduced: boolean, delay = 0): RevealProps {
  if (reduced) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      transition: { duration: DUR_BASE, ease: EASE_OUT, delay: 0 },
    };
  }
  return {
    initial: { opacity: 0, y: REVEAL_SHIFT, filter: `blur(${BLUR_ENTER}px)` },
    animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
    transition: { ...SPRING_PANEL, delay },
  };
}

/** Нажатие: scale 0.97 пружиной. При «уменьшить движение» отклика нет. */
export function pressMotion(reduced: boolean): { whileTap?: TargetAndTransition } {
  if (reduced) return {};
  return { whileTap: { scale: PRESS_SCALE, transition: SPRING_PANEL } };
}
