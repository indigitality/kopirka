/**
 * Кнопка «Фильтр» верхней панели со счётчиком активных фильтров.
 * Собрана на общем `Button`, чтобы не разъезжаться со спекой §4.
 * `TopBar` принадлежит другому агенту — компонент отдаётся отдельно, для подстановки.
 */
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/cn';

export interface FilterButtonProps {
  /** Обычно `countActiveFilters(query)`. */
  count?: number;
  /** Панель открыта — кнопка подсвечена как нажатая. */
  open?: boolean;
  onClick: () => void;
  className?: string;
}

export function FilterButton({ count = 0, open, onClick, className }: FilterButtonProps) {
  const active = count > 0;

  return (
    <Tooltip content={active ? `Активных фильтров: ${count}` : 'Теги, тип файла, дата'} side="bottom">
      <Button
        variant="secondary"
        icon={<SlidersHorizontal className="size-3.5" strokeWidth={2} aria-hidden />}
        onClick={onClick}
        aria-expanded={open ?? false}
        aria-label={active ? `Фильтр, активных: ${count}` : 'Фильтр'}
        // Панель отличает клик по своему триггеру от клика мимо себя.
        data-filter-trigger=""
        className={cn(active && 'border-accent/40', open && 'bg-surface-active', className)}
      >
        <span className="flex items-center gap-1.5">
          Фильтр
          {active ? (
            <span className="rounded-pill bg-accent-soft px-1.5 font-mono text-2xs text-accent">{count}</span>
          ) : null}
        </span>
      </Button>
    </Tooltip>
  );
}
