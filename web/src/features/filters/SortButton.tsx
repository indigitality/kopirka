/**
 * LIB-04 — порядок сортировки. С 02.09.2026 (решение D6) живёт в верхней панели,
 * а не внутри «Фильтра»: спрятанный порядок нигде не был виден, а фильтром он
 * не считается (дизайн-аудит §3.1, §3.3).
 *
 * Призрачная кнопка `--size-row` с текущим значением и шевроном 12 px → поповер
 * с четырьмя пунктами и отметкой у текущего.
 */
import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { SortKey } from '@shared/api';
import { Button } from '@/components/ui/Button';
import { Popover, PopoverContent, PopoverItem, PopoverTrigger } from '@/components/ui/Popover';
import { cn } from '@/lib/cn';
import { DEFAULT_SORT, SORT_OPTIONS } from './query';

export interface SortButtonProps {
  value: SortKey;
  onValueChange: (value: SortKey) => void;
  className?: string;
}

export function SortButton({ value, onValueChange, className }: SortButtonProps) {
  const [open, setOpen] = useState(false);
  const current = SORT_OPTIONS.find((option) => option.value === value) ?? SORT_OPTIONS[0];
  const label = current?.label ?? DEFAULT_SORT;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          aria-label={`Сортировка: ${label}`}
          aria-expanded={open}
          className={cn('gap-1.5', open && 'bg-surface-hover text-ink', className)}
        >
          <span className="flex items-center gap-1.5">
            {label}
            <ChevronDown className="size-3 shrink-0 text-ink-faint" strokeWidth={2} aria-hidden />
          </span>
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="min-w-[190px]">
        {SORT_OPTIONS.map((option) => {
          const selected = option.value === value;
          return (
            <PopoverItem
              key={option.value}
              role="menuitemradio"
              aria-checked={selected}
              onClick={() => {
                onValueChange(option.value);
                setOpen(false);
              }}
              className={selected ? 'text-ink' : undefined}
            >
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              <span className="flex size-4 shrink-0 items-center justify-center">
                {selected ? <Check className="size-3.5 text-accent" strokeWidth={2.5} aria-hidden /> : null}
              </span>
            </PopoverItem>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
