/**
 * Квадратный чекбокс для списков панели фильтров.
 * Отдельный примитив: `components/ui/Checkbox` — круглый 20px поверх карточки,
 * в плотном списке он не к месту.
 */
import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface CheckRowProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: ReactNode;
  /** Правый слот: счётчик файлов у тега. */
  trailing?: ReactNode;
  className?: string;
}

export function CheckRow({ checked, onCheckedChange, children, trailing, className }: CheckRowProps) {
  return (
    <label
      className={cn(
        'flex h-7 cursor-pointer items-center gap-2.5 rounded-sm px-1.5',
        'transition-colors duration-[var(--dur-fast)] ease-out hover:bg-surface-hover',
        className,
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onCheckedChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded-xs border',
          'transition-colors duration-[var(--dur-fast)] ease-out',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-accent-ring peer-focus-visible:ring-offset-1',
          'peer-focus-visible:ring-offset-surface-overlay',
          checked
            ? 'border-accent bg-accent text-accent-ink'
            : 'border-line-strong bg-surface-raised text-transparent',
        )}
      >
        <Check className="size-3" strokeWidth={3} />
      </span>
      <span className={cn('min-w-0 flex-1 truncate text-base', checked ? 'text-ink' : 'text-ink-muted')}>
        {children}
      </span>
      {trailing ? <span className="shrink-0">{trailing}</span> : null}
    </label>
  );
}
