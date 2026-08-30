import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type BadgeVariant = 'neutral' | 'danger';

/** Плашка поверх карточки — раздел 2 спеки. Текст всегда моно. */
const VARIANT: Record<BadgeVariant, string> = {
  neutral: 'bg-scrim-badge text-ink backdrop-blur-[6px]',
  danger: 'bg-danger-soft text-danger',
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
        'inline-flex max-w-full items-center rounded-xs px-1.5 py-0.5',
        'font-mono text-2xs leading-tight whitespace-nowrap',
        VARIANT[variant],
        className,
      )}
      {...rest}
    >
      <span className="truncate">{children}</span>
    </span>
  );
});
