/** Метрики сетки берём из токенов, а не из чисел в коде. */
import { useEffect, useState } from 'react';

export interface GridMetrics {
  columnWidth: number;
  gap: number;
  pad: number;
}

const FALLBACK: GridMetrics = { columnWidth: 275, gap: 14, pad: 30 };

function readPx(name: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Значения читаются один раз после монтирования: шрифты и токены к этому моменту применены. */
export function useGridMetrics(): GridMetrics {
  const [metrics, setMetrics] = useState<GridMetrics>(FALLBACK);
  useEffect(() => {
    setMetrics({
      columnWidth: readPx('--grid-col-m', FALLBACK.columnWidth),
      gap: readPx('--grid-gap', FALLBACK.gap),
      pad: readPx('--grid-pad', FALLBACK.pad),
    });
  }, []);
  return metrics;
}
