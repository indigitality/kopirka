/**
 * Общий рецепт появления при прокрутке: blur 8 → 0, y 12 → 0, opacity 0 → 1,
 * пружина 380/32, один раз. Для списков — задержка `STAGGER` × индекс.
 * При «уменьшить движение» остаётся только прозрачность (см. `revealMotion`).
 */
import type { CSSProperties, ReactNode } from 'react';
import { motion } from 'motion/react';
import { revealMotion, STAGGER } from '@/lib/motion';
import { useReducedMotion } from '@/lib/useReducedMotion';

/**
 * Готовые обёртки. Собраны один раз на модуль, а не в рендере: `motion.create`
 * внутри компонента возвращал бы каждый раз новый тип, и React пересоздавал бы
 * поддерево на каждом кадре.
 */
const TAGS = {
  div: motion.div,
  li: motion.li,
  p: motion.p,
  h2: motion.h2,
  h3: motion.h3,
} as const;

export interface RevealProps {
  children: ReactNode;
  /** Порядковый номер в списке: задержка 60 мс на шаг. */
  index?: number;
  /** Тег обёртки. */
  as?: keyof typeof TAGS;
  className?: string;
  style?: CSSProperties;
}

export function Reveal({ children, index = 0, as = 'div', className, style }: RevealProps) {
  const reduced = useReducedMotion();
  const { initial, animate, transition } = revealMotion(reduced, index * STAGGER);
  const Tag = TAGS[as];

  return (
    <Tag
      className={className}
      style={style}
      initial={initial}
      whileInView={animate}
      viewport={{ once: true, amount: 0.25, margin: '0px 0px -10% 0px' }}
      transition={transition}
    >
      {children}
    </Tag>
  );
}
