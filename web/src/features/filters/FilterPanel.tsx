/**
 * Панель фильтров — SEARCH-01, SEARCH-03, SEARCH-04, LIB-04.
 *
 * По документу 06 это не отдельный экран, а состояние сетки: панель накладывается
 * поверх карточек и не заменяет навигацию. Поэтому — абсолютное позиционирование
 * внутри области контента, без скрима и без блокировки сайдбара.
 *
 * Состоянием не владеет: снаружи приходит `value`, наружу уходит `onChange`.
 * Изменения применяются сразу, кнопки «Применить» нет.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Search, X } from 'lucide-react';
import type { FileExt, FileListQuery, SortKey, TagRecord } from '@shared/api';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { cn } from '@/lib/cn';
import { DUR_FAST, EASE_OUT } from '@/lib/motion';
import { DUR_EXIT_FAST, EASE_IN } from '@/components/ui/motion-presets';
import { CheckRow } from './CheckRow';
import {
  DATE_PRESETS,
  DEFAULT_SORT,
  FILTER_EXTS,
  SORT_OPTIONS,
  clearFilters,
  countActiveFilters,
  isDirty,
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

function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-line px-4 py-3.5 first:border-t-0">
      <div className="flex items-baseline gap-2">
        <span className="label-section">{title}</span>
        {/* 10 px не моно — прямое нарушение спеки §6, поэтому 12 (аудит 3.1). */}
        {hint ? <span className="min-w-0 flex-1 truncate text-sm text-ink-faint">{hint}</span> : null}
      </div>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

/** Чип-переключатель: типы файлов и пресеты дат. */
function Chip({
  active,
  onClick,
  mono,
  children,
}: {
  active: boolean;
  onClick: () => void;
  mono?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'h-7 rounded-md border px-2.5 whitespace-nowrap',
        'transition-colors duration-[var(--dur-fast)] ease-out',
        mono ? 'font-mono text-xs' : 'text-sm',
        active
          ? 'border-accent/50 bg-accent-soft text-accent'
          : 'border-line-strong bg-surface-raised text-ink-muted hover:text-ink',
      )}
    >
      {children}
    </button>
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

  const selectedTags = useMemo(() => value.tags ?? [], [value.tags]);
  const selectedExts = useMemo(() => value.exts ?? [], [value.exts]);
  const activeCount = countActiveFilters(value);
  const dirty = isDirty(value);
  const activePreset = matchPreset(value);

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
          Вход короткий: 200 мс сквозь полупрозрачную панель читаются карточки,
          и это выглядит как глюк отрисовки (аудит 3.1). Уход — ещё короче и по
          кривой входа в экран.
        */
        <motion.div
          ref={panelRef}
          role="dialog"
          aria-label="Фильтры"
          initial={{ opacity: 0, scale: 0.98, y: -6 }}
          animate={{ opacity: 1, scale: 1, y: 0, transition: { duration: DUR_FAST, ease: EASE_OUT } }}
          exit={{ opacity: 0, scale: 0.98, y: -6, transition: { duration: DUR_EXIT_FAST, ease: EASE_IN } }}
          className={cn(
            'absolute top-2 right-[var(--grid-pad)] z-30 w-[340px] origin-top-right',
            'flex max-h-[calc(100%-16px)] flex-col overflow-hidden rounded-xl',
            'bg-surface-overlay text-ink shadow-float outline-none',
            className,
          )}
        >
          <header className="flex h-11 shrink-0 items-center gap-2 px-4">
            <h2 className="text-md font-medium text-ink">Фильтры</h2>
            {activeCount > 0 ? (
              <span className="rounded-pill bg-accent-soft px-1.5 py-0.5 font-mono text-2xs text-accent">
                {activeCount}
              </span>
            ) : null}
            <div className="flex-1" />
            <IconButton size="sm" label="Закрыть фильтры" onClick={() => onOpenChange(false)} className="-mr-1.5">
              <X className="size-3.5" strokeWidth={2} aria-hidden />
            </IconButton>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* SEARCH-01 — И-логика: файл должен иметь все выбранные теги. */}
            <Section title="Теги" hint={selectedTags.length > 1 ? 'нужны все выбранные' : undefined}>
              {tags.length > 6 ? (
                <div className="relative mb-2">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-faint"
                    strokeWidth={2}
                    aria-hidden
                  />
                  <Input
                    value={tagQuery}
                    placeholder="Найти тег"
                    aria-label="Найти тег"
                    onChange={(event) => setTagQuery(event.target.value)}
                    className="h-7 pl-8 text-sm"
                  />
                </div>
              ) : null}

              {tagsLoading ? (
                <p className="px-1.5 py-1 text-sm text-ink-faint">Загружаем теги…</p>
              ) : tags.length === 0 ? (
                <p className="px-1.5 py-1 text-sm text-ink-faint">Тегов пока нет</p>
              ) : visibleTags.length === 0 ? (
                <p className="px-1.5 py-1 text-sm text-ink-faint">Ничего не найдено</p>
              ) : (
                <div className="-mx-1.5 max-h-[182px] overflow-y-auto px-1.5">
                  {/* 182px — 6,5 строки: срез посередине строки виден как «список длиннее». */}
                  {visibleTags.map((tag) => (
                    <CheckRow
                      key={tag.id}
                      checked={selectedTags.includes(tag.name)}
                      onCheckedChange={(checked) => toggleTag(tag.name, checked)}
                      trailing={<span className="font-mono text-2xs text-ink-faint">{tag.fileCount}</span>}
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
                  <Chip key={ext} mono active={selectedExts.includes(ext)} onClick={() => toggleExt(ext)}>
                    {ext}
                  </Chip>
                ))}
              </div>
            </Section>

            {/* SEARCH-03 */}
            <Section title="Добавлено">
              <div className="flex flex-wrap gap-1.5">
                {DATE_PRESETS.map((preset) => (
                  <Chip
                    key={preset.value}
                    active={activePreset === preset.value}
                    onClick={() => applyPreset(preset.value)}
                  >
                    {preset.label}
                  </Chip>
                ))}
              </div>

              <div className="mt-2.5 grid grid-cols-2 gap-2">
                {(
                  [
                    { key: 'dateFrom', label: 'от' },
                    { key: 'dateTo', label: 'до' },
                  ] as const
                ).map(({ key, label }) => (
                  <div key={key}>
                    <label htmlFor={`filter-${key}`} className="mb-1 block text-sm text-ink-faint">
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
                        'h-7 px-2 font-mono text-xs',
                        '[&::-webkit-calendar-picker-indicator]:cursor-pointer',
                        '[&::-webkit-calendar-picker-indicator]:opacity-40',
                        'hover:[&::-webkit-calendar-picker-indicator]:opacity-80',
                      )}
                    />
                  </div>
                ))}
              </div>
            </Section>

            {/* LIB-04 */}
            <Section title="Сортировка">
              <Select<SortKey>
                value={value.sort ?? DEFAULT_SORT}
                onValueChange={(sort) => patch({ sort })}
                options={SORT_OPTIONS}
                className="border border-line-strong"
              />
            </Section>
          </div>

          <footer className="flex h-11 shrink-0 items-center gap-2 border-t border-line px-4">
            <span className="min-w-0 flex-1 truncate text-sm text-ink-faint">
              {activeCount > 0 ? `Активных фильтров: ${activeCount}` : 'Фильтры не заданы'}
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={!dirty}
              onClick={() => {
                setTagQuery('');
                onChange(clearFilters(value));
              }}
              className="-mr-2"
            >
              Сбросить
            </Button>
          </footer>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
