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
import { cn } from '@/lib/cn';
import { Icon } from '@/lib/icons';
import { EASE_OUT, DUR_FAST } from '@/lib/motion';
import { fileDrag, useFileDragSnapshot } from './dnd';

/**
 * Стопка призрака — R07: два прямоугольника 76 × 64 с радиусом `--radius-md`,
 * верхний развёрнут на −6°, нижний на +4° и сдвинут на 8 / 6 вправо и вниз.
 * Третья карточка в макете не нарисована — продолжаем веер тем же шагом.
 */
const TILE_W = 76;
const TILE_H = 64;
const ANGLES = [-6, 4, 10];
const STEP_X = 8;
const STEP_Y = 6;

/** Бейдж-счётчик стоит на верхнем правом углу верхней карточки (координаты R07). */
const BADGE_TOP = -18;
const BADGE_RIGHT = -10;

export function DragGhost() {
  const { dragging, previews, ids } = useFileDragSnapshot();
  const boxRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useLayoutEffect(() => {
    if (!dragging) return;
    const node = boxRef.current;
    if (!node) return;

    const place = (x: number, y: number) => {
      node.style.transform = `translate3d(${x - TILE_W / 2}px, ${y - TILE_H / 2}px, 0)`;
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
      style={{ width: TILE_W, height: TILE_H }}
    >
      <motion.div
        initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
        animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1 }}
        transition={{ duration: DUR_FAST, ease: EASE_OUT }}
        className="relative h-full w-full"
      >
        {/* Верхняя карточка (index 0) лежит выше всех, нижние уходят веером вправо-вниз. */}
        {previews.map((preview, index) => (
          <div
            key={preview.id}
            className={cn(
              'absolute inset-0 overflow-clip rounded-md bg-raised',
              index === 0 ? 'shadow-ghost' : 'shadow-ghost-under',
            )}
            style={{
              zIndex: previews.length - index,
              transform: `translate(${index * STEP_X}px, ${index * STEP_Y}px) rotate(${ANGLES[index] ?? 0}deg)`,
            }}
          >
            {preview.src ? (
              <img src={preview.src} alt="" draggable={false} className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-ink-faint">
                <Icon icon={Shapes} size={20} aria-hidden />
              </span>
            )}
          </div>
        ))}

        {ids.length > 1 ? (
          <span
            className="absolute flex size-5 items-center justify-center rounded-pill bg-brand text-2xs leading-3 font-medium text-brand-ink tabular-nums"
            style={{ top: BADGE_TOP, right: BADGE_RIGHT, zIndex: previews.length + 1 }}
          >
            {ids.length}
          </span>
        ) : null}
      </motion.div>
    </div>,
    document.body,
  );
}
