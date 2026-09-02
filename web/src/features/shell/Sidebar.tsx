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
  PanelLeftClose,
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
import {
  DROP_SCROLL_ATTR,
  DROP_TARGET_ATTR,
  acceptsDrag,
  dropTargetKey,
  fileDrag,
  hasExternalFiles,
  useFileDragSnapshot,
  type DropTarget,
} from '@/features/grid/dnd';
import { IconButton } from '@/components/ui/IconButton';
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

/** Свёрнутая папка раскрывается сама, если груз завис над ней. */
const HOVER_EXPAND_MS = 600;

/**
 * Состояние строки как цели сброса. Считается по общему снимку переноса:
 * кто под курсором, знает `dnd.ts` — строка только рисует.
 */
function useDropState(target: DropTarget | null) {
  const drag = useFileDragSnapshot();
  const key = target === null ? '' : dropTargetKey(target);
  const accepts = target !== null && acceptsDrag(target, drag);
  const aimed = target !== null && drag.overKey === key;
  return {
    key,
    /** Цель в принципе принимает то, что тащат: мягкая подсказка «сюда можно». */
    accepts,
    /** Груз висит над строкой — неважно, примет она его или нет. */
    aimed,
    /** Цель под курсором и бросок сработает. */
    over: aimed && accepts && !drag.rejected,
    /** Цель под курсором, но бросок ничего не изменит. */
    denied: aimed && drag.rejected,
  };
}

/** Подсказка «сюда можно»: внутренняя пунктирная рамка, гаснет под курсором. */
function DropHint({ show, dim }: { show: boolean; dim: boolean }) {
  if (!show) return null;
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 rounded-md border border-dashed',
        'transition-colors duration-[var(--dur-fast)] ease-out',
        dim ? 'border-transparent' : 'border-line-control',
      )}
    />
  );
}

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
  /** 02 §4.4 — на папку бросили файлы из Finder: импорт сразу в неё. */
  onImportFiles?: (folderId: number, files: readonly File[]) => void;
  /** Открыть настройки. Входа в них в каноническом фрейме нет — см. комментарий у подвала. */
  onOpenSettings?: () => void;
}

/*
  Иконки у разделов — не украшение: без них текст разделов начинался на x = 28,
  а имена папок на x = 52, и сайдбар распадался на два столбца (аудит 4.1).
  Слот тот же `.sidebar-icon`, что у папок.
*/
interface ScopeItem {
  scope: LibraryScope;
  label: string;
  icon: LucideIcon;
  counter: keyof StatsResponse | null;
  /** Чем становится бросок карточек на раздел. «Вся библиотека» ничего не меняет. */
  target: DropTarget | null;
}

