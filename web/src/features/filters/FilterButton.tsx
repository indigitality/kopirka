/**
 * Кнопка «Фильтр» верхней панели со счётчиком активных фильтров.
 * Собрана на общем `Button`, чтобы не разъезжаться со спекой §4.
 * `TopBar` принадлежит другому агенту — компонент отдаётся отдельно, для подстановки.
 *
 * Два состояния сняты с узлов редизайна: покой — «фильтр · покой» на полке R13,
 * активная — узел «Кнопка · Фильтр» верхней панели R05. Разница в цвете подложки
 * (`control` → `brand-tint`) и в том, что весь набор — иконка, слово, счётчик —
 * переходит в лайм. Плашки под счётчиком нет, это просто цифра 10 px.
 */
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/cn';
import { Icon } from '@/lib/icons';

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
        icon={<Icon icon={SlidersHorizontal} size={16} aria-hidden />}
        onClick={onClick}
        aria-expanded={open ?? false}
        aria-label={active ? `Фильтр, активных: ${count}` : 'Фильтр'}
        // Панель отличает клик по своему триггеру от клика мимо себя.
        data-filter-trigger=""
        className={cn(
          'border-0 text-md font-medium',
          active
            ? 'bg-brand-tint text-brand hover:bg-brand-tint hover:brightness-125'
            : 'bg-control text-ink-muted hover:bg-control-hover hover:text-ink',
          // Панель открыта, но фильтров нет: подсветка «нажато» без ухода в лайм.
          open && !active && 'bg-control-active text-ink',
          className,
        )}
      >
        <span className="flex items-center gap-2">
          Фильтр
          {active ? <span className="text-2xs tabular-nums">{count}</span> : null}
        </span>
      </Button>
    </Tooltip>
  );
}
