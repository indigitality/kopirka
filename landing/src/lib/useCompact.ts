/**
 * Узкий ли экран — до 900 px включительно. Та же граница, что у классов
 * `min-[901px]` в вёрстке: на ней блок «Пять способов» становится аккордеоном,
 * а первый экран отказывается от видеофона в пользу статичного.
 *
 * Слушатель нужен, а не одна проверка при монтировании: поворот телефона и
 * перетаскивание окна на десктопе меняют ответ, а от него зависит, рендерится
 * ли вообще тяжёлое (видео, снимки внутри шагов).
 */
import { useEffect, useState } from 'react';

export const COMPACT_QUERY = '(max-width: 900px)';

export function useCompact(): boolean {
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(COMPACT_QUERY).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(COMPACT_QUERY);
    const onChange = () => setCompact(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return compact;
}
