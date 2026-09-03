/**
 * Сайдбар — панель 240 радиуса 24 на `panel` (артборд R01, узел «Сайдбар»).
 * Все состояния строки — полка R13 «Строки сайдбара · состояния».
 *
 * Сворачивания в редизайне нет: кнопка, хоткей ⌘\ и анимация ширины убраны
 * решением 02.09.2026.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  ChevronDown,
  ChevronUp,
  EllipsisVertical,
  Folder,
  FolderOpen,
  Inbox,
  Library,
  MessageSquareWarning,
  Plus,
  Settings,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import type { FolderRecord, LibraryScope, StatsResponse } from '@shared/api';
import { cn } from '@/lib/cn';
import { Icon } from '@/lib/icons';
import { BUG_REPORT_URL, EXTERNAL_LINK_PROPS } from '@/lib/links';
import { MARQUEE_SPEED_PX_S } from '@/lib/motion';
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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/ContextMenu';
import { Logo } from '@/components/ui/Logo';
import {
  Popover,
  PopoverContent,
  PopoverItem,
  PopoverSeparator,
  PopoverTrigger,
} from '@/components/ui/Popover';
import { Tooltip } from '@/components/ui/Tooltip';

/* Метрики строки сняты с узлов R01 и полки R13; дублируют одноимённые токены. */
const ICON = 16; // слот иконки папки
const ROW_GAP = 8; // иконка → имя, и он же зазор между «+» и «⋮»
const ROW_PAD_X = 12; // поля строки
const INDENT = 12; // отступ уровня вложенности: второй уровень — 24 слева
const ACTION = 14; // «+» и «⋮» (`--sidebar-action`)
const COUNT_GUTTER = 28; // место под счётчик у правого поля: до 4 цифр 10px + зазор

/**
 * Прокрутка длинного имени — 40 px/с (R13 · движение). Верхняя граница нужна
 * только против патологии: имя в пару экранов ехало бы полминуты.
 */
const MARQUEE_MIN_MS = 240;
const MARQUEE_MAX_MS = 8000;

/** Свёрнутая папка раскрывается сама, если груз завис над ней. */
const HOVER_EXPAND_MS = 600;

/**
 * Общая геометрия строки сайдбара: раздел, папка, подвал (все 32 × radius 8,
 * поля 12, зазор 8). Цвета состояний добавляет вызывающий.
 */
const ROW_BASE =
  'sidebar-row group relative flex h-[var(--size-row)] items-center gap-[var(--sidebar-row-gap)] ' +
  'rounded-[var(--radius-md)] transition-colors duration-[var(--dur-fast)] ease-out';

/** Имя строки: 14 / 21 / 500 — единственный «жирный» текст сайдбара. */
const ROW_LABEL = 'text-md leading-[21px] font-medium';

/**
 * Цель броска. Лайм: заливка `brand-tint` + внутренняя обводка 1 px.
 * Обводка сделана тенью, а не border: border сдвинул бы содержимое строки
 * на пиксель ровно в тот момент, когда груз над ней.
 */
const DROP_OVER = 'bg-brand-tint text-brand shadow-[inset_0_0_0_1px_var(--color-brand)]';
const DROP_OVER_DANGER = 'bg-danger-tint text-danger shadow-[inset_0_0_0_1px_var(--color-danger)]';
/** «Сюда нельзя»: та же плашка danger, но без обводки — и словом (R13). */
const DROP_DENIED = 'bg-danger-tint text-danger cursor-not-allowed';

/**
 * Состояние строки как цели сброса. Считается по общему снимку переноса:
 * кто под курсором, знает `dnd.ts` — строка только рисует.
 */
export interface DropState {
  /** Цель в принципе принимает то, что тащат: мягкая подсказка «сюда можно». */
  accepts: boolean;
  /** Груз висит над строкой — неважно, примет она его или нет. */
  aimed: boolean;
  /** Цель под курсором и бросок сработает. */
  over: boolean;
  /** Цель под курсором, но бросок ничего не изменит. */
  denied: boolean;
}

