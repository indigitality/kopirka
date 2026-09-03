/**
 * Поле ввода. Канон — R10 · «Путь библиотеки», R11 · онбординг и R14 ·
 * «Добавить тег»: высота 34, заливка `control`, радиус `--radius-md`,
 * поля 10, текст 14/18, плейсхолдер `ink-faint`.
 *
 * Обводки в покое нет — она появляется по фокусу и всегда лаймовая, как у
 * активного поля поиска (R05). Держим её на `box-shadow`, а не на `border`:
 * рамка на границе меняла бы внутренние размеры и текст дёргался бы на 1 px.
 */
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
        'h-[var(--size-field)] w-full rounded-md bg-control px-2.5',
        'text-md leading-[18px] text-ink placeholder:text-ink-faint',
        'transition-[background-color,box-shadow] duration-[var(--dur-fast)] ease-out',
        'hover:bg-control-hover',
        'focus:bg-control focus:shadow-[inset_0_0_0_1px_var(--color-brand)] focus:outline-none',
        'disabled:pointer-events-none disabled:opacity-40',
        className,
      )}
      {...rest}
    />
  );
});
