/**
 * Карточка сетки — раздел 2 спеки, редизайн по R13 · «Карточка сетки и чипы»
 * и экранам R01/R03/R04/R06.
 *
 * Позиционируется абсолютно: раскладку считает useMasonry, карточка только рисует.
 *
 * Что задал макет: радиус `--radius-card`, поле 8, тёмный чип имени папки в левом
 * верхнем углу, светлые чипы тегов внизу слева — **видны всегда**, «Похоже дубль»
 * сплошным чипом отдельной строкой над тегами. По наведению в углу папки
 * появляется круглый чекбокс, а сам чип папки уходит: слот один на двоих.
 */
import { memo, useEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { motion } from 'motion/react';
import { ImageOff, Shapes } from 'lucide-react';
import type { FileRecord, LibraryScope } from '@shared/api';
import { cn } from '@/lib/cn';
import { Icon } from '@/lib/icons';
import { CARD_RING_WIDTH, SPRING_PANEL } from '@/lib/motion';
import { hotkeyLabel, platformStrings } from '@/lib/platform';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { Checkbox } from '@/components/ui/Checkbox';
import { Chip } from '@/components/ui/Chip';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/ContextMenu';
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
  /** «В папку…» из меню карточки — тот же диалог, что у панели выделения (R14). */
  onMoveToFolder: (file: FileRecord) => void;
}

/**
 * Пороги плотности карточки. Считаем по фактической ширине, а не по имени размера:
 * колонка «M» на узком окне и «L» на широком дают разную карточку, и решает именно ширина.
 */
const WIDE_CARD = 480;
const TIGHT_CARD = 220;

/**
 * Поле и число чипов по плотности. Средняя карточка — ровно с макета
 * (R13: поле 8, три тега и «+2»); широкая дышит свободнее, узкая ужимается
 * до одного тега — геометрия самого чипа при этом не меняется (её держит `Chip`).
 */
const DENSITY = {
  wide: { pad: 12, tags: 6 },
  normal: { pad: 8, tags: 3 },
  tight: { pad: 6, tags: 1 },
} as const;

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
        <Icon icon={ImageOff} size={24} aria-hidden />
      </div>
    );
  }

  // SVG превью не имеет по формату (не ошибка) — показываем иконку формата.
  if (file.previewUrl === null || failed) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-ink-faint">
        <Icon icon={Shapes} size={28} aria-hidden />
        <span className="label-section">{file.ext}</span>
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
  onMoveToFolder,
}: GridCardProps) {
  const inTrash = scope === 'trash';
  const carried = useFileDrag((state) => state.dragging && state.ids.includes(file.id));
  const reduced = useReducedMotion();

  /*
    Плотность разметки. На широкой карточке чипов помещается больше, на узкой
    имя папки и лишние теги съели бы картинку — остаются один тег и «+N».
  */
  const wide = box.width >= WIDE_CARD;
  const tight = box.width < TIGHT_CARD;
  const density = wide ? DENSITY.wide : tight ? DENSITY.tight : DENSITY.normal;
  const shownTags = file.tags.slice(0, density.tags);
  const hiddenTags = file.tags.length - shownTags.length;
  const similar = file.similarToFileId !== null;
  /* Имя папки показываем только там, где карточка не занята чекбоксом (G3F-0 · наведение). */
  const showFolderChip = folderName !== null && !tight;
  const hasFooter = similar || shownTags.length > 0 || file.ext === 'gif';

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
            // Источник переноса приглушён: груз уехал под курсор (R07).
            'transition-opacity duration-[var(--dur-fast)] ease-out',
            carried && 'opacity-40',
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
              'relative h-full w-full overflow-clip rounded-card bg-raised',
              'transition-transform duration-[var(--dur-hover)] ease-out',
              'group-hover:scale-[var(--scale-card-hover)]',
              /* Корзина: карточки приглушены — R04, opacity 0.55 у каждой. */
              inTrash && 'opacity-55',
            )}
          >
            <Preview file={file} />

            {/*
              Низ карточки: «Похоже дубль» отдельной строкой над тегами, теги —
              светлыми чипами. Видны всегда, а не по наведению (G3F-0 · покой).
            */}
            {hasFooter ? (
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-start gap-1"
                style={{ padding: density.pad }}
              >
                {similar ? <Chip variant="solid">Похоже дубль</Chip> : null}
                <div className="flex max-w-full flex-wrap items-end gap-1">
                  {file.ext === 'gif' ? <Chip variant="light">gif</Chip> : null}
                  {shownTags.map((tag) => (
                    <Chip key={tag} variant="light" className="max-w-[120px]">
                      {tag}
                    </Chip>
                  ))}
                  {hiddenTags > 0 ? <Chip variant="light">+{hiddenTags}</Chip> : null}
                </div>
              </div>
            ) : null}

            {/*
              Левый верхний угол — один слот на двоих: в покое там имя папки,
              под курсором и у выбранной карточки его сменяет круглый чекбокс.
            */}
            <div
              className="pointer-events-none absolute"
              style={{ left: density.pad, top: density.pad }}
            >
              {showFolderChip ? (
                <Chip
                  variant="dark"
                  className={cn(
                    'transition-opacity duration-[var(--dur-fast)] ease-out',
                    selected ? 'opacity-0' : 'opacity-100 group-hover:opacity-0',
                  )}
                >
                  {folderName}
                </Chip>
              ) : null}
              <Checkbox
                checked={selected}
                onCheckedChange={() => onToggle(file)}
                label={selected ? 'Снять выделение' : 'Выделить'}
                className={cn(
                  'pointer-events-auto absolute top-0 left-0',
                  'transition-opacity duration-[var(--dur-fast)] ease-out',
                  selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
                )}
              />
            </div>

            {/*
              Кольцо выбранной карточки: обводка 3 px внутрь (в макете это
              `border`, а не внешняя тень) и пружина 380/32 на появлении.
            */}
            {selected ? (
              <motion.span
                aria-hidden
                initial={reduced ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 1.04 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={reduced ? { duration: 0 } : SPRING_PANEL}
                style={{ borderWidth: CARD_RING_WIDTH }}
                className="pointer-events-none absolute inset-0 rounded-card border-brand"
              />
            ) : null}

            {/*
              Битого файла в макете нет — оформляем тем же языком чипов:
              тёмный чип поверх превью, текст цветом ошибки (допущение).
            */}
            {file.isBroken ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <Chip variant="dark" className="text-danger">
                  битый файл
                </Chip>
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
            <ContextMenuItem hotkey={hotkeyLabel('⌘C')} onSelect={() => onCopy(file)}>
              Скопировать
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => onMoveToFolder(file)}>В папку…</ContextMenuItem>
            {/* «Добавить тег…» в макете R14 нет, но действие есть в коде — оставляем рядом с «В папку…». */}
            <ContextMenuItem onSelect={() => onAddTag(file)}>Добавить тег…</ContextMenuItem>
            <ContextMenuItem onSelect={() => onReveal(file)}>
              {platformStrings().revealMenuItem}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem danger hotkey="⌫" onSelect={() => onTrash(file)}>
              Удалить
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
});
