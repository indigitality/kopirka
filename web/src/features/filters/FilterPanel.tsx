/**
 * Панель фильтров — SEARCH-01, SEARCH-03, SEARCH-04, LIB-04.
 *
 * По документу 06 это не отдельный экран, а состояние сетки: панель накладывается
 * поверх карточек и не заменяет навигацию. Поэтому — абсолютное позиционирование
 * внутри области контента, без скрима и без блокировки сайдбара.
 *
 * Состоянием не владеет: снаружи приходит `value`, наружу уходит `onChange`.
 * Изменения применяются сразу, кнопки «Применить» нет.
 *
 * Внешний вид — редизайн, артборд R05 «Поиск и фильтры», узел «Панель фильтров»:
 * стекло 340 px под кнопкой «Фильтр», секции без разделителей, чипы-пилюли,
 * подвал с линией от края до края.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Search, X } from 'lucide-react';
import type { FileExt, FileListQuery, TagRecord } from '@shared/api';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/cn';
import { Icon } from '@/lib/icons';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { glassLayerMotion } from '@/components/ui/motion-presets';
import { CheckRow } from './CheckRow';
import {
  DATE_PRESETS,
  FILTER_EXTS,
  clearFilters,
  countActiveFilters,
  matchPreset,
  presetRange,
  type DatePreset,
} from './query';

export interface FilterPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Текущий запрос сетки. */
  value: FileListQuery;
  onChange: (next: FileListQuery) => void;
  /** SEARCH-01 — существующие теги со счётчиками, GET /api/tags. */
  tags: readonly TagRecord[];
  tagsLoading?: boolean;
  /** Переопределение позиции: по умолчанию — правый верх области контента. */
  className?: string;
}

// ── Мелкие части ─────────────────────────────────────────────────────────────

/**
 * Секция панели. Разделителей между секциями в редизайне нет — их роль играет
 * зазор 18 в теле панели (узел «Панель фильтров», R05).
 */
function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-baseline gap-2">
        <span className="label-section">{title}</span>
        {hint ? <span className="min-w-0 flex-1 truncate text-xs text-ink-faint">{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * Чип-переключатель: типы файлов и пресеты дат. Геометрию и цвета даёт общий
 * `Chip` (варианты `brand` / `control`); здесь только два отличия узла R05 от
 * общей пилюли: невыбранный чип фильтра приглушён (`ink-muted`, а не `ink`),
 * а расширение файла набрано 11 px обычным весом, не 12 px Medium.
 */
function FilterChip({
  active,
  onClick,
  technical,
  children,
}: {
  active: boolean;
  onClick: () => void;
  technical?: boolean;
  children: ReactNode;
}) {
  return (
    <Chip
      as="button"
      variant={active ? 'brand' : 'control'}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        technical && 'text-xs leading-[14px] font-normal',
        !active && 'text-ink-muted hover:text-ink',
      )}
    >
      {children}
    </Chip>
  );
}

// ── Панель ───────────────────────────────────────────────────────────────────

