/**
 * CAP-03 — перетаскивание файлов из Finder в окно.
 * Рамка рисуется поверх видимой части области контента: оверлей `fixed`,
 * координаты берём у скролл-контейнера, иначе на прокрутке рамка уезжает за экран.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ImageDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { EASE_OUT, DUR_FAST } from '@/lib/motion';
import { hasExternalFiles } from '@/features/grid/dnd';
import { useImport } from './ImportProvider';

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function DropZone({ children, className }: { children: ReactNode; className?: string }) {
  const { importFromTransfer } = useImport();
  const rootRef = useRef<HTMLDivElement>(null);
  const depth = useRef(0);
  const [rect, setRect] = useState<Rect | null>(null);

  // Файл, отпущенный мимо зоны, браузер открыл бы вместо импорта.
  useEffect(() => {
    const swallow = (event: DragEvent) => {
      if (hasExternalFiles(event)) event.preventDefault();
    };
    window.addEventListener('dragover', swallow);
    window.addEventListener('drop', swallow);
    return () => {
      window.removeEventListener('dragover', swallow);
      window.removeEventListener('drop', swallow);
    };
  }, []);

  const measure = useCallback(() => {
    const box = (rootRef.current?.parentElement ?? rootRef.current)?.getBoundingClientRect();
    if (!box) return;
    setRect({ top: box.top, left: box.left, width: box.width, height: box.height });
  }, []);

  const reset = useCallback(() => {
    depth.current = 0;
    setRect(null);
  }, []);

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
            className="pointer-events-none fixed z-40 flex items-center justify-center p-3"
          >
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-accent bg-accent-soft/70 backdrop-blur-[2px]">
              <ImageDown className="size-6 text-accent" strokeWidth={1.75} aria-hidden />
              <span className="text-md font-medium text-ink">Отпустите — добавим в библиотеку</span>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
