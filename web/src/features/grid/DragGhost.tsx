/**
 * Призрак переноса — картинка «сжимается в файл» под курсором.
 * Живёт порталом в `body`: карточка лежит в скроллящейся сетке, а призрак должен
 * висеть над всем интерфейсом, включая сайдбар.
 *
 * Позицию пишем прямо в стиль, минуя React: за курсором надо успевать каждый кадр,
 * а перерисовывать дерево на каждое движение мыши незачем.
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import { Shapes } from 'lucide-react';
import { EASE_OUT, DUR_FAST } from '@/lib/motion';
import { fileDrag, useFileDragSnapshot } from './dnd';

/** Сторона превью в стопке. */
const TILE = 64;
/** Разворот карточек стопки: верхняя ровно, две нижние — веером. */
const ANGLES = [0, -6, 6];

export function DragGhost() {
  const { dragging, previews, ids } = useFileDragSnapshot();
  const boxRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useLayoutEffect(() => {
    if (!dragging) return;
    const node = boxRef.current;
    if (!node) return;

    const place = (x: number, y: number) => {
      node.style.transform = `translate3d(${x - TILE / 2}px, ${y - TILE / 2}px, 0)`;
    };
    const start = fileDrag.position();
    place(start.x, start.y);
    return fileDrag.subscribePosition(place);
  }, [dragging]);

  // Курсор ушёл за пределы окна и кнопку отпустили снаружи — переноса больше нет.
  useEffect(() => {
    if (!dragging) return;
    const onBlur = () => fileDrag.cancel();
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, [dragging]);

  if (!dragging || previews.length === 0) return null;

  return createPortal(
    <div
      ref={boxRef}
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 z-[120] will-change-transform"
      style={{ width: TILE, height: TILE }}
    >
      <motion.div
        initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
        animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1 }}
        transition={{ duration: DUR_FAST, ease: EASE_OUT }}
        className="relative h-full w-full"
      >
        {previews.map((preview, index) => (
          <div
            key={preview.id}
            className="absolute inset-0 overflow-hidden rounded-sm bg-surface-raised shadow-float"
            style={{
              zIndex: previews.length - index,
              transform: `rotate(${ANGLES[index] ?? 0}deg) translate(${index * 2}px, ${index * 2}px)`,
            }}
          >
            {preview.src ? (
              <img src={preview.src} alt="" draggable={false} className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-ink-faint">
                <Shapes className="size-5" strokeWidth={1.5} aria-hidden />
              </span>
            )}
          </div>
        ))}

        {ids.length > 1 ? (
          <span
            className="absolute -top-2 -right-2 z-10 flex h-4 min-w-4 items-center justify-center rounded-pill bg-accent px-1 font-mono text-2xs leading-none text-accent-ink tabular-nums"
            style={{ zIndex: previews.length + 1 }}
          >
            {ids.length}
          </span>
        ) : null}
      </motion.div>
    </div>,
    document.body,
  );
}
