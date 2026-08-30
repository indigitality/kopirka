import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

/** Раскладка вариантов — раздел 4 спеки. */
const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-linear-to-b from-accent to-accent-deep text-accent-ink font-medium hover:from-accent-hover hover:to-accent',
  secondary: 'bg-surface-raised text-ink border border-line-strong hover:bg-surface-hover',
  ghost: 'bg-transparent text-ink-muted hover:bg-surface-hover hover:text-ink',
  danger: 'bg-danger-soft text-danger hover:brightness-125',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-sm gap-1.5',
  md: 'h-[var(--size-row)] px-3 text-base gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Слот под иконку слева. */
  icon?: ReactNode;
  /** Слот под хоткей справа: моно, приглушённый. */
  hotkey?: string;
  /** Растянуть на всю доступную ширину. */
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, hotkey, fullWidth, className, children, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-md whitespace-nowrap',
        'transition-colors duration-[var(--dur-fast)] ease-out',
        'disabled:pointer-events-none disabled:opacity-40',
        VARIANT[variant],
        SIZE[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {icon ? <span className="flex size-4 shrink-0 items-center justify-center">{icon}</span> : null}
      {children ? <span className="truncate">{children}</span> : null}
      {hotkey ? <span className="ml-0.5 shrink-0 font-mono text-2xs opacity-60">{hotkey}</span> : null}
    </button>
  );
});