const SCOPES: ScopeItem[] = [
  { scope: 'library', label: 'Вся библиотека', icon: Library, counter: null, target: null },
  {
    scope: 'untagged',
    label: 'Не разобрано',
    icon: Inbox,
    counter: 'untagged',
    target: { kind: 'unfiled' },
  },
  { scope: 'trash', label: 'Корзина', icon: Trash2, counter: 'trash', target: { kind: 'trash' } },
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
  onImportFiles,
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
  onImportFiles?: (folderId: number, files: readonly File[]) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { key, accepts, aimed, over, denied } = useDropState({ kind: 'folder', folderId: folder.id });

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

  // Груз завис над свёрнутой папкой — раскрываем её, чтобы можно было донести глубже.
  // Считаем по `aimed`, а не по `over`: сама папка бросок не примет, а её вложенные — да.
  useEffect(() => {
    if (!aimed || !hasChildren || !collapsed) return;
    const timer = window.setTimeout(() => viewActions.expandFolder(folder.id), HOVER_EXPAND_MS);
    return () => window.clearTimeout(timer);
  }, [aimed, hasChildren, collapsed, folder.id]);

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
      {...{ [DROP_TARGET_ATTR]: `folder:${folder.id}` }}
      className={cn(
        'sidebar-row group relative flex h-[var(--size-row)] items-center gap-[var(--sidebar-row-gap)]',
        'rounded-md transition-colors duration-[var(--dur-fast)] ease-out',
        // Ховер и выбор — разные роли: раньше заливка была одна, и наведение читалось как выбор.
        active ? 'bg-surface-row text-ink' : 'text-ink-muted hover:bg-surface-row-hover',
        menuOpen && !active && 'bg-surface-row-hover',
        // ORG-03 — папка под курсором. Файл уже в ней: подсветки нет, курсор запрещает.
        over && 'bg-surface-active text-ink ring-1 ring-accent-ring',
        denied && 'cursor-not-allowed',
      )}
      /* Файлы из Finder идут прежним путём: HTML5-drop в браузере до сайдбара доходит. */
      onDragOver={(event) => {
        if (!hasExternalFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        fileDrag.setExternalOver(key);
      }}
      onDragLeave={() => fileDrag.clearExternalOver(key)}
      onDrop={(event) => {
        if (!hasExternalFiles(event)) return;
        event.preventDefault();
        event.stopPropagation();
        fileDrag.clearExternalOver(key);
        fileDrag.setExternal(false);
        const files = Array.from(event.dataTransfer.files);
        if (files.length > 0) onImportFiles?.(folder.id, files);
      }}
    >
      <DropHint show={accepts} dim={over} />

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

/**
 * Строка раздела. Два из трёх разделов — цели сброса: «Не разобрано» вынимает
 * файл из папки, «Корзина» отправляет в корзину (тон danger, а не акцент).
 */
function ScopeRow({
  item,
  active,
  count,
}: {
  item: ScopeItem;
  active: boolean;
  count: number | null;
}) {
  const { accepts, over, denied } = useDropState(item.target);
  const danger = item.target?.kind === 'trash';
  const ScopeIcon = item.icon;

  return (
    <button
      type="button"
      onClick={() => viewActions.setScope(item.scope)}
      {...(item.target ? { [DROP_TARGET_ATTR]: dropTargetKey(item.target) } : null)}
      className={cn(
        'relative flex h-[var(--size-row)] w-full items-center gap-[var(--sidebar-row-gap)] rounded-md',
        'px-[var(--sidebar-row-pad-x)] transition-colors duration-[var(--dur-fast)] ease-out',
        active ? 'bg-surface-row text-ink' : 'text-ink-muted hover:bg-surface-row-hover',
        over && (danger ? 'bg-danger-soft text-danger ring-1 ring-danger' : 'bg-surface-active text-ink ring-1 ring-accent-ring'),
        denied && 'cursor-not-allowed',
      )}
    >
      <DropHint show={accepts} dim={over} />
      <span className="sidebar-icon">
        <ScopeIcon className="size-4" strokeWidth={1.5} aria-hidden />
      </span>
      <span className={cn('min-w-0 flex-1 truncate text-left text-md', active && 'font-medium')}>
        {item.label}
      </span>
      {count !== null && <span className="label-count">{count}</span>}
    </button>
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
  onImportFiles,
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
          Логотип: своё левое поле, как у строк ниже — артборд 3IV-0. Высота ряда
          зафиксирована по логотипу (22px), чтобы кнопка 28×28 справа не сдвинула
          вниз всё, что ниже: она выходит за ряд на 3px сверху и снизу.
        */}
        <div className="flex h-[22px] shrink-0 items-center pl-[var(--sidebar-row-pad-x)]">
          {/*
            Зона перетаскивания окна (аудит логики §7): оболочку сайдбара целиком
            размечать нельзя — строки папок остаются целями drop. Кнопка нарочно
            снаружи этого блока: за неё окно тянуться не должно.
          */}
          <div
            data-tauri-drag-region="deep"
            className="flex h-full min-w-0 flex-1 items-center gap-[var(--sidebar-logo-gap)]"
          >
            <span
              className="size-[22px] shrink-0 rounded-[7px] bg-linear-to-br from-accent to-accent-deep"
              aria-hidden
            />
            <span className="text-md leading-[18px] font-medium text-ink">Копирка</span>
          </div>

          {/* Свернуть сайдбар. Развернуть обратно — кнопкой в углу верхней панели. */}
          <Tooltip content="Свернуть сайдбар" hotkey="⌘\" side="bottom">
            <IconButton
              size="sm"
              label="Свернуть сайдбар"
              onClick={() => viewActions.toggleSidebar()}
              className="-mr-1.5"
            >
              <PanelLeftClose className="size-4" strokeWidth={2} aria-hidden />
            </IconButton>
          </Tooltip>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-8">
          <nav className="flex shrink-0 flex-col">
            {SCOPES.map((item) => (
              <ScopeRow
                key={item.scope}
                item={item}
                active={scope === item.scope && activeFolderId === null}
                count={item.counter ? stats[item.counter] : null}
              />
            ))}
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

            {/* Автопрокрутка при переносе идёт по этому контейнеру — см. dnd.ts. */}
            <div
              {...{ [DROP_SCROLL_ATTR]: '' }}
              className="flex min-h-0 flex-1 flex-col overflow-y-auto"
            >
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
                  onImportFiles={onImportFiles}
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
