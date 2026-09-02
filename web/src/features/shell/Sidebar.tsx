import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { motion } from 'motion/react';
import {
  ChevronDown,
  ChevronUp,
  Folder,
  FolderOpen,
  Inbox,
  Library,
  MoreVertical,
  Plus,
  Settings,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import type { FolderRecord, LibraryScope, StatsResponse } from '@shared/api';
import { cn } from '@/lib/cn';
import { EASE_OUT, DUR_BASE } from '@/lib/motion';
import { flattenVisibleFolders } from '@/lib/folders';
import { useViewSelector, viewActions } from '@/store/view';
import { DRAG_MIME, fileDrag } from '@/features/grid/dnd';
import { Popover, PopoverContent, PopoverItem, PopoverSeparator, PopoverTrigger } from '@/components/ui/Popover';
import { Tooltip } from '@/components/ui/Tooltip';

/* Метрики строки сняты с артборда 2-0; дублируют одноимённые токены. */
const ICON = 16; // слот иконки папки
const ROW_GAP = 8; // иконка → имя
const ROW_PAD_X = 12; // поля строки
const INDENT = 12; // отступ уровня вложенности
const ACTION = 12; // «+» и «⋮»
const ACTION_GAP = 2; // зазор между ними — по макету
const COUNT_GUTTER = 28; // место под счётчик у правого поля: до 4 цифр 10px + зазор

/** Прокрутка длинного имени: скорость и границы длительности. */
const MARQUEE_SPEED = 90; // px в секунду
const MARQUEE_MIN_MS = 240;
const MARQUEE_MAX_MS = 2200; // очень длинное имя не должно ехать бесконечно

export interface SidebarProps {
  folders: readonly FolderRecord[];
  stats: StatsResponse;
  /** Папка в режиме переименования — строку заменяет поле ввода. */
  renamingFolderId?: number | null;
  /** ORG-02 — создать папку. `null` — в корне, иначе внутри указанной. */
  onCreateFolder?: (parentFolderId: number | null) => void;
  onRenameStart?: (id: number) => void;
  onRenameCommit?: (id: number, name: string) => void;
  onRenameCancel?: () => void;
  onDeleteFolder?: (folder: FolderRecord) => void;
  /** ORG-03 — на папку бросили карточки из сетки. */
  onDropFiles?: (folderId: number, fileIds: readonly number[]) => void;
  /** Открыть настройки. Входа в них в каноническом фрейме нет — см. комментарий у подвала. */
  onOpenSettings?: () => void;
}

/*
  Иконки у разделов — не украшение: без них текст разделов начинался на x = 28,
  а имена папок на x = 52, и сайдбар распадался на два столбца (аудит 4.1).
  Слот тот же `.sidebar-icon`, что у папок.
*/
const SCOPES: {
  scope: LibraryScope;
  label: string;
  icon: LucideIcon;
  counter: keyof StatsResponse | null;
}[] = [
  { scope: 'library', label: 'Вся библиотека', icon: Library, counter: null },
  { scope: 'untagged', label: 'Не разобрано', icon: Inbox, counter: 'untagged' },
  { scope: 'trash', label: 'Корзина', icon: Trash2, counter: 'trash' },
];

/**
 * Длинное имя папки: помещается ли оно и на сколько его увезти при наведении.
 *
 * `freeSpace` — что освободится под текст, когда уедет иконка и появятся кнопки
 * (кнопки лежат поверх имени, поэтому их ширину, наоборот, вычитаем).
 *
 * Ширину окна считаем от строки, а не от самого окна: под курсором слот иконки
 * схлопывается, окно становится шире, и замер по нему во время анимации давал бы
 * то переполнение, то его отсутствие. Геометрия строки от наведения не зависит.
 */
function useMarquee(text: string, freeSpace: number) {
  const boxRef = useRef<HTMLElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [metrics, setMetrics] = useState({ overflows: false, shift: 0 });

  useLayoutEffect(() => {
    const box = boxRef.current;
    const label = textRef.current;
    const row = box?.parentElement;
    if (!box || !label || !row) return;

    const measure = () => {
      const style = getComputedStyle(row);
      const available =
        row.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight) -
        ICON -
        ROW_GAP;
      const overflow = label.scrollWidth - available;
      setMetrics({
        /*
          Затухание включаем чуть раньше настоящего переполнения: в покое у правого
          края лежит счётчик, и имя, доехавшее вплотную, читалось бы поверх него.
          Ход при этом считается от настоящей ширины окна — иначе имя уехало бы дальше,
          чем нужно.
        */
        overflows: label.scrollWidth > available - COUNT_GUTTER,
        shift: overflow > 0.5 ? Math.max(0, Math.ceil(overflow - freeSpace)) : 0,
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    observer.observe(label);
    return () => observer.disconnect();
  }, [text, freeSpace]);

  return { boxRef, textRef, ...metrics };
}

export function FolderRow({
  folder,
  depth,
  active,
  collapsed,
  renaming,
  onSelect,
  onToggle,
  onCreateChild,
  onRenameStart,
  onRenameCommit,
  onRenameCancel,
  onDelete,
  onDropFiles,
}: {
  folder: FolderRecord;
  depth: number;
  active: boolean;
  collapsed: boolean;
  renaming: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onCreateChild: () => void;
  onRenameStart?: (id: number) => void;
  onRenameCommit?: (id: number, name: string) => void;
  onRenameCancel?: () => void;
  onDelete?: (folder: FolderRecord) => void;
  onDropFiles?: (folderId: number, fileIds: readonly number[]) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dropTarget, setDropTarget] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasChildren = folder.children.length > 0;
  /* Кнопки лежат поверх имени — имя тянется до правого поля, как на артборде. */
  const trailingWidth = ACTION * 2 + ACTION_GAP;
  const { boxRef, textRef, overflows, shift } = useMarquee(
    folder.name,
    ICON + ROW_GAP - trailingWidth,
  );

  const duration = Math.min(
    MARQUEE_MAX_MS,
    Math.max(MARQUEE_MIN_MS, Math.round((shift / MARQUEE_SPEED) * 1000)),
  );

  useEffect(() => {
    if (renaming) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [renaming]);

  const FolderIcon = hasChildren && !collapsed ? FolderOpen : Folder;
  const Chevron = collapsed ? ChevronDown : ChevronUp;

  return (
    <div
      style={
        {
          paddingLeft: ROW_PAD_X + depth * INDENT,
          paddingRight: ROW_PAD_X,
          '--marquee-shift': `-${shift}px`,
          '--marquee-dur': `${duration}ms`,
        } as CSSProperties
      }
      className={cn(
        'sidebar-row group relative flex h-[var(--size-row)] items-center gap-[var(--sidebar-row-gap)]',
        'rounded-md transition-colors duration-[var(--dur-fast)] ease-out',
        // Ховер и выбор — разные роли: раньше заливка была одна, и наведение читалось как выбор.
        active ? 'bg-surface-row text-ink' : 'text-ink-muted hover:bg-surface-row-hover',
        menuOpen && !active && 'bg-surface-row-hover',
        // ORG-03 — папка под курсором при перетаскивании карточек.
        dropTarget && 'bg-accent-soft text-ink ring-1 ring-accent',
      )}
      onDragOver={(event) => {
        if (!fileDrag.isActive()) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setDropTarget(true);
      }}
      onDragLeave={() => setDropTarget(false)}
      onDrop={(event) => {
        if (!fileDrag.isActive()) return;
        event.preventDefault();
        setDropTarget(false);
        const ids = fileDrag.get();
        fileDrag.end();
        // Данные дублируются в dataTransfer — на случай перетаскивания между окнами.
        void event.dataTransfer.getData(DRAG_MIME);
        if (ids.length > 0) onDropFiles?.(folder.id, ids);
      }}
    >
      {/*
        Слот иконки. У папки с вложенными он же переключатель: при наведении
        именно на него папка сменяется шевроном — так видно, что по нему кликают.
      */}
      {hasChildren ? (
        <button
          type="button"
          aria-label={collapsed ? `Развернуть «${folder.name}»` : `Свернуть «${folder.name}»`}
          aria-expanded={!collapsed}
          onClick={onToggle}
          className="sidebar-icon group/toggle"
        >
          <FolderIcon
            className="size-4 transition-opacity duration-[var(--dur-fast)] group-hover/toggle:opacity-0"
            strokeWidth={1.5}
            aria-hidden
          />
          <Chevron
            className="absolute size-4 opacity-0 transition-opacity duration-[var(--dur-fast)] group-hover/toggle:opacity-100"
            strokeWidth={1.5}
            aria-hidden
          />
        </button>
      ) : (
        <span className="sidebar-icon">
          <FolderIcon className="size-4" strokeWidth={1.5} aria-hidden />
        </span>
      )}

      {renaming ? (
        <input
          ref={inputRef}
          defaultValue={folder.name}
          onBlur={(event) => onRenameCommit?.(folder.id, event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onRenameCommit?.(folder.id, event.currentTarget.value);
            if (event.key === 'Escape') onRenameCancel?.();
          }}
          className="min-w-0 flex-1 rounded-xs bg-surface-raised px-1 text-md text-ink outline-none"
        />
      ) : (
        <button
          type="button"
          ref={boxRef as React.RefObject<HTMLButtonElement>}
          onClick={onSelect}
          data-fade={overflows || undefined}
          className="sidebar-name text-left"
        >
          <span
            ref={textRef}
            className={cn('sidebar-name__text text-md', active && 'font-medium')}
          >
            {folder.name}
          </span>
        </button>
      )}

      {/*
        Счётчик: файлы папки вместе с подпапками (решение D2 от 02.09.2026 —
        родительская папка показывает всё поддерево). Уходит под курсором,
        освобождая место кнопкам: они встают ровно на его место.
      */}
      <span
        className={cn(
          'label-count pointer-events-none absolute inset-y-0 flex items-center',
          'transition-opacity duration-[var(--dur-fast)] ease-out',
          'group-hover:opacity-0',
          (menuOpen || active) && 'opacity-0',
        )}
        style={{ right: ROW_PAD_X }}
      >
        {folder.totalFileCount}
      </span>

      {/*
        Трейлинг лежит поверх имени, а не в потоке: по макету имя тянется до
        правого поля строки, а кнопки проявляются над ним при наведении.
      */}
      <span
        className="absolute inset-y-0 flex items-center"
        style={{ right: ROW_PAD_X, gap: ACTION_GAP }}
      >
        <Tooltip content="Новая папка внутри" side="bottom">
          <button
            type="button"
            aria-label={`Новая папка внутри «${folder.name}»`}
            onClick={onCreateChild}
            className={cn(
              'sidebar-action opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
              menuOpen && 'opacity-100',
            )}
          >
            <Plus className="size-3" strokeWidth={1.5} aria-hidden />
          </button>
        </Tooltip>
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <Tooltip content="Действия с папкой" side="bottom">
            <PopoverTrigger
              aria-label={`Действия с папкой «${folder.name}»`}
              className={cn(
                'sidebar-action opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
                (menuOpen || active) && 'opacity-100',
              )}
            >
              <MoreVertical className="size-3" strokeWidth={1.5} aria-hidden />
            </PopoverTrigger>
          </Tooltip>
          <PopoverContent align="end" sideOffset={4} className="min-w-[168px]">
            <PopoverItem
              onClick={() => {
                setMenuOpen(false);
                onCreateChild();
              }}
            >
              Новая папка внутри
            </PopoverItem>
            <PopoverItem
              onClick={() => {
                setMenuOpen(false);
                onRenameStart?.(folder.id);
              }}
            >
              Переименовать
            </PopoverItem>
            <PopoverSeparator />
            <PopoverItem
              className="text-danger hover:bg-danger-soft hover:text-danger"
              onClick={() => {
                setMenuOpen(false);
                onDelete?.(folder);
              }}
            >
              Удалить папку
            </PopoverItem>
          </PopoverContent>
        </Popover>
      </span>
    </div>
  );
}

export function Sidebar({
  folders,
  stats,
  renamingFolderId = null,
  onCreateFolder,
  onRenameStart,
  onRenameCommit,
  onRenameCancel,
  onDeleteFolder,
  onDropFiles,
  onOpenSettings,
}: SidebarProps) {
  const collapsed = useViewSelector((s) => s.sidebarCollapsed);
  const scope = useViewSelector((s) => s.scope);
  const activeFolderId = useViewSelector((s) => s.folderId);
  const collapsedFolderIds = useViewSelector((s) => s.collapsedFolderIds);

  const collapsedSet = useMemo(() => new Set(collapsedFolderIds), [collapsedFolderIds]);
  const visible = useMemo(
    () => flattenVisibleFolders(folders, collapsedSet),
    [folders, collapsedSet],
  );

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 0 : 240 }}
      transition={{ duration: DUR_BASE, ease: EASE_OUT }}
      className="h-full shrink-0 overflow-hidden bg-surface"
      aria-label="Разделы и папки"
      data-collapsed={collapsed}
    >
      <div className="sidebar-shell flex h-full w-[var(--size-sidebar)] flex-col gap-7">
        {/*
          Логотип: своё левое поле, как у строк ниже — артборд 3IV-0.
          Заодно вторая зона перетаскивания окна (аудит логики §7): оболочку
          сайдбара целиком размечать нельзя — строки папок остаются целями drop.
        */}
        <div
          data-tauri-drag-region="deep"
          className="flex shrink-0 items-center gap-[var(--sidebar-logo-gap)] pl-[var(--sidebar-row-pad-x)]"
        >
          <span
            className="size-[22px] shrink-0 rounded-[7px] bg-linear-to-br from-accent to-accent-deep"
            aria-hidden
          />
          <span className="text-md leading-[18px] font-medium text-ink">Копирка</span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-8">
          <nav className="flex shrink-0 flex-col">
            {SCOPES.map((item) => {
              const active = scope === item.scope && activeFolderId === null;
              const ScopeIcon = item.icon;
              return (
                <button
                  key={item.scope}
                  type="button"
                  onClick={() => viewActions.setScope(item.scope)}
                  className={cn(
                    'flex h-[var(--size-row)] w-full items-center gap-[var(--sidebar-row-gap)] rounded-md',
                    'px-[var(--sidebar-row-pad-x)] transition-colors duration-[var(--dur-fast)] ease-out',
                    active
                      ? 'bg-surface-row text-ink'
                      : 'text-ink-muted hover:bg-surface-row-hover',
                  )}
                >
                  <span className="sidebar-icon">
                    <ScopeIcon className="size-4" strokeWidth={1.5} aria-hidden />
                  </span>
                  <span
                    className={cn('min-w-0 flex-1 truncate text-left text-md', active && 'font-medium')}
                  >
                    {item.label}
                  </span>
                  {item.counter && <span className="label-count">{stats[item.counter]}</span>}
                </button>
              );
            })}
          </nav>

          <div className="flex min-h-0 flex-1 flex-col gap-2">
            {/* Заголовок секции «ПАПКИ» + создание в корне */}
            <div className="flex h-3 shrink-0 items-center px-[var(--sidebar-row-pad-x)]">
              <span className="label-sidebar min-w-0 flex-1">Папки</span>
              <Tooltip content="Новая папка" side="bottom">
                <button
                  type="button"
                  aria-label="Новая папка"
                  onClick={() => onCreateFolder?.(null)}
                  className="sidebar-action"
                >
                  <Plus className="size-3" strokeWidth={1.5} aria-hidden />
                </button>
              </Tooltip>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              {visible.map(({ folder, depth }) => (
                <FolderRow
                  key={folder.id}
                  folder={folder}
                  depth={depth}
                  active={activeFolderId === folder.id}
                  collapsed={collapsedSet.has(folder.id)}
                  renaming={renamingFolderId === folder.id}
                  onSelect={() => viewActions.openFolder(folder.id)}
                  onToggle={() => viewActions.toggleFolderCollapsed(folder.id)}
                  onCreateChild={() => onCreateFolder?.(folder.id)}
                  onRenameStart={onRenameStart}
                  onRenameCommit={onRenameCommit}
                  onRenameCancel={onRenameCancel}
                  onDelete={onDeleteFolder}
                  onDropFiles={onDropFiles}
                />
              ))}
            </div>
          </div>
        </div>

        {/*
          Вход в настройки. В каноническом фрейме его нет, но экран настроек
          в MVP обязателен (SET-01…03, SET-05) и иначе недостижим. Поставлен подвалом
          сайдбара — самое незаметное место, не спорящее с разделами наверху.
        */}
        <button
          type="button"
          onClick={onOpenSettings}
          className={cn(
            'flex h-[var(--size-row)] w-full shrink-0 items-center gap-[var(--sidebar-row-gap)] rounded-md',
            'px-[var(--sidebar-row-pad-x)] text-ink-muted hover:bg-surface-row-hover',
            // Единственная кнопка сайдбара, которая шла мимо токенов движения (аудит 4.3).
            'transition-colors duration-[var(--dur-fast)] ease-out',
          )}
        >
          <span className="sidebar-icon">
            <Settings className="size-4" strokeWidth={1.5} aria-hidden />
          </span>
          <span className="min-w-0 flex-1 truncate text-left text-md">Настройки</span>
        </button>
      </div>
    </motion.aside>
  );
}
