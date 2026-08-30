import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface CheckboxProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label?: string;
}

/** Круглый чекбокс 20px для выделения карточки — раздел 2 спеки. */
export const Checkbox = forwardRef<HTMLButtonElement, CheckboxProps>(function Checkbox(
  { checked, onCheckedChange, label = 'Выделить', className, onClick, ...rest },
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
        'inline-flex size-5 shrink-0 items-center justify-center rounded-pill',
        'transition-colors duration-[var(--dur-fast)] ease-out',
        checked
          ? 'bg-accent text-accent-ink'
          : 'bg-scrim-badge text-transparent ring-1 ring-ink-muted/70 backdrop-blur-[6px] hover:ring-ink',
        className,
      )}
      {...rest}
    >
      <Check className="size-3" strokeWidth={3} aria-hidden />
    </button>
  );
});
