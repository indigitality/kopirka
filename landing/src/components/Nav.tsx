/**
 * Липкая навигация.
 *
 * Макет (H0I-0): логотип · три якоря · две кнопки-пилюли справа.
 * Отличия — все по прямому указанию:
 *   • логотип настоящий (правка Сергея), а не лаймовый квадрат 22×22;
 *   • он же 28 px, а не 22: на 22 знак терялся в строке (правка Сергея
 *     08.09.2026, тогда же подрос логотип в подвале);
 *   • кнопка одна, 32 px и радиуса 8 (правка Сергея про размеры и пилюли).
 *
 * // Расхождение с макетом: якорей четыре, а не три — «Возможности · Порядок ·
 * // Скачать · Поддержать». Секций на странице пять, и «Порядок» в макете
 * // никуда не вело; состав задан постановкой задачи.
 *
 * Фон появляется только после прокрутки > 24 px: на первом экране навигация
 * висит без плашки и не спорит с заголовком. Плашка — `.glass`: тот же цвет,
 * что у холста, на 72 % и с размытием, без нижнего края.
 */
import { useEffect, useState } from 'react';
import { Logo } from './Logo';
import { Button } from './Button';

const ANCHORS = [
  { href: '#features', label: 'Возможности' },
  { href: '#order', label: 'Порядок' },
  { href: '#download', label: 'Скачать' },
  { href: '#donate', label: 'Поддержать' },
] as const;

/** Порог, после которого под навигацией появляется стекло, px. */
const SCROLL_THRESHOLD = 24;

export function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > SCROLL_THRESHOLD);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={[
        'fixed inset-x-0 top-0 z-50 transition-[background-color,backdrop-filter]',
        'duration-[200ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
        scrolled ? 'glass' : 'bg-transparent',
      ].join(' ')}
    >
      <nav className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-6 md:px-10 xl:px-0">
        <a href="#top" className="flex items-center no-underline" aria-label="Копирка — наверх">
          <Logo size={28} />
        </a>

        <div className="hidden items-center gap-7 lg:flex">
          {ANCHORS.map((a) => (
            <a
              key={a.href}
              href={a.href}
              className="text-[15px] leading-[18px] text-body no-underline transition-colors duration-[120ms] hover:text-display"
            >
              {a.label}
            </a>
          ))}
        </div>

        <Button href="#download" size="nav" variant="primary">
          Скачать
        </Button>
      </nav>
    </header>
  );
}
