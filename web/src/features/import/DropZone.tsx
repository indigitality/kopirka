/**
 * CAP-03 — перетаскивание файлов из Finder в окно.
 * Рамка рисуется поверх видимой части области контента: оверлей `fixed`,
 * координаты берём у скролл-контейнера, иначе на прокрутке рамка уезжает за экран.
 *
 * Оформление — 02 §4.16: скрим гасит сетку, чтобы надпись читалась поверх любых
 * картинок; раньше подложка была мятной и полупрозрачной, и превью просвечивали.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ImagePlus } from 'lucide-react';
import { cn } from '@/lib/cn';
import { EASE_OUT, DUR_FAST } from '@/lib/motion';
import { hasExternalFiles, trackExternalFiles } from '@/features/grid/dnd';
import { useLibrary } from '@/features/library/LibraryProvider';
import { useViewSelector } from '@/store/view';
import { useImport } from './ImportProvider';

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function DropZone({ children, className }: { children: ReactNode; className?: string }) {
  const { importFromTransfer } = useImport();
  const { folderNameById } = useLibrary();
  const scope = useViewSelector((s) => s.scope);
  const folderId = useViewSelector((s) => s.folderId);
  const rootRef = useRef<HTMLDivElement>(null);
  const depth = useRef(0);
  const [rect, setRect] = useState<Rect | null>(null);

  // Файл, отпущенный мимо зоны, браузер открыл бы вместо импорта.
  // Тот же слушатель держит подсказки целей в сайдбаре — 02 §4.4.
  useEffect(() => trackExternalFiles(), []);

  const measure = useCallback(() => {
    const box = (rootRef.current?.parentElement ?? rootRef.current)?.getBoundingClientRect();
    if (!box) return;
    setRect({ top: box.top, left: box.left, width: box.width, height: box.height });
  }, []);

  const reset = useCallback(() => {
    depth.current = 0;
    setRect(null);
  }, []);

  // Файлы падают туда же, куда смотрит сетка: имя папки называем прямо в надписи.
  const folderName =
    scope === 'library' && folderId !== null ? (folderNameById.get(folderId) ?? null) : null;

  return (
    <div
      ref={rootRef}
      className={cn('relative', className)}
      onDragEnter={(event) => {
        if (!hasExternalFiles(event)) return;
        depth.current += 1;
        measure();
      }}
      onDragOver={(event) => {
        if (!hasExternalFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={(event) => {
        if (!hasExternalFiles(event)) return;
        depth.current -= 1;
        if (depth.current <= 0) reset();
      }}
      onDrop={(event) => {
        if (!hasExternalFiles(event)) return;
        event.preventDefault();
        reset();
        importFromTransfer(event.dataTransfer, 'drag_drop');
      }}
    >
      {children}

      <AnimatePresence>
        {rect ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DUR_FAST, ease: EASE_OUT }}
            style={rect}
            className="pointer-events-none fixed z-40 flex items-center justify-center bg-[rgb(0_0_0/0.6)] p-3 backdrop-blur-[4px]"
          >
            <div className="flex h-full w-full items-center justify-center rounded-xl border-2 border-dashed border-accent">
              <div className="flex flex-col items-center gap-3 rounded-md bg-surface-overlay px-5 py-4 shadow-float">
                <ImagePlus className="size-6 text-accent" strokeWidth={1.75} aria-hidden />
                <span className="text-md font-medium text-ink">
                  {folderName
                    ? `Отпустите, чтобы добавить в «${folderName}»`
                    : 'Отпустите, чтобы добавить в библиотеку'}
                </span>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
