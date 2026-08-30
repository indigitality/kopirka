import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Folder, MoreVertical, Plus, Settings } from 'lucide-react';
import type { FolderRecord, LibraryScope, StatsResponse } from '@shared/api';
import { cn } from '@/lib/cn';
import { EASE_OUT, DUR_BASE } from '@/lib/motion';
import { flattenFolders } from '@/lib/folders';
import { useViewSelector, viewActions } from '@/store/view';
import { DRAG_MIME, fileDrag } from '@/features/grid/dnd';
import { Popover, PopoverContent, PopoverItem, PopoverSeparator, PopoverTrigger } from '@/components/ui/Popover';

/** Ширина слота под иконку папки. Задаёт вертикальную полосу имён. */
const ICON_SLOT = 18;
/** Отступ одного уровня вложенности — раздел 1 спеки. */
const INDENT = 16;
/** Слот под трейлинг: счётчик раздела и кнопка «⋮» упираются в один правый край. */
const TRAILING_SLOT = 24;

export interface SidebarProps {
  folders: readonly FolderRecord[];
  stats: StatsResponse;
  /** Папка в режиме переименования — строку заменяет поле ввода. */
  renamingFolderId?: number | null;
  onCreateFolder?: () => void;
  onRenameStart?: (id: number) => void;
  onRenameCommit?: (id: number, name: string) => void;
  onRenameCancel?: () => void;
  onDeleteFolder?: (folder: FolderRecord) => void;
  /** ORG-03 — на папку бросили карточки из сетки. */
  onDropFiles?: (folderId: number, fileIds: readonly number[]) => void;
  /** Открыть настройки. Входа в них в каноническом фрейме нет — см. комментарий у подвала. */
  onOpenSettings?: () => void;
}

const SCOPES: { scope: LibraryScope; label: string; counter: keyof StatsResponse | null }[] = [
  { scope: 'library', label: 'Вся библиотека', counter: null },
  { scope: 'untagged', label: 'Не разобрано', counter: 'untagged' },
  { scope: 'trash', label: 'Корзина', counter: 'trash' },
];

function rowClass(active: boolean): string {
  return cn(
    'group flex h-[var(--size-row)] w-full items-center rounded-md pl-2 pr-1',
    'transition-colors duration-[var(--dur-fast)] ease-out',
    active ? 'bg-surface-active text-ink' : 'text-ink-muted hover:bg-surface-hover hover:text-ink',
  );
}

