/**
 * «Блок на экране» через IntersectionObserver.
 *
 * Нужен двум разным вещам, поэтому вынесен отдельно от `whileInView` из motion:
 *   • вкладкам «Пять способов» — таймер лоадера стоит, пока блок вне экрана;
 *   • тяжёлому фону первого экрана — шейдер грузится только когда виден.
 */
import { useEffect, useRef, useState } from 'react';

export interface InViewOptions {
  /** Доля блока, при которой он считается видимым. */
  threshold?: number;
  /** Один раз: после первого попадания наблюдатель отключается. */
  once?: boolean;
  /** Поле вокруг области наблюдения, как у IntersectionObserver. */
  rootMargin?: string;
}

export function useInView<T extends HTMLElement>({
  threshold = 0.2,
  once = false,
  rootMargin = '0px',
}: InViewOptions = {}): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    // Без IntersectionObserver считаем блок видимым: лучше показать, чем спрятать.
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        setInView(entry.isIntersecting);
        if (entry.isIntersecting && once) observer.disconnect();
      },
      { threshold, rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold, once, rootMargin]);

  return [ref, inView];
}
