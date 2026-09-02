import { SearchField, type BeamMode } from '@/components/ui/SearchField';
import { FilterButton } from '@/features/filters/FilterButton';
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
    /*
      `data-tauri-drag-region` — зона перетаскивания окна: полосы заголовка нет,
      и без разметки окно тянулось только за невидимые верхние 28 px (аудит логики §7).
      `deep` разрешает тянуть за фон панели; поле ввода и кнопки внутри
      перетаскивание блокируют сами. В браузере это обычный data-атрибут.
    */
    <header
      data-tauri-drag-region="deep"
      className="flex h-[var(--size-topbar)] shrink-0 items-center bg-surface px-[var(--grid-pad)]"
    >
      <SearchField value={query} onValueChange={viewActions.setQuery} beamMode={beamMode} />
      <div className="flex-1" />
      <FilterButton count={filterCount} open={filterOpen} onClick={() => onOpenFilter?.()} />
    </header>
  );
}
