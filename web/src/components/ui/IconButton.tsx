/**
 * Квадратная кнопка с одной иконкой. Канон — R13 · «Кнопка-иконка 32×32 ·
 * обычная и опасная», плюс стеклянные кнопки детального просмотра R09.
 *
 * Обычная: 32×32, радиус `--radius-md`, заливка `control`, иконка `ink`.
 * Опасная: та же геометрия, `danger-tint` + `danger` (корзина в панели выделения
 * стоит на 28 — это `size="sm"`).
 * Стеклянная: `.glass` — крестик и счётчик просмотра лежат прямо на картинке,
 * круглые стрелки (`size="lg" shape="round"`) — там же.
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type IconButtonVariant = 'ghost' | 'secondary' | 'danger' | 'glass';
export type IconButtonSize = 'sm' | 'md' | 'lg';
export type IconButtonShape = 'square' | 'round';

const VARIANT: Record<IconButtonVariant, string> = {
  ghost: 'bg-transparent text-ink-muted hover:bg-control hover:text-ink active:bg-control-hover',
  secondary: 'bg-control text-ink hover:bg-control-hover active:bg-control-active',
  danger: 'bg-danger-tint text-danger hover:brightness-125 active:brightness-110',
  /* Стекло даёт `.glass`: цвет, размытие подложки и край. Ховер — подсветка поверх. */
  glass: 'glass text-ink hover:bg-raised-hover',
};

const SIZE: Record<IconButtonSize, string> = {
  sm: 'size-7', // 28 — корзина в панели выделения (R13 · стекло)
  md: 'size-8', // 32 — «⋮» заголовка, крестик модалки
  lg: 'size-10', // 40 — круглые стрелки просмотра (R09)
};

const SHAPE: Record<IconButtonShape, string> = {
  square: 'rounded-md',
  round: 'rounded-pill',
};

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  /** Круглая — только стрелки просмотра. По умолчанию квадрат с радиусом 8. */
  shape?: IconButtonShape;
  /** Обязательна: у кнопки нет текста. */
  label: string;
  children: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = 'ghost', size = 'md', shape = 'square', label, className, children, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      aria-label={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center',
        'transition-[color,background-color,filter,transform] duration-[var(--dur-fast)] ease-out',
        'active:scale-[0.97]',
        'disabled:pointer-events-none disabled:opacity-40',
        VARIANT[variant],
        SIZE[size],
        SHAPE[shape],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
