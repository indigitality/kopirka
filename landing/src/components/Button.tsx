/**
 * Кнопка лендинга.
 *
 * Геометрия — DESIGN-SPEC §12 «Примитивы» и правка Сергея к фрейму A:
 * радиус всегда `--radius-md` 8 (в макете кнопки нарисованы пилюлями 999 —
 * это игнорируется намеренно), высоты только две:
 *   `nav` 32 — как `--size-row` в приложении, текст 14/18 · 500;
 *   `hero` 40 — как `--size-row-lg`, текст 15/20 · 500, поля 16.
 * Никаких 48–56 px, которыми набран макет.
 *
 * Варианты: `primary` — сплошной лайм с текстом `--color-brand-ink`;
 * `secondary` — плотное стекло `--color-raised-glass` с контуром и размытием.
 * // Расхождение с макетом: в макете вторая кнопка нарисована полупрозрачной
 * // заливкой `--color-control` (10 %). На чёрном холсте это читалось, а на
 * // видеофоне первого экрана кнопка пропадала — сквозь неё лезли карточки.
 * // Правка Сергея 08.09.2026: непрозрачная подложка, контур и blur, чтобы
 * // кнопка держалась на любом фоне.
 *
 * Контур рисуется `box-shadow: inset`, а не `border`. Коробка тогда у обоих
 * вариантов одна в одну: настоящая рамка живёт в модели элемента, и любой
 * движок, который посчитает её чуть иначе (или размоет край под
 * `backdrop-filter`), делает вторую кнопку на пиксель-другой выше первой —
 * Сергей это и заметил 08.09.2026. Тень в модель не входит вовсе.
 * Нажатие — scale 0.97 пружиной (`pressMotion`).
 */
import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { pressMotion } from '@/lib/motion';
import { useReducedMotion } from '@/lib/useReducedMotion';

export type ButtonVariant = 'primary' | 'secondary';
export type ButtonSize = 'nav' | 'hero';

export interface ButtonProps {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
  /** Иконка слева от текста. */
  icon?: ReactNode;
  /** Правая приписка мелким шрифтом — вес образа в кнопке «Скачать». */
  meta?: ReactNode;
  /** Кнопка занимает всю ширину родителя (мобильный, ряд «Скачать»). */
  block?: boolean;
  ariaLabel?: string;
  className?: string;
}

const SIZES: Record<ButtonSize, { height: number; padX: number; font: number; line: number }> = {
  // Навигация — ровно как строка приложения: 32, текст 14/18.
  nav: { height: 32, padX: 12, font: 14, line: 18 },
  // Первый экран — 40, текст 15/20, поля 16 (правка Сергея).
  hero: { height: 40, padX: 16, font: 15, line: 20 },
};

export function Button({
  href,
  variant = 'primary',
  size = 'hero',
  children,
  icon,
  meta,
  block = false,
  ariaLabel,
  className,
}: ButtonProps) {
  const reduced = useReducedMotion();
  const s = SIZES[size];
  const isPrimary = variant === 'primary';

  return (
    <motion.a
      href={href}
      aria-label={ariaLabel}
      className={[
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-[8px]',
        'font-medium no-underline transition-colors duration-[120ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
        isPrimary
          ? 'bg-brand text-brand-ink hover:bg-brand-hover'
          : 'bg-raised-glass text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)] backdrop-blur-[14px] hover:bg-raised',
        block ? 'w-full' : '',
        className ?? '',
      ].join(' ')}
      style={{
        height: s.height,
        paddingInline: s.padX,
        fontSize: s.font,
        lineHeight: `${s.line}px`,
        letterSpacing: 'var(--tracking-tight)',
      }}
      {...pressMotion(reduced)}
    >
      {icon}
      <span>{children}</span>
      {meta ? (
        <span
          className="tabular-nums"
          style={{ opacity: 0.55, fontWeight: 500, marginLeft: 2 }}
        >
          {meta}
        </span>
      ) : null}
    </motion.a>
  );
}
