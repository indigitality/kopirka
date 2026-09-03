/** Метрики сетки берём из токенов, а не из чисел в коде. */
import { useEffect, useMemo, useState } from 'react';
import type { GridSize } from '@/store/view';

export interface GridMetrics {
  /** Целевая ширина колонки для выбранного размера. */
  columnWidth: number;
  gap: number;
  pad: number;
  /** Зазор «заголовок контента → первая карточка» (R02): меньше бокового поля. */
  headerGap: number;
  /** Клемп снизу: сколько колонок держим, даже если целевая ширина не помещается. */
  minColumns: number;
}

/** Токен целевой ширины по размеру карточки — решение D5. */
const TOKEN: Record<GridSize, string> = {
  l: '--grid-col-l',
  m: '--grid-col-m',
  s: '--grid-col-s',
};

const FALLBACK_COLUMN: Record<GridSize, number> = { l: 560, m: 274, s: 180 };

/**
 * Без клемпа на 900 px «большой» и «средний» дают одинаковые две колонки,
 * и переключатель выглядит сломанным (дизайн-аудит §3.4).
 */
export const MIN_COLUMNS: Record<GridSize, number> = { l: 2, m: 3, s: 4 };

/* Запасные значения повторяют токены редизайна: поле блока сетки 16 (R01 · «Блок сетки»). */
const FALLBACK = { gap: 14, pad: 16, headerGap: 12 };

function readPx(name: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

interface Tokens {
  columns: Record<GridSize, number>;
  gap: number;
  pad: number;
  headerGap: number;
}

const FALLBACK_TOKENS: Tokens = {
  columns: FALLBACK_COLUMN,
  gap: FALLBACK.gap,
  pad: FALLBACK.pad,
  headerGap: FALLBACK.headerGap,
};

/** Значения читаются один раз после монтирования: шрифты и токены к этому моменту применены. */
export function useGridMetrics(size: GridSize): GridMetrics {
  const [tokens, setTokens] = useState<Tokens>(FALLBACK_TOKENS);

  useEffect(() => {
    setTokens({
      columns: {
        l: readPx(TOKEN.l, FALLBACK_COLUMN.l),
        m: readPx(TOKEN.m, FALLBACK_COLUMN.m),
        s: readPx(TOKEN.s, FALLBACK_COLUMN.s),
      },
      gap: readPx('--grid-gap', FALLBACK.gap),
      pad: readPx('--grid-pad', FALLBACK.pad),
      headerGap: readPx('--grid-header-gap', FALLBACK.headerGap),
    });
  }, []);

  return useMemo(
    () => ({
      columnWidth: tokens.columns[size],
      gap: tokens.gap,
      pad: tokens.pad,
      headerGap: tokens.headerGap,
      minColumns: MIN_COLUMNS[size],
    }),
    [tokens, size],
  );
}
