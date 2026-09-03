/**
 * Чип — единственная «пилюля» редизайна. Два семейства геометрии:
 *
 * ── мелкий, поверх превью (R13 · «Карточка сетки и чипы») ──
 *   высота 18, поля 6, радиус `--radius-sm`, текст 10/15 · 500 · `tracking-label`
 *     light  — теги на карточке и «+2»: белый 70 % + размытие + волосяная обводка
 *     dark   — имя папки на карточке: тёмный 80 % + размытие
 *     solid  — «Похоже дубль»: белый 95 %, вес 600
 *
 * ── крупный, внутри панели (R09 · теги, R05 · фильтры, R14 · подсказки) ──
 *   высота 26, поля 10, радиус `--radius-pill`, текст 12/16 · 500
 *     control — тег в панели просмотра, подсказка тега, невыбранный фильтр
 *     brand   — выбранный фильтр: лайм + `brand-ink`
 *     outline — «+ тег»: пунктир `line-strong`, текст `ink-muted`
 *
 * Чип фильтра нажимается — тогда `as="button"`. По умолчанию это `<span>`:
 * теги на карточке и «+N» кликов не принимают.
 */
import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { iconProps } from '@/lib/icons';

export type ChipVariant = 'light' | 'dark' | 'solid' | 'control' | 'brand' | 'outline';

/** Мелкие чипы лежат на картинке, крупные — на панели. Геометрия у них разная. */
const OVER_PREVIEW: ReadonlySet<ChipVariant> = new Set(['light', 'dark', 'solid']);

const MINI_GEOMETRY =
  'h-[var(--size-chip-mini)] gap-1 rounded-sm px-1.5 text-2xs leading-[15px] font-medium tracking-label';

const PILL_GEOMETRY = 'h-[var(--size-chip)] gap-1 rounded-pill px-2.5 text-sm leading-4 font-medium';

const VARIANT: Record<ChipVariant, string> = {
  light: 'chip-light',
  dark: 'chip-dark',
  /* Вес 600 — единственное отличие «Похоже дубль» от обычного светлого чипа. */
  solid: 'chip-solid font-semibold',
  control: 'bg-control text-ink',
  brand: 'bg-brand text-brand-ink',
  outline: 'border border-dashed border-line-strong text-ink-muted',
};

/** Что добавляется, когда чип нажимается. Покой не трогаем — он снят с макета. */
const INTERACTIVE: Record<ChipVariant, string> = {
  light: 'hover:brightness-105',
  dark: 'hover:brightness-125',
  solid: 'hover:brightness-105',
  control: 'hover:bg-control-hover active:bg-control-active',
  brand: 'hover:bg-brand-hover active:bg-brand-deep',
  outline: 'hover:border-line-control hover:text-ink',
};

export interface ChipProps extends HTMLAttributes<HTMLElement> {
  variant?: ChipVariant;
  /** `button` — чипы фильтров и «+ тег»; по умолчанию `span`. */
  as?: 'span' | 'button';
  /** Если задан — справа появляется «×» (теги в панели просмотра). */
  onRemove?: () => void;
  /** Подпись у «×» для скринридера. */
  removeLabel?: string;
  disabled?: boolean;
  children?: ReactNode;
}

export const Chip = forwardRef<HTMLElement, ChipProps>(function Chip(
  {
    variant = 'control',
    as = 'span',
    onRemove,
    removeLabel = 'Убрать',
    disabled,
    className,
    children,
    ...rest
  },
  ref,
) {
  const Root = as as 'span';
  const mini = OVER_PREVIEW.has(variant);
  const clickable = as === 'button';

  return (
    <Root
      ref={ref as never}
      {...(clickable ? { type: 'button' as const, disabled } : {})}
      className={cn(
        'inline-flex max-w-full shrink-0 items-center whitespace-nowrap select-none',
        'transition-[color,background-color,border-color,filter] duration-[var(--dur-fast)] ease-out',
        mini ? MINI_GEOMETRY : PILL_GEOMETRY,
        VARIANT[variant],
        clickable && INTERACTIVE[variant],
        clickable && 'disabled:pointer-events-none disabled:opacity-40',
        onRemove && !mini && 'pr-1.5',
        className,
      )}
      {...rest}
    >
      <span className="truncate">{children}</span>
      {onRemove ? (
        <button
          type="button"
          aria-label={removeLabel}
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          className={cn(
            'ml-0.5 flex size-4 shrink-0 items-center justify-center rounded-pill opacity-60',
            'transition-opacity duration-[var(--dur-fast)] ease-out hover:opacity-100',
            'focus-visible:opacity-100',
          )}
        >
          <X {...iconProps(12)} aria-hidden />
        </button>
      ) : null}
    </Root>
  );
});
