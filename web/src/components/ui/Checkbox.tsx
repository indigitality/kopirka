/**
 * Чекбокс двух форм — они живут в разных местах и не заменяют друг друга.
 *
 * `shape="square"` — список тегов в панели фильтров (R05 · `Панель фильтров`):
 *   16×16, радиус `--radius-xs`; в покое только рамка `line-control`,
 *   выбран — сплошной лайм с тёмной галкой 12 px.
 *
 * `shape="round"` — выделение карточки сетки (R13 · «Карточка и чипы»):
 *   20×20, круг; в покое лежит на превью — тёмная вуаль и белая обводка 1,5 px,
 *   выбран — лайм с той же галкой.
 */
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { iconProps } from '@/lib/icons';

export type CheckboxShape = 'square' | 'round';

export interface CheckboxProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label?: string;
  /** `round` — поверх карточки, `square` — в списке фильтров. */
  shape?: CheckboxShape;
}

const SHAPE: Record<CheckboxShape, string> = {
  square: 'size-[var(--size-check)] rounded-xs',
  round: 'size-[var(--size-check-round)] rounded-pill',
};

/** Невыбранное состояние: квадрат стоит на панели, круг — прямо на картинке. */
const IDLE: Record<CheckboxShape, string> = {
  square: 'border border-line-control text-transparent hover:border-ink-muted',
  round:
    'border-[1.5px] border-chip-light bg-check-veil text-transparent backdrop-blur-[var(--blur-chip)] hover:border-ink',
};

export const Checkbox = forwardRef<HTMLButtonElement, CheckboxProps>(function Checkbox(
  { checked, onCheckedChange, label = 'Выделить', shape = 'round', className, onClick, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
        onCheckedChange?.(!checked);
      }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center',
        'transition-[color,background-color,border-color] duration-[var(--dur-fast)] ease-out',
        SHAPE[shape],
        checked ? 'border-transparent bg-brand text-brand-ink' : IDLE[shape],
        className,
      )}
      {...rest}
    >
      {/* Галка 12 px: `absoluteStrokeWidth` пересчитает толщину в 3 — как в макете. */}
      <Check {...iconProps(12)} aria-hidden />
    </button>
  );
});
