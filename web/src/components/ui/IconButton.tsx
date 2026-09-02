import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type IconButtonVariant = 'ghost' | 'secondary' | 'danger';
export type IconButtonSize = 'sm' | 'md';

const VARIANT: Record<IconButtonVariant, string> = {
  ghost: 'bg-transparent text-ink-muted hover:bg-surface-hover hover:text-ink',
  secondary: 'bg-surface-raised text-ink border border-line-strong hover:bg-surface-hover',
  /* Спека §4: опасная — подложка danger-soft уже в покое, иначе корзина не читается. */
  danger: 'bg-danger-soft text-danger hover:brightness-125',
};

/** Квадратная кнопка: 32×32 и 28×28. */
const SIZE: Record<IconButtonSize, string> = {
  md: 'size-8',
  sm: 'size-7',
};

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  /** Обязательна: у кнопки нет текста. */
  label: string;
  children: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = 'ghost', size = 'md', label, className, children, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      aria-label={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md',
        'transition-[color,background-color,border-color,filter,transform] duration-[var(--dur-fast)] ease-out',
        'active:scale-[.98] active:brightness-[.94]',
        'disabled:pointer-events-none disabled:opacity-40',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
