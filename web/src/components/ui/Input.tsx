import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, type, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type ?? 'text'}
      className={cn(
        'h-[var(--size-row)] w-full rounded-md border border-line-strong bg-surface-raised px-3',
        'text-base text-ink placeholder:text-ink-faint',
        'transition-colors duration-[var(--dur-fast)] ease-out',
        // Фокус-кольцо как у всех: глушить его у одного поля — расхождение (аудит 4.32).
        'hover:border-ink-faint/60 focus:border-accent/70',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-ring',
        'disabled:pointer-events-none disabled:opacity-40',
        className,
      )}
      {...rest}
    />
  );
});
