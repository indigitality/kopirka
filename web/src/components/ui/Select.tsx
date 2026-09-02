import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
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

/** Отступ от краёв окна при позиционировании: ближе список не подходит. */
const COLLISION_PADDING = 12;

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
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex === -1 ? undefined : options[selectedIndex];
  /* Клавиатурная навигация идёт по настоящему фокусу: пункт — обычная кнопка. */
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([]);

  /** Перевести фокус на пункт и подтянуть его в видимую часть списка. */
  const focusItem = (index: number) => {
    const item = itemsRef.current[index];
    if (!item) return;
    item.focus();
    // `nearest` — список не дёргается, когда пункт и так на виду.
    item.scrollIntoView({ block: 'nearest' });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = options.length - 1;
    if (last < 0) return;
    const current = itemsRef.current.findIndex((item) => item === document.activeElement);

    let next: number;
    if (event.key === 'ArrowDown') next = current < 0 ? 0 : Math.min(last, current + 1);
    else if (event.key === 'ArrowUp') next = current < 0 ? last : Math.max(0, current - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    else return;

    event.preventDefault();
    focusItem(next);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
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
        role="listbox"
        collisionPadding={COLLISION_PADDING}
        onKeyDown={handleKeyDown}
        /*
          Radix по умолчанию отдаёт фокус первому пункту — нам нужен выбранный,
          и его же надо подтянуть к видимой части: иначе в длинном дереве
          открытый список показывает начало, а отметка стоит где-то ниже.
        */
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          focusItem(selectedIndex === -1 ? 0 : selectedIndex);
        }}
        /*
          Высота списка: `50vh` — чтобы в низком окне он не занимал экран целиком,
          `--radix-popover-content-available-height` — сколько Radix намерил до края
          окна. Без потолка дерево из семи уровней уезжало за нижнюю границу
          (замечание Сергея 02.09.2026).
        */
        className={cn(
          'scrollbar-visible w-[var(--radix-popover-trigger-width)] overflow-y-auto',
          'max-h-[min(320px,50vh,var(--radix-popover-content-available-height,320px))]',
          contentClassName,
        )}
      >
        {options.map((option, index) => {
          const isSelected = option.value === value;
          return (
            <button
              key={String(option.value)}
              ref={(node) => {
                itemsRef.current[index] = node;
              }}
              type="button"
              role="option"
              aria-selected={isSelected}
              onClick={() => {
                onValueChange(option.value);
                setOpen(false);
              }}
              style={{ paddingLeft: 8 + (option.depth ?? 0) * 14 }}
              className={cn(
                'flex h-[var(--size-row)] w-full shrink-0 items-center rounded-sm pr-2 text-left text-base',
                'transition-colors duration-[var(--dur-fast)] ease-out hover:bg-surface-hover',
                'focus-visible:bg-surface-hover focus-visible:outline-none',
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
