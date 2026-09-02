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
 */
import type { TargetAndTransition } from 'motion/react';
import { DUR_BASE, DUR_FAST, EASE_OUT } from '@/lib/motion';

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

/** Скрим модалки: только прозрачность. */
export const scrimMotion = (): LayerMotionProps => layerMotion({ reduced: true });

/** Поповер, меню, модалка: подъём с лёгким масштабом. */
export const overlayMotion = (reduced: boolean, y = -4): LayerMotionProps =>
  layerMotion({ y, scale: 0.97, reduced });

/** Тултип: вход `--dur-fast`, выход ещё короче. */
export const tooltipMotion = (reduced: boolean): LayerMotionProps =>
  layerMotion({ y: 2, scale: 0.96, enter: DUR_FAST, exit: DUR_EXIT_FAST, reduced });