export function FilterPanel({
  open,
  onOpenChange,
  value,
  onChange,
  tags,
  tagsLoading,
  className,
}: FilterPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [tagQuery, setTagQuery] = useState('');
  const reduced = useReducedMotion();

  const selectedTags = useMemo(() => value.tags ?? [], [value.tags]);
  const selectedExts = useMemo(() => value.exts ?? [], [value.exts]);
  const activeCount = countActiveFilters(value);
  const activePreset = matchPreset(value);

  /*
    Нативные поля дат — чужая типографика и чужой календарь (дизайн-аудит §3.1),
    а нужны они в единицах процентов случаев. Показываем их только по «Свой период…»
    либо когда в запросе уже лежит диапазон, не совпавший ни с одним чипом.
  */
  const hasCustomRange = activePreset === null && (Boolean(value.dateFrom) || Boolean(value.dateTo));
  const [customOpen, setCustomOpen] = useState(hasCustomRange);
  const showCustomRange = customOpen || hasCustomRange;

  // Закрытие по Esc и по клику мимо. Клики внутри поповера сортировки
  // (Radix рендерит его в портал) и по кнопке-триггеру панель не закрывают.
  useEffect(() => {
    if (!open) return;

    const isOutside = (target: EventTarget | null): boolean => {
      if (!(target instanceof Node)) return true;
      if (panelRef.current?.contains(target)) return false;
      const element = target instanceof Element ? target : target.parentElement;
      return !element?.closest('[data-radix-popper-content-wrapper],[data-filter-trigger]');
    };

    const onPointerDown = (event: PointerEvent) => {
      if (isOutside(event.target)) onOpenChange(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      // Открыт вложенный поповер — Esc должен закрыть сначала его.
      if (event.key !== 'Escape') return;
      if (document.querySelector('[data-radix-popper-content-wrapper]')) return;
      onOpenChange(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onOpenChange]);

  // Сброс любого фильтра начинает выдачу заново — курсор постраничности недействителен.
  const patch = (next: Partial<FileListQuery>) => onChange({ ...value, ...next, cursor: null });

  const toggleTag = (name: string, checked: boolean) => {
    const next = checked ? [...selectedTags, name] : selectedTags.filter((tag) => tag !== name);
    patch({ tags: next.length ? next : undefined });
  };

  const toggleExt = (ext: FileExt) => {
    const next = selectedExts.includes(ext)
      ? selectedExts.filter((item) => item !== ext)
      : [...selectedExts, ext];
    patch({ exts: next.length ? next : undefined });
  };

  const applyPreset = (preset: DatePreset) => {
    setCustomOpen(false);
    if (activePreset === preset) {
      patch({ dateFrom: undefined, dateTo: undefined });
      return;
    }
    patch(presetRange(preset));
  };

  // Выбранные теги — наверх, дальше по частоте: искать в длинном списке иначе тяжело.
  const visibleTags = useMemo(() => {
    const needle = tagQuery.trim().toLowerCase();
    return tags
      .filter((tag) => (needle ? tag.name.includes(needle) : true))
      .slice()
      .sort((a, b) => {
        const selected = Number(selectedTags.includes(b.name)) - Number(selectedTags.includes(a.name));
        if (selected !== 0) return selected;
        if (b.fileCount !== a.fileCount) return b.fileCount - a.fileCount;
        return a.name.localeCompare(b.name, 'ru');
      });
  }, [tags, tagQuery, selectedTags]);

  return (
    <AnimatePresence>
      {open ? (
        /*
          Панель — стекло: `--color-raised-glass` + размытие 20 + край `line-strong`,
          радиус 12, тень поповера (узел «Панель фильтров», R05). Paper не рисует
          `backdrop-filter`, поэтому размытие здесь обязательно — иначе сквозь 85 %
          подложки читаются карточки.

          Появление — пружинное семейство редизайна: blur 8 → 0, сдвиг 8 px сверху
          вниз (панель висит под кнопкой «Фильтр», значит `from="top"`).
        */
        <motion.div
          ref={panelRef}
          role="dialog"
          aria-label="Фильтры"
          {...glassLayerMotion({ from: 'top', reduced })}
          className={cn(
            /*
              Ширина 340, правый край вровень с кнопкой «Фильтр». По вертикали
              панель висит в 8 px под кнопкой, а не под верхней панелью, и потому
              заходит на неё снизу (в макете верх панели 66 при нижнем крае
              кнопки 58). Слой рисуется в области контента, отсчёт идёт от её
              верха: (высота кнопки − высота верхней панели) / 2 + 8.
            */
            'glass absolute right-[var(--panel-pad)] z-30 origin-top-right',
            'top-[calc((var(--size-row)-var(--size-topbar))/2+8px)]',
            'w-[var(--size-filter-panel)] max-w-[calc(100%-2*var(--panel-pad))]',
            'flex max-h-[calc(100%-16px)] flex-col overflow-hidden rounded-card',
            'text-ink shadow-popover outline-none',
            className,
          )}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-4.5 overflow-y-auto p-4">
            <header className="flex shrink-0 items-center gap-2">
              <h2 className="text-md font-medium text-ink">Фильтры</h2>
              {/* Счётчик — просто лаймовая цифра, плашки под ним в редизайне нет. */}
              {activeCount > 0 ? <span className="text-2xs text-brand tabular-nums">{activeCount}</span> : null}
              <div className="flex-1" />
              <IconButton
                size="sm"
                label="Закрыть фильтры"
                onClick={() => onOpenChange(false)}
                className="-mr-1.5"
              >
                <Icon icon={X} size={16} aria-hidden />
              </IconButton>
            </header>

            {/* SEARCH-01 — И-логика: файл должен иметь все выбранные теги. */}
            <Section title="Теги" hint={selectedTags.length > 1 ? 'нужны все выбранные' : undefined}>
              {/* Поиска по тегам в макете нет: он появляется только там, где список длиннее образца. */}
              {tags.length > 6 ? (
                <div className="relative">
                  <Icon
                    icon={Search}
                    size={16}
                    className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-faint"
                    aria-hidden
                  />
                  <Input
                    value={tagQuery}
                    placeholder="Найти тег"
                    aria-label="Найти тег"
                    onChange={(event) => setTagQuery(event.target.value)}
                    className="pl-9"
                  />
                </div>
              ) : null}

              {tagsLoading ? (
                <p className="py-1 text-sm text-ink-faint">Загружаем теги…</p>
              ) : tags.length === 0 ? (
                <p className="py-1 text-sm text-ink-faint">Тегов пока нет</p>
              ) : visibleTags.length === 0 ? (
                <p className="py-1 text-sm text-ink-faint">Ничего не найдено</p>
              ) : (
                /* 182px — 6,5 строки: срез посередине строки виден как «список длиннее». */
                <div className="flex max-h-[182px] flex-col overflow-y-auto">
                  {visibleTags.map((tag) => (
                    <CheckRow
                      key={tag.id}
                      checked={selectedTags.includes(tag.name)}
                      onCheckedChange={(checked) => toggleTag(tag.name, checked)}
                      trailing={tag.fileCount}
                    >
                      {tag.name}
                    </CheckRow>
                  ))}
                </div>
              )}
            </Section>

            {/* SEARCH-04 */}
            <Section title="Тип файла">
              <div className="flex flex-wrap gap-1.5">
                {FILTER_EXTS.map((ext) => (
                  <FilterChip key={ext} technical active={selectedExts.includes(ext)} onClick={() => toggleExt(ext)}>
                    {ext}
                  </FilterChip>
                ))}
              </div>
            </Section>

            {/* SEARCH-03 */}
            <Section title="Добавлено">
              <div className="flex flex-col gap-2.5">
                <div className="flex flex-wrap gap-1.5">
                  {DATE_PRESETS.map((preset) => (
                    <FilterChip
                      key={preset.value}
                      active={activePreset === preset.value}
                      onClick={() => applyPreset(preset.value)}
                    >
                      {preset.label}
                    </FilterChip>
                  ))}
                  <FilterChip
                    active={showCustomRange}
                    onClick={() => {
                      if (showCustomRange) patch({ dateFrom: undefined, dateTo: undefined });
                      setCustomOpen(!showCustomRange);
                    }}
                  >
                    Свой период…
                  </FilterChip>
                </div>

                {showCustomRange ? (
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { key: 'dateFrom', label: 'от' },
                        { key: 'dateTo', label: 'до' },
                      ] as const
                    ).map(({ key, label }) => (
                      <div key={key}>
                        <label htmlFor={`filter-${key}`} className="mb-1 block text-2xs text-ink-faint">
                          {label}
                        </label>
                        <Input
                          id={`filter-${key}`}
                          type="date"
                          value={value[key] ?? ''}
                          max={key === 'dateFrom' ? value.dateTo : undefined}
                          min={key === 'dateTo' ? value.dateFrom : undefined}
                          onChange={(event) => patch({ [key]: event.target.value || undefined })}
                          className={cn(
                            'text-xs tabular-nums',
                            '[&::-webkit-calendar-picker-indicator]:cursor-pointer',
                            '[&::-webkit-calendar-picker-indicator]:opacity-40',
                            'hover:[&::-webkit-calendar-picker-indicator]:opacity-80',
                          )}
                        />
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </Section>
          </div>

          {/*
            Разделитель подвала — от края до края панели цветом её обводки
            (правка Сергея 02.09.2026): поля 16, сверху 14, снизу 16.
          */}
          <footer className="flex shrink-0 items-center gap-2 border-t border-line-strong px-4 pt-3.5 pb-4">
            <span className="min-w-0 flex-1 truncate text-sm text-ink-faint">
              {activeCount > 0 ? `Активных фильтров: ${activeCount}` : 'Фильтры не заданы'}
            </span>
            {/* Выключенная кнопка давала ~2.3:1 и читалась как артефакт (аудит §3.1). */}
            {activeCount > 0 ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setTagQuery('');
                  setCustomOpen(false);
                  onChange(clearFilters(value));
                }}
              >
                Сбросить
              </Button>
            ) : null}
          </footer>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
