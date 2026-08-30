import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SearchField, type BeamMode } from '@/components/ui/SearchField';
import { useViewSelector, viewActions } from '@/store/view';

export interface TopBarProps {
  /** Режим бима поля поиска. */
  beamMode?: BeamMode;
  /** Открытие панели фильтров — SEARCH-01/03/04. */
  onOpenFilter?: () => void;
  /** Сколько фильтров активно; 0 — бейдж не показываем. */
  filterCount?: number;
  /** Панель открыта — кнопка держит активное состояние. */
  filterOpen?: boolean;
}

export function TopBar({ beamMode = 'hover', onOpenFilter, filterCount = 0, filterOpen = false }: TopBarProps) {
  const query = useViewSelector((s) => s.query);

  return (
    <header className="flex h-[var(--size-topbar)] shrink-0 items-center bg-surface px-[var(--grid-pad)]">
      <SearchField value={query} onValueChange={viewActions.setQuery} beamMode={beamMode} />
      <div className="flex-1" />
      <Button
        variant="secondary"
        icon={<SlidersHorizontal className="size-3.5" strokeWidth={2} />}
        onClick={onOpenFilter}
        aria-expanded={filterOpen}
        className={filterOpen ? 'border-accent-ring text-ink' : undefined}
      >
        Фильтр
        {filterCount > 0 ? (
          <span className="ml-1.5 rounded-pill bg-accent-soft px-1.5 font-mono text-2xs text-accent">
            {filterCount}
          </span>
        ) : null}
      </Button>
    </header>
  );
}