function useDropState(target: DropTarget | null, preview?: DropState) {
  const drag = useFileDragSnapshot();
  const key = target === null ? '' : dropTargetKey(target);
  const accepts = target !== null && acceptsDrag(target, drag);
  const aimed = target !== null && drag.overKey === key;
  const live: DropState = {
    accepts,
    aimed,
    over: aimed && accepts && !drag.rejected,
    denied: aimed && drag.rejected,
  };
  return { key, ...(preview ?? live) };
}

/**
 * Подсказка «сюда можно»: внутренняя пунктирная рамка `line-control`, гаснет
 * под курсором — там её сменяет сплошная лаймовая (R13 · «тащим папку»).
 */
function DropHint({ show, dim }: { show: boolean; dim: boolean }) {
  if (!show) return null;
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 rounded-[var(--radius-md)] border border-dashed',
        'transition-colors duration-[var(--dur-fast)] ease-out',
        dim ? 'border-transparent' : 'border-line-control',
      )}
    />
  );
}

/** Слово вместо счётчика, когда бросок ничего не изменит (R13 · «сюда нельзя»). */
function DeniedLabel() {
  return <span className="text-2xs leading-[14px] text-danger">нельзя</span>;
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
  /** Открыть настройки — вторая строка подвала (R13 · подвал). */
  onOpenSettings?: () => void;
}

/*
  Иконки у разделов — не украшение: без них текст разделов начинался на x = 28,
  а имена папок на x = 52, и сайдбар распадался на два столбца (аудит 4.1).
  Слот тот же `.sidebar-icon`, что у папок.
*/
export interface ScopeItem {
  scope: LibraryScope;
  label: string;
  icon: LucideIcon;
  counter: keyof StatsResponse | null;
  /** Чем становится бросок карточек на раздел. «Вся библиотека» ничего не меняет. */
  target: DropTarget | null;
}

