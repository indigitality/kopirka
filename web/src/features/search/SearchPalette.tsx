/**
 * NEW-02 — поиск-модалка. Заменяет поле поиска верхней панели и «командную
 * палитру ⌘K» из плана (открытый вопрос №5 спеки закрыт решением Сергея
 * 11.09.2026). Канон — страница «Доработки от 11.09» в Paper, артборды
 * D01 (пусто) · D02 (ввод) · D03 (закреплённые чипы) · D04 (ничего не нашлось).
 *
 * Геометрия снята с макета один в один: коробка 720 с радиусом `--radius-panel`,
 * поле запроса 56 с полями 20 и зазором 12, линия `line-strong` под ним, тело с
 * полями 8 × 16 и зазором 18 между секциями, линия и подвал 36 внизу. Отличие от
 * макета одно и оно решение Сергея: коробка не плотная `--color-raised`, а лёгкое
 * стекло — `.glass` (`--color-raised-glass` + размытие 20).
 *
 * Что модалка НЕ делает: не владеет фильтрами сетки. ⌘↵ отдаёт их стору
 * (`viewActions.applySearch`), и дальше их показывает обычная панель фильтров.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Folder, Search, SearchX, X } from 'lucide-react';
import type { FileSummary, SearchQuery, SearchResponse } from '@shared/api';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal, ModalContent } from '@/components/ui/Modal';
import * as api from '@/lib/api';
import { cn } from '@/lib/cn';
import { plural } from '@/lib/format';
import { Icon, iconProps } from '@/lib/icons';
import { hotkeyLabel } from '@/lib/platform';
import { viewActions } from '@/store/view';
import {
  addChip,
  chipKey,
  chipLabel,
  chipsToQuery,
  removeChip,
  searchQuery,
  type SearchChip,
} from './chips';

/** SEARCH-02 — пауза перед запросом. 120 мс: короче, чем у сетки (250), модалка живее. */
const DEBOUNCE_MS = 120;

const EMPTY_RESULT: SearchResponse = { files: [], tags: [], exts: [], folders: [], total: 0 };

/** Строка, по которой ходят ↑↓. Один плоский список на все секции — иначе стрелки спотыкаются. */
type Row =
  | { kind: 'file'; id: string; file: FileSummary }
  | { kind: 'chip'; id: string; chip: SearchChip; label: string; count: number };

export interface SearchPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Источник данных. По умолчанию — сервер; витрина подставляет свой, чтобы
   * истории рисовались без запущенной «Копирки».
   */
  fetchResults?: (query: SearchQuery, signal?: AbortSignal) => Promise<SearchResponse>;
  /** Начальное состояние — только для витрины и прогонов. */
  initialText?: string;
  initialChips?: readonly SearchChip[];
}

// ── Мелкие части ─────────────────────────────────────────────────────────────

/** Заголовок секции: `.label-section` в поле 12, как в макете. */
function SectionTitle({ children }: { children: string }) {
  return (
    <div className="px-3">
      <span className="label-section">{children}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <SectionTitle>{title}</SectionTitle>
      {children}
    </section>
  );
}

/**
 * Закреплённый чип в поле запроса (D03): лайм, подпись `brand-ink`, крестик 12.
 * Геометрия своя, не `Chip`: у общей пилюли крестик 16 в кружке 16 и поле справа 6,
 * а в макете поле справа 8 и крестик 12 без подложки.
 */
function PinnedChip({ chip, onRemove }: { chip: SearchChip; onRemove: () => void }) {
  const label = chipLabel(chip);
  return (
    <span
      data-search-chip={chipKey(chip)}
      className="flex h-[var(--size-chip)] shrink-0 items-center gap-1.5 rounded-pill bg-brand pr-2 pl-2.5"
    >
      <span className="max-w-40 truncate text-sm leading-4 font-medium text-brand-ink">{label}</span>
      <button
        type="button"
        aria-label={`Убрать фильтр ${label}`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onRemove}
        className="flex shrink-0 items-center text-brand-ink opacity-70 transition-opacity duration-[var(--dur-fast)] ease-out hover:opacity-100"
      >
        <X {...iconProps(12)} aria-hidden />
      </button>
    </span>
  );
}

