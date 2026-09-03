/**
 * LIB-04 — порядок сортировки. С 02.09.2026 (решение D6) живёт в верхней панели,
 * а не внутри «Фильтра»: спрятанный порядок нигде не был виден, а фильтром он
 * не считается (дизайн-аудит §3.1, §3.3).
 *
 * Кнопка 32 px с текущим значением и шевроном 14 px → поповер с четырьмя
 * пунктами и отметкой у текущего.
 *
 * Редизайн: узел «сортировка · покой» на полке R13 — подложка контрола, имя
 * значения `ink-muted` 14/18 Medium, шеврон `ink-faint`; поля 12 слева и 10
 * справа (шеврон стоит ближе к краю, чем слово). Поповер — узел «Поповер ·
 * Сортировка» R06: стекло 200 px, строки полупрозрачные, галка лаймом.
 */
import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { SortKey } from '@shared/api';
import { Button } from '@/components/ui/Button';
import { GLASS_ROW, Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import { cn } from '@/lib/cn';
import { Icon } from '@/lib/icons';
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
          variant="secondary"
          aria-label={`Сортировка: ${label}`}
          aria-expanded={open}
          /* Поле справа 10, а не 12: шеврон в макете стоит ближе к краю, чем слово. */
          className={cn('gap-1.5 pr-2.5 text-ink-muted hover:text-ink', open && 'text-ink', className)}
        >
          <span className="flex items-center gap-1.5">
            {label}
            <Icon icon={ChevronDown} size={14} className="shrink-0 text-ink-faint" aria-hidden />
          </span>
        </Button>
      </PopoverTrigger>

      {/* Стекло, радиус, тень и поле 6 приходят из `PopoverContent`; здесь — ширина 200 и зазор 2. */}
      <PopoverContent
        align="end"
        className="flex w-[var(--size-sort-popover)] min-w-0 flex-col gap-0.5"
      >
        {SORT_OPTIONS.map((option) => {
          const selected = option.value === value;
          return (
            /*
              Не `PopoverItem`: у него нет слота под галку, а она здесь несёт
              состояние. Стиль строки — общий `GLASS_ROW`, чтобы меню редизайна
              не разъезжались; отличие узла — приглушённый текст у невыбранных.
            */
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={selected}
              onClick={() => {
                onValueChange(option.value);
                setOpen(false);
              }}
              className={cn(
                GLASS_ROW,
                'hover:bg-control hover:text-ink focus-visible:bg-control focus-visible:outline-none',
                selected ? 'bg-control-hover text-ink' : 'text-ink-muted',
              )}
            >
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {/* Слот галки держится всегда — иначе имена в списке разъезжаются. */}
              <span className="flex size-3.5 shrink-0 items-center justify-center">
                {selected ? <Icon icon={Check} size={14} className="text-brand" aria-hidden /> : null}
              </span>
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