function FolderRow({
  folder,
  depth,
  active,
  renaming,
  onSelect,
  onRenameStart,
  onRenameCommit,
  onRenameCancel,
  onDelete,
  onDropFiles,
}: {
  folder: FolderRecord;
  depth: number;
  active: boolean;
  renaming: boolean;
  onSelect: () => void;
  onRenameStart?: (id: number) => void;
  onRenameCommit?: (id: number, name: string) => void;
  onRenameCancel?: () => void;
  onDelete?: (folder: FolderRecord) => void;
  onDropFiles?: (folderId: number, fileIds: readonly number[]) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dropTarget, setDropTarget] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [renaming]);

  return (
    <div
      className={cn(
        rowClass(active),
        menuOpen && 'bg-surface-hover text-ink',
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
      {/* Ведущая часть: только она сдвигается вложенностью — трейлинг остаётся на месте. */}
      <button
        type="button"
        onClick={onSelect}
        disabled={renaming}
        style={{ paddingLeft: depth * INDENT }}
        className="flex min-w-0 flex-1 items-center text-left"
      >
        <span
          className="flex shrink-0 items-center justify-center text-ink-faint"
          style={{ width: ICON_SLOT }}
        >
          <Folder className="size-3.5" strokeWidth={2} aria-hidden />
        </span>
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
          <span className="min-w-0 flex-1 truncate text-md">{folder.name}</span>
        )}
      </button>

      <span
        className="flex shrink-0 items-center justify-center"
        style={{ width: TRAILING_SLOT, height: TRAILING_SLOT }}
      >
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger
            aria-label={`Действия с папкой «${folder.name}»`}
            className={cn(
              'flex size-6 items-center justify-center rounded-sm text-ink-faint',
              'opacity-0 transition-opacity duration-[var(--dur-fast)] ease-out',
              'group-hover:opacity-100 hover:text-ink focus-visible:opacity-100',
              menuOpen && 'opacity-100 text-ink',
            )}
          >
            <MoreVertical className="size-3.5" strokeWidth={2} aria-hidden />
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={4} className="min-w-[168px]">
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
  const flat = flattenFolders(folders);

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 0 : 240 }}
      transition={{ duration: DUR_BASE, ease: EASE_OUT }}
      className="h-full shrink-0 overflow-hidden bg-surface"
      aria-label="Разделы и папки"
      data-collapsed={collapsed}
    >
      <div className="flex h-full w-[var(--size-sidebar)] flex-col">
        {/* Логотип */}
        <div className="flex h-[var(--size-topbar)] shrink-0 items-center gap-2.5 px-4">
          <span
            className="size-[22px] shrink-0 rounded-sm bg-linear-to-br from-accent to-accent-deep"
            aria-hidden
          />
          <span className="text-lg font-medium text-ink">Копирка</span>
        </div>

        <nav className="flex flex-col gap-0.5 px-4">
          {SCOPES.map((item) => {
            const active = scope === item.scope && activeFolderId === null;
            return (
              <button
                key={item.scope}
                type="button"
                onClick={() => viewActions.setScope(item.scope)}
                className={rowClass(active)}
              >
                <span className="min-w-0 flex-1 truncate text-left text-md">{item.label}</span>
                <span
                  className="flex shrink-0 items-center justify-end pr-1 font-mono text-xs text-ink-faint tabular-nums"
                  style={{ minWidth: TRAILING_SLOT }}
                >
                  {item.counter ? stats[item.counter] : null}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Заголовок секции «ПАПКИ» + создание */}
        <div className="mt-5 mb-1 flex h-6 shrink-0 items-center px-4">
          <span className="label-section min-w-0 flex-1">Папки</span>
          <button
            type="button"
            aria-label="Новая папка"
            onClick={onCreateFolder}
            className={cn(
              'flex size-4 shrink-0 items-center justify-center rounded-xs text-ink-faint',
              'transition-colors duration-[var(--dur-fast)] ease-out hover:text-ink',
            )}
          >
            <Plus className="size-3.5" strokeWidth={2} aria-hidden />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-4 pb-4">
          {flat.map(({ folder, depth }) => (
            <FolderRow
              key={folder.id}
              folder={folder}
              depth={depth}
              active={activeFolderId === folder.id}
              renaming={renamingFolderId === folder.id}
              onSelect={() => viewActions.openFolder(folder.id)}
              onRenameStart={onRenameStart}
              onRenameCommit={onRenameCommit}
              onRenameCancel={onRenameCancel}
              onDelete={onDeleteFolder}
              onDropFiles={onDropFiles}
            />
          ))}
        </div>

        {/*
          Вход в настройки. В каноническом фрейме 1SC-0 его нет, но экран настроек
          в MVP обязателен (SET-01…03, SET-05) и иначе недостижим. Поставлен подвалом
          сайдбара — самое незаметное место, не спорящее с разделами наверху.
        */}
        <div className="mt-auto shrink-0 px-4 py-2">
          <button
            type="button"
            onClick={onOpenSettings}
            className={cn(
              'group flex h-[var(--size-row)] w-full items-center rounded-md pl-2 pr-1',
              'text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink',
            )}
          >
            <span className="flex w-[22px] shrink-0 items-center">
              <Settings className="size-3.5" strokeWidth={2} aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate text-left text-md">Настройки</span>
          </button>
        </div>
      </div>
    </motion.aside>
  );
}