/**
 * Строка списка: файл (40, зазор 10) или папка (32, зазор 8). Наведение и
 * активность — одна и та же заливка `control-hover`: ↑↓ и мышь ведут к одному.
 */
function ListRow({
  active,
  height,
  rowId,
  rowKind,
  entityId,
  onActivate,
  onClick,
  children,
}: {
  active: boolean;
  height: 'file' | 'folder';
  rowId: string;
  rowKind: 'file' | 'folder';
  entityId: number;
  onActivate: () => void;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <div
      role="option"
      aria-selected={active}
      data-search-row={rowKind}
      data-search-row-id={rowId}
      data-search-entity-id={String(entityId)}
      // Мышь только подсвечивает строку: выбор делает клик, как в списках меню.
      onMouseMove={onActivate}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        'flex shrink-0 cursor-pointer items-center rounded-md px-3',
        height === 'file' ? 'h-10 gap-2.5' : 'h-[var(--size-row)] gap-2',
        active && 'bg-control-hover',
      )}
    >
      {children}
    </div>
  );
}

// ── Модалка ──────────────────────────────────────────────────────────────────

export function SearchPalette({
  open,
  onOpenChange,
  fetchResults = api.search,
  initialText = '',
  initialChips = [],
}: SearchPaletteProps) {
  const [text, setText] = useState(initialText);
  const [chips, setChips] = useState<readonly SearchChip[]>(initialChips);
  const [result, setResult] = useState<SearchResponse>(EMPTY_RESULT);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const trimmed = text.trim();
  const hasChips = chips.length > 0;

  /*
    Какие секции показываем — прямо по макетам:
      D01 (пусто)      — ТЕГИ · ФОРМАТЫ · ПАПКИ;
      D02 (ввод)       — ФАЙЛЫ · ТЕГИ · ПАПКИ (форматов нет);
      D03 (есть чипы)  — только ФАЙЛЫ: подсказки уступают место выдаче.
  */
  const showFiles = trimmed !== '' || hasChips;
  const showTags = !hasChips;
  const showExts = !hasChips && trimmed === '';
  const showFolders = !hasChips;

  // Каждое открытие начинается с чистого листа: модалка — не окно с историей.
  useEffect(() => {
    if (!open) return;
    setText(initialText);
    setChips(initialChips);
    setActive(0);
    /*
      Зависимость одна нарочно: сброс делается на открытии, а не каждый раз, когда
      вызывающий передал новый литерал `initialChips`.
    */
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  /*
    Дебаунс 120 мс и отмена устаревшего запроса. `AbortController` обязателен:
    ответы на «даш», «дашб», «дашбо» приходят вразнобой, и без отмены выдачу
    занимал бы тот, кто просто оказался медленнее.
  */
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const query = searchQuery(text, chips);
    const timer = window.setTimeout(() => {
      setLoading(true);
      fetchResults(query, controller.signal)
        .then((response) => {
          if (controller.signal.aborted) return;
          setResult(response);
          setActive(0);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setResult(EMPTY_RESULT);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, text, chips, fetchResults]);

  /** Плоский список строк в том же порядке, в каком они нарисованы. */
  const rows = useMemo<Row[]>(() => {
    const list: Row[] = [];
    if (showFiles) {
      for (const file of result.files) list.push({ kind: 'file', id: `file:${file.id}`, file });
    }
    if (showTags) {
      for (const tag of result.tags) {
        list.push({
          kind: 'chip',
          id: `tag:${tag.name}`,
          chip: { kind: 'tag', value: tag.name },
          label: tag.name,
          count: tag.count,
        });
      }
    }
    if (showExts) {
      for (const ext of result.exts) {
        if (ext.count === 0) continue;
        list.push({
          kind: 'chip',
          id: `ext:${ext.ext}`,
          chip: { kind: 'ext', value: ext.ext },
          label: ext.ext.toUpperCase(),
          count: ext.count,
        });
      }
    }
    if (showFolders) {
      for (const folder of result.folders) {
        list.push({
          kind: 'chip',
          id: `folder:${folder.id}`,
          chip: { kind: 'folder', value: folder.path, folderId: folder.id },
          label: folder.path,
          count: folder.count,
        });
      }
    }
    return list;
  }, [result, showFiles, showTags, showExts, showFolders]);

  const activeRow = rows[active] ?? null;

  // Активная строка не должна уезжать за край прокручиваемого тела.
  useEffect(() => {
    if (activeRow === null) return;
    const node = listRef.current?.querySelector(`[data-search-row-id="${CSS.escape(activeRow.id)}"]`);
    if (node instanceof HTMLElement) node.scrollIntoView({ block: 'nearest' });
  }, [activeRow]);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  /** ⌘↵ — закрыть модалку и положить запрос с чипами на сетку. */
  const applyAsFilter = useCallback(() => {
    const { tags, exts, folderId } = chipsToQuery(chips);
    viewActions.applySearch({ query: trimmed, tags, exts, folderId: folderId ?? null });
    close();
  }, [chips, trimmed, close]);

  /** ↵ на файле — открыть детальный просмотр. Сначала сетка, иначе просмотру нечего листать. */
  const openFile = useCallback(
    (file: FileSummary) => {
      const { tags, exts, folderId } = chipsToQuery(chips);
      viewActions.applySearch({ query: trimmed, tags, exts, folderId: folderId ?? null });
      viewActions.openFile(file.id);
      close();
    },
    [chips, trimmed, close],
  );

  /** ↵ на теге, формате или папке — закрепить чипом и очистить строку. */
  const pin = useCallback((chip: SearchChip) => {
    setChips((prev) => addChip(prev, chip));
    setText('');
    setActive(0);
    inputRef.current?.focus();
  }, []);

  const activate = useCallback(
    (row: Row) => {
      if (row.kind === 'file') openFile(row.file);
      else pin(row.chip);
    },
    [openFile, pin],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const meta = event.metaKey || event.ctrlKey;

    if (event.key === 'Enter') {
      event.preventDefault();
      if (meta) {
        applyAsFilter();
        return;
      }
      if (activeRow !== null) activate(activeRow);
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (rows.length === 0) return;
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setActive((prev) => (prev + delta + rows.length) % rows.length);
      return;
    }

    // Backspace на пустом поле снимает последний закреплённый чип (D03).
    if (event.key === 'Backspace' && text === '' && chips.length > 0) {
      event.preventDefault();
      setChips((prev) => prev.slice(0, -1));
    }
  };

  const nothingFound = showFiles && !loading && rows.length === 0;

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        bare
        size="lg"
        title="Поиск по библиотеке"
        description="Стрелки — выбор строки, Enter — открыть, Cmd+Enter — применить как фильтр, Esc — закрыть."
        aria-label="Поиск по библиотеке"
        data-kopirka-search-palette=""
        /*
          Решение Сергея 11.09.2026: лёгкое стекло вместо плотной панели макета.
          Модалка стоит не по центру, а в 120 px от верха окна (скрим D01: поле
          сверху 120, дальше по центру по горизонтали) — поле ввода оказывается
          примерно там, где было в верхней панели, и взгляд никуда не прыгает.
          24 из них — поле обёртки, поэтому здесь 96.
        */
        className="glass mt-24 max-h-[calc(100%-96px)] self-start"
        onOpenAutoFocus={(event) => {
          // Фокус ставим сами: Radix иначе целится в первый фокусируемый узел,
          // а им может оказаться крестик закреплённого чипа.
          event.preventDefault();
          inputRef.current?.focus();
        }}
      >
        {/* Поле запроса — 56, поля 20, зазор 12 (узел «Поле запроса» D01). */}
        <div className="flex h-14 shrink-0 items-center gap-3 px-5">
          <Icon icon={Search} size={20} className="shrink-0 text-ink-faint" aria-hidden />

          {chips.length > 0 ? (
            <div className="flex shrink-0 items-center gap-1.5">
              {chips.map((chip) => (
                <PinnedChip
                  key={chipKey(chip)}
                  chip={chip}
                  onRemove={() => {
                    setChips((prev) => removeChip(prev, chipKey(chip)));
                    inputRef.current?.focus();
                  }}
                />
              ))}
            </div>
          ) : null}

          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={chips.length > 0 ? '' : 'Искать файлы, теги, форматы…'}
            aria-label="Искать файлы, теги, форматы"
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            className={cn(
              'min-w-0 flex-1 bg-transparent text-lg leading-5 font-medium text-ink',
              'placeholder:font-medium placeholder:text-ink-faint outline-none',
            )}
          />

          {/* Бейдж ESC: 20 × auto, поля 8, радиус 6, подложка `control` (узел «Бейдж ESC»). */}
          <kbd className="flex h-5 shrink-0 items-center rounded-sm bg-control px-2 text-2xs leading-[15px] font-medium tracking-label text-ink-faint">
            ESC
          </kbd>
        </div>

        <div className="h-px shrink-0 bg-line-strong" />

        {/* Тело: поля 8 по горизонтали и 16 по вертикали, зазор между секциями 18. */}
        <div
          ref={listRef}
          role="listbox"
          aria-label="Результаты поиска"
          className="scrollbar-visible flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-2 py-4"
        >
          {nothingFound ? (
            <EmptyState
              className="px-6 py-14"
              icon={<Icon icon={SearchX} size={20} aria-hidden />}
              title={trimmed === '' ? 'Под эти фильтры ничего нет' : `Ничего не нашлось по «${trimmed}»`}
              description="Проверьте теги или уберите фильтр формата"
            />
          ) : null}

          {showFiles && result.files.length > 0 ? (
            <Section title="Файлы">
              <div className="flex flex-col gap-0.5">
                {result.files.map((file) => {
                  const index = rows.findIndex((row) => row.id === `file:${file.id}`);
                  const isActive = index === active;
                  return (
                    <ListRow
                      key={file.id}
                      active={isActive}
                      height="file"
                      rowId={`file:${file.id}`}
                      rowKind="file"
                      entityId={file.id}
                      onActivate={() => setActive(index)}
                      onClick={() => openFile(file)}
                    >
                      {/* Превью 32 с радиусом 6; пока картинки нет — подложка `raised-hover`. */}
                      <span className="size-8 shrink-0 overflow-hidden rounded-sm bg-raised-hover">
                        {file.previewUrl ? (
                          <img
                            src={file.previewUrl}
                            alt=""
                            loading="lazy"
                            className="size-full object-cover"
                          />
                        ) : null}
                      </span>
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate text-md leading-[18px] font-medium',
                          isActive ? 'text-ink' : 'text-ink-muted',
                        )}
                      >
                        {file.originalFilename}
                      </span>
                      <span className="shrink-0 text-sm leading-[18px] text-ink-faint">
                        {`${file.folderPath ?? 'Не разобрано'} · ${file.ext.toUpperCase()}`}
                      </span>
                    </ListRow>
                  );
                })}
              </div>
            </Section>
          ) : null}

          {showTags && result.tags.length > 0 ? (
            <Section title="Теги">
              <div className="flex flex-wrap gap-2 px-3">
                {result.tags.map((tag) => {
                  const id = `tag:${tag.name}`;
                  const index = rows.findIndex((row) => row.id === id);
                  return (
                    <SuggestionChip
                      key={tag.name}
                      id={id}
                      active={index === active}
                      label={tag.name}
                      count={tag.count}
                      onActivate={() => setActive(index)}
                      onClick={() => pin({ kind: 'tag', value: tag.name })}
                    />
                  );
                })}
              </div>
            </Section>
          ) : null}

          {showExts ? (
            <Section title="Форматы">
              <div className="flex flex-wrap gap-2 px-3">
                {result.exts.map((hit) => {
                  const id = `ext:${hit.ext}`;
                  const index = rows.findIndex((row) => row.id === id);
                  return (
                    <SuggestionChip
                      key={hit.ext}
                      id={id}
                      active={index === active}
                      label={hit.ext.toUpperCase()}
                      /* Формат из контракта, которого в библиотеке нет: показан, но не нажимается. */
                      disabled={hit.count === 0}
                      technical
                      onActivate={() => setActive(index)}
                      onClick={() => pin({ kind: 'ext', value: hit.ext })}
                    />
                  );
                })}
              </div>
            </Section>
          ) : null}

          {showFolders && result.folders.length > 0 ? (
            <Section title="Папки">
              <div className="flex flex-col gap-0.5">
                {result.folders.map((folder) => {
                  const id = `folder:${folder.id}`;
                  const index = rows.findIndex((row) => row.id === id);
                  const isActive = index === active;
                  return (
                    <ListRow
                      key={folder.id}
                      active={isActive}
                      height="folder"
                      rowId={id}
                      rowKind="folder"
                      entityId={folder.id}
                      onActivate={() => setActive(index)}
                      onClick={() => pin({ kind: 'folder', value: folder.path, folderId: folder.id })}
                    >
                      <Icon icon={Folder} size={16} className="shrink-0 text-ink-muted" aria-hidden />
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate text-md leading-[21px] font-medium',
                          isActive ? 'text-ink' : 'text-ink-muted',
                        )}
                      >
                        {folder.path}
                      </span>
                      <span className="label-count shrink-0 text-ink-faint">{folder.count}</span>
                    </ListRow>
                  );
                })}
              </div>
            </Section>
          ) : null}
        </div>

        <div className="h-px shrink-0 bg-line-strong" />

        {/* Подвал 36: слева подсказки клавиш, справа счётчик найденного (D03). */}
        <div className="flex h-9 shrink-0 items-center justify-between gap-4 px-5">
          <span className="min-w-0 truncate text-2xs leading-[15px] font-medium tracking-label text-ink-faint">
            {`↑↓ выбрать · ↵ открыть · ${hotkeyLabel('⌘')}↵ применить как фильтр · esc закрыть`}
          </span>
          {showFiles ? (
            <span
              data-search-total=""
              className="shrink-0 text-2xs leading-[15px] font-medium tracking-label text-ink-faint tabular-nums"
            >
              {`${result.total} ${plural(result.total, 'файл', 'файла', 'файлов')}`}
            </span>
          ) : null}
        </div>
      </ModalContent>
    </Modal>
  );
}

