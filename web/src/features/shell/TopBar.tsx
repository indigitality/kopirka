/**
 * Верхняя панель — узел «Верхняя панель» R01 и полка R13.
 *
 * Своего фона у панели нет: она лежит на вуали колонки контента (см. `AppShell`).
 * Слева поле поиска 280 × 32, справа пульт «на одной подложке» — сортировка,
 * размер, фильтр: у каждого своя заливка `control`, тон один, зазор 8.
 */
import { Grid2x2, Grid3x3, Square } from 'lucide-react';
import { Icon } from '@/lib/icons';
import { SearchField, type BeamMode } from '@/components/ui/SearchField';
import { SegmentedControl, type SegmentedOption } from '@/components/ui/SegmentedControl';
import { FilterButton } from '@/features/filters/FilterButton';
import { SortButton } from '@/features/filters/SortButton';
import { useViewSelector, viewActions, type GridSize } from '@/store/view';

/**
 * Размер карточек — решение D5 от 02.09.2026. Иконки идут по возрастанию плотности:
 * одна крупная ячейка → четыре → девять. Лучшего ряда в lucide нет: решётки 4×4
 * в наборе не существует. В редизайне они 16 px (узел «размер карточек» R13).
 */
const GRID_SIZE_OPTIONS: readonly SegmentedOption<GridSize>[] = [
  { value: 'l', label: 'Большие', hotkey: '⌘1', icon: <Icon icon={Square} aria-hidden /> },
  { value: 'm', label: 'Средние', hotkey: '⌘2', icon: <Icon icon={Grid2x2} aria-hidden /> },
  { value: 's', label: 'Маленькие', hotkey: '⌘3', icon: <Icon icon={Grid3x3} aria-hidden /> },
];

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

export function TopBar({
  beamMode = 'hover',
  onOpenFilter,
  filterCount = 0,
  filterOpen = false,
}: TopBarProps) {
  const query = useViewSelector((s) => s.query);
  const sort = useViewSelector((s) => s.sort);
  const gridSize = useViewSelector((s) => s.gridSize);

  return (
    /*
      `data-tauri-drag-region` — зона перетаскивания окна: полосы заголовка нет,
      и без разметки окно тянулось только за невидимые верхние 28 px (аудит логики §7).
      `deep` разрешает тянуть за фон панели; поле ввода и кнопки внутри
      перетаскивание блокируют сами. В браузере это обычный data-атрибут.

      Высота — `--shell-topbar`, а не `--size-topbar`: десктопная обёртка
      прибавляет ко второму инсет светофора (28 px), а в редизайне светофор
      лежит над сайдбаром, и опускать панель контента незачем — инсет
      отрабатывает сайдбар. `desktop/` при этом не трогаем.
    */
    <header
      data-tauri-drag-region="deep"
      className="flex h-[var(--shell-topbar)] shrink-0 items-center gap-[var(--panel-pad)] px-[var(--panel-pad)]"
    >
      <SearchField value={query} onValueChange={viewActions.setQuery} beamMode={beamMode} />

      <div className="flex-1" />

      {/* Пульт: порядок ряда — сортировка · размер · фильтр, зазор 8 (узел «Пульт» R01). */}
      <div className="flex shrink-0 items-center gap-2">
        <SortButton value={sort} onValueChange={viewActions.setSort} />
        <SegmentedControl
          label="Размер карточек"
          value={gridSize}
          onValueChange={viewActions.setGridSize}
          options={GRID_SIZE_OPTIONS}
          segmentWidth={32}
        />
        <FilterButton count={filterCount} open={filterOpen} onClick={() => onOpenFilter?.()} />
      </div>
    </header>
  );
}
