/**
 * Раскладка masonry по колонкам. CSS `columns` не годится: он заполняет колонки
 * сверху вниз, а карточки должны идти в порядке добавления слева направо.
 *
 * Пропорции всех карточек известны заранее (width/height приходят с сервера),
 * поэтому позиции считаются до загрузки картинок — раскладка не прыгает.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface MasonryInput {
  id: number;
  /** height / width. */
  ratio: number;
}

export interface MasonryBox {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MasonryOptions {
  /** Целевая ширина колонки — `--grid-col-m`. */
  columnWidth: number;
  gap: number;
  pad: number;
}

export interface MasonryLayout {
  boxes: readonly MasonryBox[];
  /** Высота полотна вместе с нижним отступом. */
  height: number;
  columnCount: number;
  columnWidth: number;
  /** Ширину контейнера ещё не измерили — рисовать рано. */
  measured: boolean;
}

function layout(items: readonly MasonryInput[], width: number, options: MasonryOptions): MasonryLayout {
  const { columnWidth: target, gap, pad } = options;
  const available = Math.max(0, width - pad * 2);
  // Округляем, а не отбрасываем: колонка может быть чуть уже целевой, зато её ширина
  // остаётся близкой к --grid-col-m. При floor последняя колонка раздувалась бы на треть.
  const columnCount = Math.max(1, Math.round(available / (target + gap)));
  const actualWidth = (available - gap * (columnCount - 1)) / columnCount;

  const heights = new Array<number>(columnCount).fill(0);
  const boxes: MasonryBox[] = [];

  for (const item of items) {
    // Из равных по высоте колонок берём самую левую — так порядок остаётся читаемым слева направо.
    let column = 0;
    for (let i = 1; i < columnCount; i += 1) {
      if ((heights[i] ?? 0) < (heights[column] ?? 0) - 0.5) column = i;
    }
    const height = Math.max(80, Math.round(actualWidth * item.ratio));
    boxes.push({
      id: item.id,
      x: pad + column * (actualWidth + gap),
      y: pad + (heights[column] ?? 0),
      width: actualWidth,
      height,
    });
    heights[column] = (heights[column] ?? 0) + height + gap;
  }

  const tallest = heights.reduce((max, value) => Math.max(max, value), 0);
  return {
    boxes,
    height: boxes.length === 0 ? 0 : pad * 2 + Math.max(0, tallest - gap),
    columnCount,
    columnWidth: actualWidth,
    measured: width > 0,
  };
}

const EMPTY: MasonryLayout = {
  boxes: [],
  height: 0,
  columnCount: 1,
  columnWidth: 0,
  measured: false,
};

/**
 * Возвращает ref на контейнер и посчитанную раскладку.
 * Замеры коалесцируются через requestAnimationFrame — на resize пересчёт идёт
 * не чаще кадра, поэтому сетка не дёргается.
 */
export function useMasonry(items: readonly MasonryInput[], options: MasonryOptions): {
  ref: (node: HTMLElement | null) => void;
  layout: MasonryLayout;
} {
  const [width, setWidth] = useState(0);
  const nodeRef = useRef<HTMLElement | null>(null);
  const frameRef = useRef(0);
  const observerRef = useRef<ResizeObserver | null>(null);

  const measure = useCallback(() => {
    const node = nodeRef.current;
    if (!node) return;
    const next = node.clientWidth;
    setWidth((prev) => (Math.abs(prev - next) < 1 ? prev : next));
  }, []);

  const ref = useCallback(
    (node: HTMLElement | null) => {
      observerRef.current?.disconnect();
      nodeRef.current = node;
      if (!node) return;
      const observer = new ResizeObserver(() => {
        if (frameRef.current !== 0) return;
        frameRef.current = window.requestAnimationFrame(() => {
          frameRef.current = 0;
          measure();
        });
      });
      observer.observe(node);
      observerRef.current = observer;
      measure();
    },
    [measure],
  );

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(
    () => () => {
      observerRef.current?.disconnect();
      if (frameRef.current !== 0) window.cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  return { ref, layout: width === 0 ? EMPTY : layout(items, width, options) };
}
