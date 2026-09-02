/**
 * Карточка сетки — раздел 2 спеки.
 * Позиционируется абсолютно: раскладку считает useMasonry, карточка только рисует.
 */
import { memo, useEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
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
import { Tooltip } from '@/components/ui/Tooltip';
import { DRAG_THRESHOLD, fileDrag, useFileDrag } from './dnd';

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
  /** Начало переноса: ставит выделение и возвращает список, который поедет. */
  onDragStart: (file: FileRecord) => readonly number[];
  onTrash: (file: FileRecord) => void;
  onRestore: (file: FileRecord) => void;
  onPurge: (file: FileRecord) => void;
  onCopy: (file: FileRecord) => void;
  onReveal: (file: FileRecord) => void;
  /** Правый клик по невыделенной карточке: меню должно действовать на неё (02 §4.9). */
  onContextSelect: (file: FileRecord) => void;
  onAddTag: (file: FileRecord) => void;
}

/** Сколько тегов помещается на карточке; остальные сворачиваются в «+N» — решение D3. */
const MAX_CARD_TAGS = 3;

/**
 * Пороги плотности карточки. Считаем по фактической ширине, а не по имени размера:
 * колонка «M» на узком окне и «L» на широком дают разную карточку, и решает именно ширина.
 */
const WIDE_CARD = 480;
const TIGHT_CARD = 220;

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
  onContextSelect,
  onAddTag,
}: GridCardProps) {
  const inTrash = scope === 'trash';
  const shownTags = file.tags.slice(0, MAX_CARD_TAGS);
  const hiddenTags = file.tags.length - shownTags.length;
  const carried = useFileDrag((state) => state.dragging && state.ids.includes(file.id));

  /*
    Плотность разметки. На широкой карточке подписи мельчат, на узкой — наоборот,
    съедают картинку: там остаётся только чекбокс и точка «похоже, дубль».
  */
  const wide = box.width >= WIDE_CARD;
  const tight = box.width < TIGHT_CARD;
  const badgeText = wide ? 'text-xs' : undefined;
  const checkboxSize = wide ? 'size-6' : tight ? 'size-4 [&>svg]:size-2.5' : undefined;

  /*
    Перенос на pointer-событиях: HTML5 drag&drop в окне Tauri не доходит до страницы
    (см. заголовок dnd.ts). Пока указатель не ушёл на DRAG_THRESHOLD, это обычный клик.

    Движение слушаем на окне, а не на карточке: до захвата указателя быстрый рывок
    успевает увести курсор за её границы, и карточка не увидела бы ни одного `pointermove`.
  */
  const draggedRef = useRef(false);
  /** Наш ли перенос сейчас на экране: карточка может исчезнуть из сетки прямо под грузом. */
  const activeRef = useRef(false);
  const releaseRef = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      releaseRef.current?.();
      if (activeRef.current) fileDrag.cancel();
    },
    [],
  );

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    releaseRef.current?.();
    draggedRef.current = false;
    if (inTrash || event.button !== 0 || event.pointerType === 'touch') return;
    // Клик с модификатором — это выделение, а не перенос.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    // Чекбокс и прочие кнопки поверх картинки живут своей жизнью.
    if ((event.target as HTMLElement).closest('button, input, a, [role="menuitem"]')) return;

    const node = event.currentTarget;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;

    const detach = () => {
      releaseRef.current = null;
      activeRef.current = false;
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onCancel, true);
      try {
        if (node.hasPointerCapture(pointerId)) node.releasePointerCapture(pointerId);
      } catch {
        /* захвата не было — освобождать нечего */
      }
    };

    function onMove(move: PointerEvent): void {
      if (move.pointerId !== pointerId) return;
      if (!draggedRef.current) {
        if (Math.hypot(move.clientX - startX, move.clientY - startY) < DRAG_THRESHOLD) return;
        draggedRef.current = true;
        activeRef.current = true;
        const ids = onDragStart(file);
        // Запрет на «ту же папку» имеет смысл только для одиночной карточки.
        fileDrag.begin({
          ids,
          sourceFolderId: ids.length === 1 ? file.folderId : undefined,
          x: move.clientX,
          y: move.clientY,
        });
        // Захват гасит ховеры и клики на том, над чем пролетает груз.
        try {
          node.setPointerCapture(pointerId);
        } catch {
          /* указатель уже отпущен — перенос доживёт на обычных событиях */
        }
      }
      fileDrag.move(move.clientX, move.clientY);
    }

    function onUp(up: PointerEvent): void {
      if (up.pointerId !== pointerId) return;
      detach();
      if (draggedRef.current) fileDrag.drop();
    }

    function onCancel(cancel: PointerEvent): void {
      if (cancel.pointerId !== pointerId) return;
      detach();
      if (draggedRef.current) fileDrag.cancel();
    }

    releaseRef.current = detach;
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onCancel, true);
  };

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
          className={cn(
            'group absolute',
            // Источник переноса приглушён: груз уехал под курсор.
            'transition-opacity duration-[var(--dur-fast)] ease-out',
            carried && 'opacity-50',
          )}
          onPointerDown={handlePointerDown}
          onContextMenu={() => {
            if (!selected) onContextSelect(file);
          }}
          /* Клик после переноса не считается: флаг сбрасывает следующий pointerdown. */
          onClick={(event) => {
            if (draggedRef.current) return;
            onSelectClick(file, event);
          }}
          onDoubleClick={() => {
            if (draggedRef.current) return;
            onOpen(file);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onOpen(file);
            }
          }}
        >
          <div
            className={cn(
              'relative h-full w-full overflow-hidden bg-surface-raised',
              // Узкой карточке макетный радиус великоват — скругление уходит на ступень вниз.
              tight ? 'rounded-sm' : 'rounded-md',
              'transition-transform duration-[var(--dur-fast)] ease-out',
              'group-hover:scale-[1.01]',
              selected && 'shadow-card-selected',
            )}
          >
            <Preview file={file} />

            {/* Верхний ряд: чекбокс и имя папки слева, «похоже, дубль» справа. */}
            <div
              className={cn(
                'pointer-events-none absolute inset-x-0 top-0 flex items-start gap-1.5',
                tight ? 'p-1.5' : 'p-2',
              )}
            >
              <div className="pointer-events-auto flex min-w-0 items-center gap-1.5">
                <Checkbox
                  checked={selected}
                  onCheckedChange={() => onToggle(file)}
                  label={selected ? 'Снять выделение' : 'Выделить'}
                  className={cn(
                    'transition-opacity duration-[var(--dur-fast)] ease-out',
                    selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
                    checkboxSize,
                  )}
                />
                {/* Имя папки на узкой карточке не поместится — прячем целиком. */}
                {folderName && !tight ? (
                  <Badge className={cn('min-w-0', badgeText)}>{folderName}</Badge>
                ) : null}
              </div>
              <div className="flex-1" />
              {file.similarToFileId !== null ? (
                tight ? (
                  // Плашка съела бы четверть карточки — от неё остаётся точка с подсказкой.
                  <Tooltip content="Похоже, дубль" side="left">
                    <span
                      role="img"
                      aria-label="Похоже, дубль"
                      className="pointer-events-auto mt-1 size-1.5 shrink-0 rounded-pill bg-warning"
                    />
                  </Tooltip>
                ) : (
                  <Badge className={badgeText}>похоже, дубль</Badge>
                )
              ) : null}
            </div>

            {/* Нижний ряд: «gif» виден всегда, теги — только по наведению (решение D3). */}
            {file.ext === 'gif' || (shownTags.length > 0 && !tight) ? (
              <div
                className={cn(
                  'pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-end gap-1',
                  tight ? 'p-1.5' : 'p-2',
                )}
              >
                {file.ext === 'gif' ? <Badge className={badgeText}>gif</Badge> : null}
                {shownTags.length > 0 && !tight ? (
                  <span
                    className={cn(
                      'flex min-w-0 flex-wrap items-end gap-1',
                      'transition-opacity duration-[var(--dur-fast)] ease-out',
                      selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                    )}
                  >
                    {shownTags.map((tag) => (
                      <Badge key={tag} className={cn('max-w-[120px]', badgeText)}>
                        {tag}
                      </Badge>
                    ))}
                    {hiddenTags > 0 ? <Badge className={badgeText}>+{hiddenTags}</Badge> : null}
                  </span>
                ) : null}
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
            <ContextMenuItem onSelect={() => onAddTag(file)}>Добавить тег…</ContextMenuItem>
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