export const SCOPES: ScopeItem[] = [
  /* Счётчик «всей библиотеки» — 214 в R01: сколько файлов всего, включая разложенные. */
  {
    scope: 'library',
    label: 'Вся библиотека',
    icon: Library,
    counter: 'library',
    target: null,
  },
  {
    scope: 'untagged',
    label: 'Не разобрано',
    icon: Inbox,
    counter: 'untagged',
    target: { kind: 'unfiled' },
  },
  {
    scope: 'trash',
    label: 'Корзина',
    icon: Trash2,
    counter: 'trash',
    target: { kind: 'trash' },
  },
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
  dropPreview,
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
  /**
   * Только для витрины: подменить состояние цели перетаскивания. В приложении
   * не задаётся — тогда состояние берётся из живого снимка `dnd.ts`. Иначе
   * состояния «сюда можно / нельзя / пунктир» на полке было бы не показать:
   * их включает указатель, а не пропсы.
   */
  dropPreview?: DropState;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { key, accepts, aimed, over, denied } = useDropState(
    { kind: 'folder', folderId: folder.id },
    dropPreview,
  );

  /*
    Меню строки открывается двумя путями — кнопкой «⋮» и правым кликом по
    строке. Состояния у них разные (иначе правый клик раскрывал бы ещё и
    поповер), а вид строки — общий: пока висит любое из меню, строка держит
    подложку и показывает кнопки.
  */
  const anyMenu = menuOpen || contextOpen;

  /** Пункты меню — один список на поповер и на правый клик. */
  const menuActions = [
    { label: 'Новая папка внутри', run: onCreateChild },
    { label: 'Переименовать', run: () => onRenameStart?.(folder.id) },
  ];
  const deleteAction = {
    label: 'Удалить папку',
    run: () => onDelete?.(folder),
  };

  const hasChildren = folder.children.length > 0;
  /* Кнопки лежат поверх имени — имя тянется до правого поля, как на артборде. */
  const trailingWidth = ACTION * 2 + ROW_GAP;
  const { boxRef, textRef, overflows, shift } = useMarquee(
    folder.name,
    ICON + ROW_GAP - trailingWidth,
  );

  /* Скорость постоянная — 40 px/с; из неё и хода получается длительность. */
  const duration = Math.min(
    MARQUEE_MAX_MS,
    Math.max(MARQUEE_MIN_MS, Math.round((shift / MARQUEE_SPEED_PX_S) * 1000)),
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
    /*
      Правый клик по строке открывает то же меню, что «⋮» (R14 · «папка в
      сайдбаре»). Триггер — сама строка, поэтому попасть в меню можно из любой
      её точки, а не только по мелкой кнопке.
    */
    <ContextMenu onOpenChange={setContextOpen}>
      <ContextMenuTrigger asChild>
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
            ROW_BASE,
            // Ховер и выбор — разные роли: 10 % под курсором, 15 % и яркий текст у выбранной.
            active ? 'bg-control-hover text-ink' : 'text-ink-muted hover:bg-control',
            anyMenu && !active && 'bg-control',
            // ORG-03 — папка под курсором. Файл уже в ней: лайма нет, курсор запрещает.
            over && DROP_OVER,
            denied && DROP_DENIED,
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
              <Icon
                icon={FolderIcon}
                className="transition-opacity duration-[var(--dur-fast)] group-hover/toggle:opacity-0"
                aria-hidden
              />
              {/* Шеврон ярче папки — по нему кликают (R13 · «курсор на иконке»). */}
              <Icon
                icon={Chevron}
                className="absolute text-ink opacity-0 transition-opacity duration-[var(--dur-fast)] group-hover/toggle:opacity-100"
                aria-hidden
              />
            </button>
          ) : (
            <span className="sidebar-icon">
              <Icon icon={FolderIcon} aria-hidden />
            </span>
          )}

          {renaming ? (
            /* Поле поверх строки: фон окна, лаймовая рамка, 24 в высоту (R13). */
            <input
              ref={inputRef}
              defaultValue={folder.name}
              onBlur={(event) => onRenameCommit?.(folder.id, event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') onRenameCommit?.(folder.id, event.currentTarget.value);
                if (event.key === 'Escape') onRenameCancel?.();
              }}
              className={cn(
                'h-6 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-brand bg-app px-2',
                ROW_LABEL,
                /* Единственное место сайдбара, где текст выделять нужно. */
                'text-ink outline-none select-text',
              )}
            />
          ) : (
            <button
              type="button"
              ref={boxRef as React.RefObject<HTMLButtonElement>}
              onClick={onSelect}
              data-fade={overflows || undefined}
              className="sidebar-name text-left"
            >
              <span ref={textRef} className={cn('sidebar-name__text', ROW_LABEL)}>
                {folder.name}
              </span>
            </button>
          )}

          {/*
        Счётчик: файлы папки вместе с подпапками (решение D2 от 02.09.2026 —
        родительская папка показывает всё поддерево). Уходит под курсором,
        освобождая место кнопкам: они встают ровно на его место. При
        переименовании его нет вовсе — поле занимает строку целиком (R13).
      */}
          {renaming ? null : (
            <span
              className={cn(
                'label-count pointer-events-none absolute inset-y-0 flex items-center',
                'transition-opacity duration-[var(--dur-fast)] ease-out',
                'group-hover:opacity-0',
                (anyMenu || active || denied) && 'opacity-0',
              )}
              style={{ right: ROW_PAD_X }}
            >
              {folder.totalFileCount}
            </span>
          )}

          {/* Груз над строкой, но бросок ничего не изменит — говорим словом. */}
          {denied ? (
            <span
              className="pointer-events-none absolute inset-y-0 flex items-center"
              style={{ right: ROW_PAD_X }}
            >
              <DeniedLabel />
            </span>
          ) : null}

          {/*
        Трейлинг лежит поверх имени, а не в потоке: по макету имя тянется до
        правого поля строки, а кнопки проявляются над ним при наведении.
        Зазор между «+» и «⋮» — тот же 8, что и во всей строке (R13).
      */}
          <span
            className={cn('absolute inset-y-0 flex items-center', renaming && 'hidden')}
            style={{ right: ROW_PAD_X, gap: ROW_GAP }}
          >
            <Tooltip content="Новая папка внутри" side="bottom">
              <button
                type="button"
                aria-label={`Новая папка внутри «${folder.name}»`}
                onClick={onCreateChild}
                className={cn(
                  'sidebar-action opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
                  anyMenu && 'opacity-100',
                )}
              >
                <Icon icon={Plus} size={ACTION} aria-hidden />
              </button>
            </Tooltip>
            <Popover open={menuOpen} onOpenChange={setMenuOpen}>
              <Tooltip content="Действия с папкой" side="bottom">
                <PopoverTrigger
                  aria-label={`Действия с папкой «${folder.name}»`}
                  className={cn(
                    'sidebar-action opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
                    (anyMenu || active) && 'opacity-100',
                  )}
                >
                  <Icon icon={EllipsisVertical} size={ACTION} aria-hidden />
                </PopoverTrigger>
              </Tooltip>
              <PopoverContent align="end" sideOffset={4} className="min-w-[168px]">
                {menuActions.map((action) => (
                  <PopoverItem
                    key={action.label}
                    onClick={() => {
                      setMenuOpen(false);
                      action.run();
                    }}
                  >
                    {action.label}
                  </PopoverItem>
                ))}
                <PopoverSeparator />
                <PopoverItem
                  className="text-danger hover:bg-danger-tint hover:text-danger"
                  onClick={() => {
                    setMenuOpen(false);
                    deleteAction.run();
                  }}
                >
                  {deleteAction.label}
                </PopoverItem>
              </PopoverContent>
            </Popover>
          </span>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent>
        {menuActions.map((action) => (
          <ContextMenuItem key={action.label} onSelect={action.run}>
            {action.label}
          </ContextMenuItem>
        ))}
        <ContextMenuSeparator />
        <ContextMenuItem danger onSelect={deleteAction.run}>
          {deleteAction.label}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/**
 * Строка раздела. Два из трёх разделов — цели сброса: «Не разобрано» вынимает
 * файл из папки, «Корзина» отправляет в корзину (тон danger, а не акцент).
 */
