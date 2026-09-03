/**
 * CAP-03 — перетаскивание файлов из Finder в окно.
 *
 * Оформление — R08: панель контента получает пунктирную лаймовую рамку 2 px
 * (радиус панели), а по центру появляется стеклянная подсказка «Отпустите, чтобы
 * добавить в «Папку»». Скрима, который раньше гасил сетку, в редизайне нет.
 *
 * Рамка рисуется не в потоке сетки, а порталом в `#kopirka-content` — это сама
 * панель: иначе на прокрутке рамка уезжала бы вместе с карточками, а высоту брала
 * бы по содержимому, а не по панели.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ImagePlus } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Icon } from '@/lib/icons';
import { EASE_OUT, DUR_FAST } from '@/lib/motion';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { glassLayerMotion } from '@/components/ui/motion-presets';
import { hasExternalFiles, trackExternalFiles } from '@/features/grid/dnd';
import { useLibrary } from '@/features/library/LibraryProvider';
import { useViewSelector } from '@/store/view';
import { useImport } from './ImportProvider';

export function DropZone({ children, className }: { children: ReactNode; className?: string }) {
  const { importFromTransfer } = useImport();
  const { folderNameById } = useLibrary();
  const scope = useViewSelector((s) => s.scope);
  const folderId = useViewSelector((s) => s.folderId);
  const rootRef = useRef<HTMLDivElement>(null);
  const depth = useRef(0);
  const [active, setActive] = useState(false);
  const reduced = useReducedMotion();

  // Файл, отпущенный мимо зоны, браузер открыл бы вместо импорта.
  // Тот же слушатель держит подсказки целей в сайдбаре — 02 §4.4.
  useEffect(() => trackExternalFiles(), []);

  /* Панель контента — цель для рамки. Вне оболочки (витрина, тесты) её нет. */
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setPanel(document.getElementById('kopirka-content'));
  }, []);

  const reset = useCallback(() => {
    depth.current = 0;
    setActive(false);
  }, []);

  // Файлы падают туда же, куда смотрит сетка: имя папки называем прямо в надписи.
  const folderName =
    scope === 'library' && folderId !== null ? (folderNameById.get(folderId) ?? null) : null;

  /*
    Рамка и подсказка. Рамка повторяет геометрию панели контента: 2 px пунктиром
    внутрь (`border-box`), радиус панели. Подсказка — то же стекло, что у панели
    выделения: высота 44, поля 18, зазор 10, иконка лаймом.
  */
  const overlay = (
    <AnimatePresence>
      {active ? (
        <motion.div
          key="drop-frame"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: DUR_FAST, ease: EASE_OUT }}
          className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center rounded-panel border-2 border-dashed border-brand"
        >
          <motion.div
            {...glassLayerMotion({ from: 'bottom', reduced })}
            className="glass flex h-[var(--size-bar)] items-center gap-2.5 rounded-card px-4.5 shadow-glass"
          >
            <Icon icon={ImagePlus} size={16} className="text-brand" aria-hidden />
            <span className="text-md leading-[18px] font-medium whitespace-nowrap text-ink">
              {folderName
                ? `Отпустите, чтобы добавить в «${folderName}»`
                : 'Отпустите, чтобы добавить в библиотеку'}
            </span>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  return (
    <div
      ref={rootRef}
      className={cn('relative', className)}
      onDragEnter={(event) => {
        if (!hasExternalFiles(event)) return;
        depth.current += 1;
        setActive(true);
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

      {/* Внутри оболочки рамка живёт на панели, вне её (витрина, тесты) — на месте. */}
      {panel === null ? overlay : createPortal(overlay, panel)}
    </div>
  );
}
