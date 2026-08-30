import { useState, type ReactNode } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';

export type SelectValue = string | number | null;

export interface SelectOption<T extends SelectValue> {
  value: T;
  label: string;
  icon?: ReactNode;
  /** Отступ для вложенных папок. */
  depth?: number;
}

export interface SelectProps<T extends SelectValue> {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly SelectOption<T>[];
  placeholder?: string;
  /** Иконка слева в кнопке — например, папка. */
  icon?: ReactNode;
  disabled?: boolean;
  className?: string;
  contentClassName?: string;
}

/** Выпадающий список на Radix Popover — нужен для выбора папки. */
export function Select<T extends SelectValue>({
  value,
  onValueChange,
  options,
  placeholder = 'Не выбрано',
  icon,
  disabled,
  className,
  contentClassName,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className={cn(
          'flex h-[var(--size-row)] w-full items-center rounded-md bg-surface-raised px-2.5',
          'text-base text-ink transition-colors duration-[var(--dur-fast)] ease-out',
          'hover:bg-surface-hover disabled:pointer-events-none disabled:opacity-40',
          className,
        )}
      >
        {icon ? <span className="flex size-4 shrink-0 items-center justify-center text-ink-faint">{icon}</span> : null}
        <span className={cn('min-w-0 flex-1 truncate text-left', icon && 'ml-2', !selected && 'text-ink-faint')}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className="ml-2 size-3.5 shrink-0 text-ink-faint" strokeWidth={2} aria-hidden />
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className={cn('max-h-[280px] w-[var(--radix-popover-trigger-width)] overflow-y-auto', contentClassName)}
      >
        {options.map((option) => {
          const isSelected = option.value === value;
          return (
            <button
              key={String(option.value)}
              type="button"
              onClick={() => {
                onValueChange(option.value);
                setOpen(false);
              }}
              style={{ paddingLeft: 8 + (option.depth ?? 0) * 14 }}
              className={cn(
                'flex h-[var(--size-row)] w-full items-center rounded-sm pr-2 text-left text-base',
                'transition-colors duration-[var(--dur-fast)] ease-out hover:bg-surface-hover',
                isSelected ? 'text-ink' : 'text-ink-muted hover:text-ink',
              )}
            >
              {option.icon ? (
                <span className="flex size-4 shrink-0 items-center justify-center text-ink-faint">
                  {option.icon}
                </span>
              ) : null}
              <span className={cn('min-w-0 flex-1 truncate', option.icon && 'ml-2')}>{option.label}</span>
              <span className="flex size-4 shrink-0 items-center justify-center">
                {isSelected ? <Check className="size-3.5 text-accent" strokeWidth={2.5} aria-hidden /> : null}
              </span>
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