export function ScopeRow({
  item,
  active,
  count,
  dropPreview,
}: {
  item: ScopeItem;
  active: boolean;
  count: number | null;
  /** Только для витрины — см. одноимённый проп `FolderRow`. */
  dropPreview?: DropState;
}) {
  const { accepts, over, denied } = useDropState(item.target, dropPreview);
  const danger = item.target?.kind === 'trash';
  const ScopeIcon = item.icon;

  return (
    <button
      type="button"
      onClick={() => viewActions.setScope(item.scope)}
      {...(item.target ? { [DROP_TARGET_ATTR]: dropTargetKey(item.target) } : null)}
      className={cn(
        ROW_BASE,
        'w-full px-[var(--sidebar-row-pad-x)]',
        active ? 'bg-control-hover text-ink' : 'text-ink-muted hover:bg-control',
        over && (danger ? DROP_OVER_DANGER : DROP_OVER),
        denied && DROP_DENIED,
      )}
    >
      <DropHint show={accepts} dim={over} />
      <span className="sidebar-icon">
        <Icon icon={ScopeIcon} aria-hidden />
      </span>
      <span className={cn('min-w-0 flex-1 truncate text-left', ROW_LABEL)}>{item.label}</span>
      {/* «Корзина» под грузом, который она не примет: вместо счётчика — слово. */}
      {denied ? <DeniedLabel /> : count !== null && <span className="label-count">{count}</span>}
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
  const scope = useViewSelector((s) => s.scope);
  const activeFolderId = useViewSelector((s) => s.folderId);
  const collapsedFolderIds = useViewSelector((s) => s.collapsedFolderIds);

  const collapsedSet = useMemo(() => new Set(collapsedFolderIds), [collapsedFolderIds]);
  const visible = useMemo(
    () => flattenVisibleFolders(folders, collapsedSet),
    [folders, collapsedSet],
  );

  /* Строка подвала: та же геометрия, что у разделов, цвет — вместо opacity (R13). */
  const footerRow = cn(
    ROW_BASE,
    'w-full px-[var(--sidebar-row-pad-x)] text-ink-muted hover:bg-control hover:text-ink',
  );

  return (
    <aside
      className={cn(
        'sidebar-shell flex h-full w-[var(--size-sidebar)] shrink-0 flex-col',
        'gap-[var(--sidebar-gap)] rounded-[var(--radius-panel)] bg-panel',
        /*
          Текст оболочки мышью не выделяется: имена папок, счётчики и логотип —
          это органы управления, а не содержимое. Иначе правый клик по строке
          сперва подсвечивал имя лаймом (::selection) и только потом открывал
          меню. Единственное исключение — поле переименования (`select-text`).
        */
        'select-none',
      )}
      aria-label="Разделы и папки"
    >
      {/*
        Логотип. Своё левое поле 12 — то же, что у строк ниже; зазор знак → слово 10.
        Верхний отступ панели — макетные 24 из `.sidebar-shell`, и только они:
        кнопки светофора уводит вниз полоса оболочки (`--shell-pad-top`), сама
        панель начинается уже под ними.

        Зона перетаскивания окна (аудит логики §7): размечать оболочку сайдбара
        целиком нельзя — строки папок остаются целями drop.
      */}
      <div
        data-tauri-drag-region="deep"
        className="flex shrink-0 items-center pl-[var(--sidebar-logo-pad-x)]"
      >
        <Logo />
      </div>

      {/* Разделы: зазор между строками 2 (узел «Разделы» R01). */}
      <nav className="flex shrink-0 flex-col gap-0.5">
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
        {/* Заголовок секции «ПАПКИ» + создание в корне: ряд 14, поля 12. */}
        <div className="flex h-[14px] shrink-0 items-center px-[var(--sidebar-row-pad-x)]">
          <span className="label-section min-w-0 flex-1">Папки</span>
          <Tooltip content="Новая папка" side="bottom">
            <button
              type="button"
              aria-label="Новая папка"
              onClick={() => onCreateFolder?.(null)}
              className="sidebar-action"
            >
              <Icon icon={Plus} size={ACTION} aria-hidden />
            </button>
          </Tooltip>
        </div>

        {/* Автопрокрутка при переносе идёт по этому контейнеру — см. dnd.ts. */}
        <div
          {...{ [DROP_SCROLL_ATTR]: '' }}
          className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto"
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

      {/* Подвал: «Сообщить об ошибке» и «Настройки», зазор 2 (узел «Подвал» R01). */}
      <div className="flex shrink-0 flex-col gap-0.5">
        {/*
          Внешняя ссылка обычным `<a target="_blank">`: в окне приложения её
          перехватывает десктопный слой и отдаёт системному браузеру — тем же
          путём, что «Открыть источник» в панели деталей.
        */}
        <a href={BUG_REPORT_URL} {...EXTERNAL_LINK_PROPS} className={footerRow}>
          <span className="sidebar-icon">
            <Icon icon={MessageSquareWarning} aria-hidden />
          </span>
          <span className={cn('min-w-0 flex-1 truncate text-left', ROW_LABEL)}>
            Сообщить об ошибке
          </span>
        </a>

        <button type="button" onClick={onOpenSettings} className={footerRow}>
          <span className="sidebar-icon">
            <Icon icon={Settings} aria-hidden />
          </span>
          <span className={cn('min-w-0 flex-1 truncate text-left', ROW_LABEL)}>Настройки</span>
        </button>
      </div>
    </aside>
  );
}
