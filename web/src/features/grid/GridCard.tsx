/**
 * Карточка сетки — раздел 2 спеки.
 * Позиционируется абсолютно: раскладку считает useMasonry, карточка только рисует.
 */
import { memo, useState, type MouseEvent } from 'react';
import { ImageOff, Shapes } from 'lucide-react';
import type { FileRecord, LibraryScope } from '@shared/api';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/Badge';
import { Checkbox } from '@/components/ui/Checkbox';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/ContextMenu';
import { DRAG_MIME, fileDrag } from './dnd';

export interface GridCardProps {
  file: FileRecord;
  box: { x: number; y: number; width: number; height: number };
  selected: boolean;
  scope: LibraryScope;
  /** Имя папки показываем в «Не разобрано» и в результатах поиска — §2 спеки. */
  folderName: string | null;
  onSelectClick: (file: FileRecord, event: MouseEvent) => void;
  onToggle: (file: FileRecord) => void;
  onOpen: (file: FileRecord) => void;
  onDragStart: (file: FileRecord) => readonly number[];
  onTrash: (file: FileRecord) => void;
  onRestore: (file: FileRecord) => void;
  onPurge: (file: FileRecord) => void;
  onCopy: (file: FileRecord) => void;
  onReveal: (file: FileRecord) => void;
}

/** Пропорции карточки. Битый файл размеров не имеет — даём ему спокойный ландшафт. */
export function cardRatio(file: FileRecord): number {
  if (file.width && file.height && file.width > 0) return file.height / file.width;
  return 0.72;
}

function Preview({ file }: { file: FileRecord }) {
  const [failed, setFailed] = useState(false);

  if (file.isBroken) {
    return (
      <div className="flex h-full w-full items-center justify-center text-ink-faint">
        <ImageOff className="size-6" strokeWidth={1.5} aria-hidden />
      </div>
    );
  }

  // SVG превью не имеет по формату (не ошибка) — показываем иконку формата.
  if (file.previewUrl === null || failed) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-ink-faint">
        <Shapes className="size-7" strokeWidth={1.5} aria-hidden />
        <span className="font-mono text-2xs tracking-label uppercase">{file.ext}</span>
      </div>
    );
  }

  return (
    <img
      src={file.previewUrl}
      alt={file.originalFilename}
      width={file.width ?? undefined}
      height={file.height ?? undefined}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
      className="h-full w-full object-cover"
    />
  );
}

export const GridCard = memo(function GridCard({
  file,
  box,
  selected,
  scope,
  folderName,
  onSelectClick,
  onToggle,
  onOpen,
  onDragStart,
  onTrash,
  onRestore,
  onPurge,
  onCopy,
  onReveal,
}: GridCardProps) {
  const inTrash = scope === 'trash';

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          aria-pressed={selected}
          aria-label={file.originalFilename}
          data-file-id={file.id}
          style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
          className="group absolute"
          draggable
          onDragStart={(event) => {
            const ids = onDragStart(file);
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData(DRAG_MIME, JSON.stringify(ids));
          }}
          onDragEnd={() => fileDrag.end()}
          onClick={(event) => onSelectClick(file, event)}
          onDoubleClick={() => onOpen(file)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onOpen(file);
            }
          }}
        >
          <div
            className={cn(
              'relative h-full w-full overflow-hidden rounded-md bg-surface-raised',
              'transition-transform duration-[var(--dur-fast)] ease-out',
              'group-hover:scale-[1.01]',
              selected && 'shadow-card-selected',
            )}
          >
            <Preview file={file} />

            {/* Верхний ряд: чекбокс и имя папки слева, «похоже, дубль» справа. */}
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start gap-1.5 p-2">
              <div className="pointer-events-auto flex min-w-0 items-center gap-1.5">
                <Checkbox
                  checked={selected}
                  onCheckedChange={() => onToggle(file)}
                  label={selected ? 'Снять выделение' : 'Выделить'}
                  className={cn(
                    'transition-opacity duration-[var(--dur-fast)] ease-out',
                    selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
                  )}
                />
                {folderName ? <Badge className="min-w-0">{folderName}</Badge> : null}
              </div>
              <div className="flex-1" />
              {file.similarToFileId !== null ? <Badge>похоже, дубль</Badge> : null}
            </div>

            {file.ext === 'gif' ? (
              <div className="pointer-events-none absolute bottom-0 left-0 p-2">
                <Badge>gif</Badge>
              </div>
            ) : null}

            {file.isBroken ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <Badge variant="danger">битый файл</Badge>
              </div>
            ) : null}
          </div>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent>
        {inTrash ? (
          <>
            <ContextMenuItem onSelect={() => onRestore(file)}>Восстановить</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem danger onSelect={() => onPurge(file)}>
              Удалить навсегда
            </ContextMenuItem>
          </>
        ) : (
          <>
            <ContextMenuItem onSelect={() => onOpen(file)}>Открыть</ContextMenuItem>
            <ContextMenuItem hotkey="⌘C" onSelect={() => onCopy(file)}>
              Скопировать
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => onReveal(file)}>Показать в Finder</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem danger hotkey="⌫" onSelect={() => onTrash(file)}>
              В корзину
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
});
