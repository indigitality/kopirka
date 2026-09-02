import { AnimatePresence, motion } from 'motion/react';
import { Grid2x2, Grid3x3, PanelLeftOpen, Square } from 'lucide-react';
import { IconButton } from '@/components/ui/IconButton';
import { DUR_BASE, EASE_OUT } from '@/lib/motion';
import { SearchField, type BeamMode } from '@/components/ui/SearchField';
import { SegmentedControl, type SegmentedOption } from '@/components/ui/SegmentedControl';
import { Tooltip } from '@/components/ui/Tooltip';
import { FilterButton } from '@/features/filters/FilterButton';
import { SortButton } from '@/features/filters/SortButton';
import { useViewSelector, viewActions, type GridSize } from '@/store/view';

/**
 * Размер карточек — решение D5 от 02.09.2026. Иконки идут по возрастанию плотности:
 * одна крупная ячейка → четыре → девять. Лучшего ряда в lucide нет: решётки 4×4
 * в наборе не существует, а `LayoutGrid` и `Grid2x2` в 14 px неразличимы.
 */
const GRID_SIZE_OPTIONS: readonly SegmentedOption<GridSize>[] = [
  {
    value: 'l',
    label: 'Большие',
    hotkey: '⌘1',
    icon: <Square className="size-3.5" strokeWidth={2} aria-hidden />,
  },
  {
    value: 'm',
    label: 'Средние',
    hotkey: '⌘2',
    icon: <Grid2x2 className="size-3.5" strokeWidth={2} aria-hidden />,
  },
  {
    value: 's',
    label: 'Маленькие',
    hotkey: '⌘3',
    icon: <Grid3x3 className="size-3.5" strokeWidth={2} aria-hidden />,
  },
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

export function TopBar({ beamMode = 'hover', onOpenFilter, filterCount = 0, filterOpen = false }: TopBarProps) {
  const query = useViewSelector((s) => s.query);
  const sort = useViewSelector((s) => s.sort);
  const gridSize = useViewSelector((s) => s.gridSize);
  const sidebarCollapsed = useViewSelector((s) => s.sidebarCollapsed);

  return (
    /*
      `data-tauri-drag-region` — зона перетаскивания окна: полосы заголовка нет,
      и без разметки окно тянулось только за невидимые верхние 28 px (аудит логики §7).
      `deep` разрешает тянуть за фон панели; поле ввода и кнопки внутри
      перетаскивание блокируют сами. В браузере это обычный data-атрибут.
    */
    <header
      data-tauri-drag-region="deep"
      className="flex h-[var(--size-topbar)] shrink-0 items-center gap-2 bg-surface px-[var(--grid-pad)]"
    >
      {/*
        Развернуть сайдбар. Кнопка живёт в сайдбаре, у логотипа, — но у свёрнутого
        сайдбара ширина 0, и вернуть его было бы нечем, кроме ⌘\ (дизайн-аудит 4.2).
        Поэтому только в свёрнутом состоянии она выезжает в левый угол панели, теми
        же длительностью и кривой, что и сам сайдбар. По вертикали кнопка стоит по
        центру панели: в окне приложения `--size-topbar` уже включает инсет 28px,
        и светофор macOS остаётся выше неё.
      */}
      <AnimatePresence initial={false}>
        {sidebarCollapsed ? (
          <motion.div
            key="expand-sidebar"
            /* `marginRight` гасит зазор ряда: он появляется сразу, а ширина растёт 200 мс. */
            initial={{ width: 0, marginRight: -8, opacity: 0 }}
            animate={{ width: 28, marginRight: 0, opacity: 1 }}
            exit={{ width: 0, marginRight: -8, opacity: 0 }}
            transition={{ duration: DUR_BASE, ease: EASE_OUT }}
            className="shrink-0 overflow-hidden"
          >
            <Tooltip content="Показать сайдбар" hotkey="⌘\" side="bottom">
              <IconButton
                size="sm"
                label="Показать сайдбар"
                aria-pressed={false}
                onClick={() => viewActions.toggleSidebar()}
              >
                <PanelLeftOpen className="size-4" strokeWidth={2} aria-hidden />
              </IconButton>
            </Tooltip>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <SearchField value={query} onValueChange={viewActions.setQuery} beamMode={beamMode} />

      <div className="flex-1" />

      {/* Порядок ряда — дизайн-аудит §3.3: сортировка · размер · фильтр. */}
      <SortButton value={sort} onValueChange={viewActions.setSort} />
      <SegmentedControl
        label="Размер карточек"
        value={gridSize}
        onValueChange={viewActions.setGridSize}
        options={GRID_SIZE_OPTIONS}
        segmentWidth={32}
      />
      <FilterButton count={filterCount} open={filterOpen} onClick={() => onOpenFilter?.()} />
    </header>
  );
}