/**
 * Чип-подсказка (тег или формат): та же пилюля 26, что и в панели фильтров,
 * плюс счётчик 10 px справа. Активная строка подсвечена `control-hover` —
 * ровно как строка файла, чтобы ↑↓ читались одинаково во всех секциях.
 */
function SuggestionChip({
  id,
  active,
  label,
  count,
  technical,
  disabled,
  onActivate,
  onClick,
}: {
  id: string;
  active: boolean;
  label: string;
  count?: number;
  technical?: boolean;
  disabled?: boolean;
  onActivate: () => void;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      disabled={disabled}
      data-search-row={id.startsWith('tag:') ? 'tag' : 'ext'}
      data-search-row-id={id}
      onMouseMove={disabled ? undefined : onActivate}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        'inline-flex h-[var(--size-chip)] shrink-0 items-center gap-2 rounded-pill px-2.5',
        'transition-colors duration-[var(--dur-fast)] ease-out',
        active ? 'bg-control-hover' : 'bg-control',
        disabled && 'pointer-events-none opacity-40',
      )}
    >
      <span
        className={cn(
          'truncate',
          technical ? 'text-xs leading-4' : 'text-sm leading-4 font-medium',
          active ? 'text-ink' : 'text-ink-muted',
        )}
      >
        {label}
      </span>
      {count !== undefined && !technical ? (
        <span className="shrink-0 text-2xs leading-[15px] font-medium tracking-label text-ink-faint tabular-nums">
          {count}
        </span>
      ) : null}
    </button>
  );
}
