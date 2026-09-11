/**
 * FDB-08 — выделение рамкой по пустому месту сетки (D20 · `L54-0`, D21 · `LB5-0`).
 *
 * Рамка живёт в системе координат контейнера сетки — той же, в которой
 * `useMasonry` считает `layout.boxes`. Это важно: колонка контента прокручивается,
 * и координаты окна за время протяжки уезжают, а координаты контейнера — нет.
 * Точку начала запоминаем один раз, текущую пересчитываем из `clientX/clientY`
 * на каждый кадр по свежему `getBoundingClientRect()` контейнера.
 *
 * С переносом карточек (`dnd.ts`) рамка не спорит: та начинается с `pointerdown`
 * на самой карточке, а эта — только когда нажали ровно в контейнер
 * (`event.target === event.currentTarget`), то есть в просвет между карточками.
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { SCROLL_EDGE, SCROLL_STEP } from './dnd';
import type { MasonryBox } from './useMasonry';

/**
 * Порог начала протяжки. Меньше `DRAG_THRESHOLD` карточек (6) нарочно: рамка
 * начинается с пустого места, где промахнуться не обо что, а клик по пустому
 * месту обязан по-прежнему просто снимать выделение.
 */
export const MARQUEE_THRESHOLD = 5;

export interface MarqueeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MarqueeOptions {
  /** Прямоугольники карточек в координатах контейнера (`useMasonry`). */
  boxes: readonly MasonryBox[];
  /** Текущее выделение — к нему добавляет протяжка с Shift/⌘, им же чинит Esc. */
  getSelection: () => readonly number[];
  /** Выделение живьём во время протяжки. */
  onSelect: (ids: number[]) => void;
  /** Срез без выделения рамкой (корзина не исключение — там она тоже работает). */
  disabled?: boolean;
}

export interface Marquee {
  /** Прямоугольник для отрисовки, `null` — протяжки нет. */
  rect: MarqueeRect | null;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  /** Была ли протяжка: `click` сразу после неё не должен снимать выделение. */
  didDrag: () => boolean;
}

/**
 * Ближайший прокручиваемый предок. Автопрокрутка у краёв считается по нему, а не
 * по окну: сетка лежит внутри `<main>` области контента, и края у неё свои.
 */
function findScroller(node: HTMLElement): HTMLElement | null {
  for (let el = node.parentElement; el !== null; el = el.parentElement) {
    const overflowY = getComputedStyle(el).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') return el;
  }
  return null;
}

function intersects(rect: MarqueeRect, box: MasonryBox): boolean {
  return (
    rect.x < box.x + box.width &&
    rect.x + rect.width > box.x &&
    rect.y < box.y + box.height &&
    rect.y + rect.height > box.y
  );
}

export function useMarquee({ boxes, getSelection, onSelect, disabled }: MarqueeOptions): Marquee {
  const boxesRef = useRef(boxes);
  boxesRef.current = boxes;
  const getSelectionRef = useRef(getSelection);
  getSelectionRef.current = getSelection;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const [rect, setRect] = useState<MarqueeRect | null>(null);
  /** Дошла ли последняя протяжка до порога — читает `onClick` контейнера. */
  const draggedRef = useRef(false);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => () => stopRef.current?.(), []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (disabled === true || event.button !== 0 || event.pointerType === 'touch') return;
      // Рамку начинает только просвет между карточками, а не сама карточка.
      if (event.target !== event.currentTarget) return;

      stopRef.current?.();
      draggedRef.current = false;

      const container = event.currentTarget;
      const scroller = findScroller(container);
      const pointerId = event.pointerId;
      const originClientX = event.clientX;
      const originClientY = event.clientY;
      const containerBox = container.getBoundingClientRect();
      const startX = originClientX - containerBox.left;
      const startY = originClientY - containerBox.top;

      /* Shift и ⌘ добавляют к тому, что уже выбрано; без них рамка выделяет с нуля. */
      const additive = event.shiftKey || event.metaKey || event.ctrlKey;
      const before = [...getSelectionRef.current()];
      const base = additive ? before : [];

      let pointerX = originClientX;
      let pointerY = originClientY;
      let frame = 0;

      const update = () => {
        const box = container.getBoundingClientRect();
        const currentX = pointerX - box.left;
        const currentY = pointerY - box.top;
        const next: MarqueeRect = {
          x: Math.min(startX, currentX),
          y: Math.min(startY, currentY),
          width: Math.abs(currentX - startX),
          height: Math.abs(currentY - startY),
        };
        setRect(next);

        const hit = boxesRef.current.filter((item) => intersects(next, item)).map((item) => item.id);
        const merged = base.length === 0 ? hit : [...base, ...hit.filter((id) => !base.includes(id))];
        onSelectRef.current(merged);
      };

      /*
        Автопрокрутка у краёв — теми же порогами, что у переноса карточек
        (`SCROLL_EDGE` / `SCROLL_STEP` из `dnd.ts`): жест один и тот же по ощущению,
        и разъезжаться этим числам незачем.
      */
      const tick = () => {
        frame = 0;
        if (scroller !== null) {
          const box = scroller.getBoundingClientRect();
          let speed = 0;
          if (pointerY < box.top + SCROLL_EDGE) speed = -SCROLL_STEP;
          else if (pointerY > box.bottom - SCROLL_EDGE) speed = SCROLL_STEP;
          if (speed !== 0) {
            scroller.scrollTop += speed;
            update();
          }
        }
        frame = requestAnimationFrame(tick);
      };

      const stop = () => {
        stopRef.current = null;
        if (frame !== 0) cancelAnimationFrame(frame);
        frame = 0;
        window.removeEventListener('pointermove', onMove, true);
        window.removeEventListener('pointerup', onUp, true);
        window.removeEventListener('pointercancel', onCancel, true);
        window.removeEventListener('keydown', onKeyDown, true);
        try {
          if (container.hasPointerCapture(pointerId)) container.releasePointerCapture(pointerId);
        } catch {
          /* захвата не было — освобождать нечего */
        }
        setRect(null);
      };

      function onMove(move: PointerEvent): void {
        if (move.pointerId !== pointerId) return;
        pointerX = move.clientX;
        pointerY = move.clientY;
        if (!draggedRef.current) {
          if (Math.hypot(move.clientX - originClientX, move.clientY - originClientY) < MARQUEE_THRESHOLD) {
            return;
          }
          draggedRef.current = true;
          try {
            container.setPointerCapture(pointerId);
          } catch {
            /* указатель уже отпущен — протяжка доживёт на обычных событиях */
          }
          if (frame === 0) frame = requestAnimationFrame(tick);
        }
        update();
      }

      function onUp(up: PointerEvent): void {
        if (up.pointerId !== pointerId) return;
        stop();
      }

      function onCancel(cancel: PointerEvent): void {
        if (cancel.pointerId !== pointerId) return;
        onSelectRef.current(before);
        stop();
      }

      function onKeyDown(key: KeyboardEvent): void {
        if (key.key !== 'Escape') return;
        key.preventDefault();
        key.stopPropagation();
        // Отмена возвращает выделение ровно к тому, что было до нажатия.
        onSelectRef.current(before);
        draggedRef.current = true;
        stop();
      }

      stopRef.current = stop;
      window.addEventListener('pointermove', onMove, true);
      window.addEventListener('pointerup', onUp, true);
      window.addEventListener('pointercancel', onCancel, true);
      window.addEventListener('keydown', onKeyDown, true);
    },
    [disabled],
  );

  const didDrag = useCallback(() => draggedRef.current, []);

  return { rect, onPointerDown, didDrag };
}
