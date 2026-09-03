/**
 * Бейдж — короткое число или пометка. Два разных места в редизайне:
 *
 *   brand   — счётчик у кнопки «Фильтр» и в шапке панели фильтров (R05):
 *             просто лаймовые цифры 10/14, без подложки;
 *   count   — тот же счётчик приглушённым (число тегов у строки фильтра);
 *   neutral — плашка поверх превью: тёмный чип с размытием (R13 · карточка);
 *   danger  — «битый файл»: `danger-tint` + `danger`.
 *
 * Плашки поверх карточки — это на самом деле `Chip` (`variant="dark"` / `light`).
 * `neutral` и `danger` оставлены, чтобы не ломать сетку до её миграции.
 */
import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type BadgeVariant = 'neutral' | 'danger' | 'brand' | 'count';

const VARIANT: Record<BadgeVariant, string> = {
  neutral: 'chip-dark h-[var(--size-chip-mini)] rounded-sm px-1.5 tracking-label',
  danger: 'bg-danger-tint text-danger h-[var(--size-chip-mini)] rounded-sm px-1.5 tracking-label',
  /* Счётчик активных фильтров: цифры лаймом, фона нет (R05 · «Фильтр»). */
  brand: 'text-brand leading-[14px]',
  count: 'text-ink-faint leading-[14px]',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { variant = 'neutral', className, children, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex max-w-full shrink-0 items-center text-2xs font-medium whitespace-nowrap tabular-nums',
        VARIANT[variant],
        className,
      )}
      {...rest}
    >
      <span className="truncate">{children}</span>
    </span>
  );
});
