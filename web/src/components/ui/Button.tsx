/**
 * Кнопка редизайна. Канон — R13 · «Кнопки и контролы · высота 32» (полка элементов)
 * и подвалы модалок R14.
 *
 * Геометрия одна на все варианты: высота 32, поля 12, радиус `--radius-md`,
 * зазор 8, текст 14/18 вес 500. Отличается только заливка:
 *   primary       лайм `brand` + текст `brand-ink`        («Скопировать ⌘C», «Переместить»)
 *   secondary     `control` + `ink`                        («В Finder», «Отмена»)
 *   ghost         без заливки + `ink-muted`                («Отменить», «Сбросить»)
 *   danger        `danger-tint` + `danger`                 («Удалить этот»)
 *   danger-solid  сплошной `danger` + `danger-ink`         («Очистить корзину», «Удалить навсегда»)
 *
 * Нажатие — scale 0.97 (`PRESS_SCALE`) на CSS, а не через `pressMotion`: кнопку
 * постоянно оборачивают в Radix-триггеры с `asChild`, и `motion.button` под
 * клонированием прав на `transform` не удерживает — пружина ломается ровно там,
 * где она заметнее всего. Форма движения та же, длительность `--dur-fast`.
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-solid';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-brand-ink hover:bg-brand-hover active:bg-brand-deep',
  secondary: 'bg-control text-ink hover:bg-control-hover active:bg-control-active',
  ghost: 'bg-transparent text-ink-muted hover:bg-control hover:text-ink active:bg-control-hover',
  /* Мягкая опасная: подложка `danger-tint` уже в покое, иначе кнопка не читается. */
  danger: 'bg-danger-tint text-danger hover:brightness-125 active:brightness-110',
  /* Необратимое действие — сплошная заливка, чтобы не путалась с «Отменой». */
  'danger-solid': 'bg-danger text-danger-ink hover:brightness-110 active:brightness-95',
};

const SIZE: Record<ButtonSize, string> = {
  /* Уменьшенная — вне полки; та же логика, на два пункта плотнее. */
  sm: 'h-7 gap-1.5 px-2.5 text-base',
  md: 'h-[var(--size-row)] gap-2 px-3 text-md leading-[18px]',
  /* Большая кнопка онбординга «Создать библиотеку» (R11): выше, текст тот же. */
  lg: 'h-[var(--size-row-lg)] gap-2 px-3 text-md leading-[18px]',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Слот под иконку слева. Ждёт `<Icon>` из `lib/icons` (16 px). */
  icon?: ReactNode;
  /** Слот под хоткей справа: 10 px, приглушённый — как «⌘C» на полке R13. */
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
        'inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap select-none',
        'transition-[color,background-color,filter,transform] duration-[var(--dur-fast)] ease-out',
        'active:scale-[0.97]',
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
      {/*
        Хоткей на полке R13 набран цветом самой кнопки на 55 % — не отдельным
        токеном: так он одинаково работает и на лайме, и на тёмном.
      */}
      {hotkey ? (
        <span className="ml-0.5 shrink-0 text-2xs leading-[14px] font-normal opacity-55">{hotkey}</span>
      ) : null}
    </button>
  );
});
