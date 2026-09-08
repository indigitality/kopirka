/**
 * «Пять способов сохранить. Ни одного лишнего клика» — секция HDP-0.
 *
 * // Расхождение с макетом: в макете это пять отдельных рядов «текст ↔
 * // иллюстрация» с чередованием сторон (HJX-0 … HZD-0). Здесь — один блок
 * // вертикальных вкладок слева и медиа справа: состав, номера, заголовки и
 * // описания взяты из тех же рядов один в один, меняется только раскладка
 * // (так задано постановкой задачи; экономит 2000 px высоты и даёт место
 * // будущим записям экрана).
 *
 * Поведение вкладок на широком экране (от 901 px):
 *   • под активной — лоадер 2 px лаймом, заполняется линейно за 7 с;
 *   • дошёл до конца — переход к следующей, по кругу;
 *   • курсор над блоком — лоадер стоит; блок вне экрана — тоже стоит;
 *   • клик по вкладке активирует её и сбрасывает лоадер;
 *   • стрелки ↑↓ переключают вкладки с клавиатуры.
 *
 * На узком (до 900 px) — аккордеон: снимок лежит внутри раскрытого шага, а не
 * в общей панели сверху, и вкладки сами не переключаются. Правка Сергея
 * 08.09.2026: в мобильной раскладке общая панель уезжала за верх экрана, и с
 * последних шагов снимок было физически не видно; а на тач-экране лоадер
 * нечем поставить на паузу — страница прыгала бы под пальцем.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { MediaSlot, type Media } from './MediaSlot';
import { Reveal } from './Reveal';
import { DUR_SLOW, EASE_OUT } from '@/lib/motion';
import { useCompact } from '@/lib/useCompact';
import { useInView } from '@/lib/useInView';
import { useReducedMotion } from '@/lib/useReducedMotion';

/** Сколько держится одна вкладка, мс. */
const DURATION_MS = 7000;

interface Way {
  id: string;
  num: string;
  title: string;
  text: string;
  media: Media;
  alt: string;
}

const WAYS: Way[] = [
  {
    id: 'menubar',
    num: '01',
    title: 'Из строки меню macOS',
    text: 'Хоткей ⌥⌘C в любом приложении: выделяете область экрана — и файл уже в библиотеке. Нужно разрешение на запись экрана.',
    media: { kind: 'image', src: '/media/way-01-menubar.webp' },
    alt: 'Строка меню macOS с открытым меню Копирки: «Снять область», «Открыть Копирку», «Автоимпорт скриншотов»',
  },
  {
    id: 'extension',
    num: '02',
    title: 'Расширение Chrome',
    text: 'Снимайте видимую часть страницы или выделенную область одной кнопкой — прямо из панели браузера.',
    media: { kind: 'image', src: '/media/way-02-extension.webp' },
    alt: 'Поповер расширения Копирки в Chrome с кнопками «Снять область» и «Видимая часть»',
  },
  {
    id: 'context',
    num: '03',
    title: 'Правый клик по картинке',
    text: 'В контекстном меню браузера появляется пункт «Сохранить в Копирку». Картинка уходит в библиотеку одним движением.',
    media: { kind: 'image', src: '/media/way-03-context-menu.webp' },
    alt: 'Контекстное меню Chrome на картинке с подсвеченным пунктом «Сохранить в Копирку»',
  },
  {
    id: 'drop',
    num: '04',
    title: 'Перетаскивание',
    text: 'Файл из Finder или картинка из браузера — тащите прямо в окно Копирки. Отпустили — файл в нужной папке.',
    media: { kind: 'image', src: '/media/way-04-drop.webp' },
    alt: 'Окно Копирки с подсказкой «Отпустите, чтобы добавить в „Айдентика“»',
  },
  {
    id: 'paste',
    num: '05',
    title: 'Скопировал — вставил',
    text: '⌘V прямо в окно Копирки. Всё, что прилетело без папки, ждёт в «Не разобрано» — разберёте, когда будет время.',
    media: { kind: 'image', src: '/media/way-05-paste.webp' },
    alt: 'Раздел «Не разобрано» в Копирке с восемью только что вставленными файлами',
  },
];

export function FiveWays() {
  const reduced = useReducedMotion();
  const compact = useCompact();
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [blockRef, inView] = useInView<HTMLDivElement>({ threshold: 0.25 });

  const barRef = useRef<HTMLSpanElement>(null);
  const elapsedRef = useRef(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // На узком экране вкладки сами не листаются — только по нажатию.
  const running = inView && !hovered && !compact;

  /** Переход на вкладку с обнулением лоадера. */
  const goTo = useCallback((index: number) => {
    elapsedRef.current = 0;
    setActive(((index % WAYS.length) + WAYS.length) % WAYS.length);
  }, []);

  // Лоадер обнуляется до кадра, чтобы полоса не мигала полной шириной.
  useLayoutEffect(() => {
    elapsedRef.current = 0;
    if (barRef.current) barRef.current.style.transform = 'scaleX(0)';
  }, [active]);

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    /*
      Отсчёт стартует не от `performance.now()`, а от первого тика: время кадра
      в rAF берётся с другого источника и бывает МЕНЬШЕ снятого только что
      `performance.now()`. Тогда первая дельта отрицательна, `elapsedRef` уходит
      в минус, и полоса на кадр получает `scaleX(-0.24)` — зеркалится вправо.
      Поэтому `last` заполняется в первом тике, дельта клампится снизу нулём,
      и сам прогресс тоже не может стать меньше нуля.
    */
    let last: number | null = null;

    const tick = (now: number) => {
      last ??= now;
      elapsedRef.current += Math.max(0, now - last);
      last = now;
      const progress = Math.min(1, Math.max(0, elapsedRef.current / DURATION_MS));
      if (barRef.current) barRef.current.style.transform = `scaleX(${progress})`;
      if (progress >= 1) {
        elapsedRef.current = 0;
        setActive((current) => (current + 1) % WAYS.length);
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, active]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const map: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    const step = map[event.key];
    if (step === undefined) {
      if (event.key === 'Home') {
        event.preventDefault();
        goTo(0);
        tabRefs.current[0]?.focus();
      } else if (event.key === 'End') {
        event.preventDefault();
        goTo(WAYS.length - 1);
        tabRefs.current[WAYS.length - 1]?.focus();
      }
      return;
    }
    event.preventDefault();
    const next = (active + step + WAYS.length) % WAYS.length;
    goTo(next);
    tabRefs.current[next]?.focus();
  };

  const current = WAYS[active] ?? WAYS[0]!;

  return (
    <section id="features" className="mx-auto max-w-[1200px] px-6 pb-[140px] md:px-10 xl:px-0">
      <Reveal>
        <p className="eyebrow m-0">Возможности · Захват</p>
      </Reveal>
      <Reveal index={1}>
        <h2
          className="mt-6 mb-0 font-medium text-display"
          style={{ fontSize: 'clamp(30px, 4.17vw, 60px)', lineHeight: 1, letterSpacing: '-0.03em' }}
        >
          Пять способов сохранить.
          <span className="block text-faint">Ни одного лишнего клика</span>
        </h2>
      </Reveal>

      <div
        ref={blockRef}
        id="way-block"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="mt-12 flex flex-col-reverse gap-10 min-[901px]:mt-16 min-[901px]:flex-row min-[901px]:items-start min-[901px]:gap-[60px]"
      >
        <div
          role={compact ? undefined : 'tablist'}
          aria-orientation={compact ? undefined : 'vertical'}
          aria-label="Способы сохранить"
          onKeyDown={compact ? undefined : onKeyDown}
          className="flex w-full flex-col min-[901px]:w-[420px] min-[901px]:shrink-0"
        >
          {WAYS.map((way, index) => {
            const isActive = index === active;
            return (
              <div key={way.id} className="relative">
                <button
                  ref={(node) => {
                    tabRefs.current[index] = node;
                  }}
                  type="button"
                  role={compact ? undefined : 'tab'}
                  id={`way-tab-${way.id}`}
                  aria-selected={compact ? undefined : isActive}
                  aria-expanded={compact ? isActive : undefined}
                  aria-controls={compact ? `way-media-${way.id}` : 'way-panel'}
                  tabIndex={compact ? undefined : isActive ? 0 : -1}
                  onClick={() => goTo(index)}
                  className="relative w-full cursor-pointer appearance-none border-0 bg-transparent px-0 pt-6 pb-6 text-left"
                >
                  <span
                    className="eyebrow block transition-colors duration-[200ms]"
                    style={{ color: isActive ? 'var(--color-brand)' : undefined }}
                  >
                    {way.num}
                  </span>
                  <span
                    className="mt-3 block font-medium transition-colors duration-[200ms]"
                    style={{
                      fontSize: 'clamp(22px, 1.6vw, 26px)',
                      lineHeight: 1.15,
                      letterSpacing: '-0.02em',
                      color: isActive ? 'var(--color-display)' : 'var(--color-body)',
                    }}
                  >
                    {way.title}
                  </span>

                  <AnimatePresence initial={false}>
                    {isActive ? (
                      <motion.span
                        key="text"
                        className="block overflow-hidden"
                        initial={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
                        animate={reduced ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
                        exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
                        transition={{ duration: DUR_SLOW, ease: EASE_OUT }}
                      >
                        <span
                          className="block pt-3 text-body"
                          style={{ fontSize: 17, lineHeight: '25px' }}
                        >
                          {way.text}
                        </span>
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                </button>

                {/*
                  Снимок шага. На узком экране он живёт здесь, под своим
                  заголовком, — снаружи кнопки, потому что внутри `button`
                  разметке не место. На широком снимок показывает общая панель
                  справа, и этот блок не рендерится вовсе.
                */}
                {compact && (
                  <AnimatePresence initial={false}>
                    {isActive ? (
                      <motion.div
                        key="media"
                        id={`way-media-${way.id}`}
                        role="region"
                        aria-labelledby={`way-tab-${way.id}`}
                        className="overflow-hidden"
                        initial={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
                        animate={reduced ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
                        exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
                        transition={{ duration: DUR_SLOW, ease: EASE_OUT }}
                      >
                        <div className="pb-7">
                          <MediaSlot media={way.media} slotKey={way.id} alt={way.alt} />
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                )}

                {/* Лоадер: 2 px лаймом на подложке-разделителе. */}
                <span
                  aria-hidden
                  className="absolute inset-x-0 bottom-0 block h-[2px]"
                  style={{ background: 'var(--color-line-strong)' }}
                >
                  {isActive && !compact ? (
                    <span
                      ref={barRef}
                      data-loader-bar=""
                      className="block h-full origin-left bg-brand"
                      style={{ transform: 'scaleX(0)' }}
                    />
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>

        {!compact && (
          <div
            id="way-panel"
            role="tabpanel"
            aria-labelledby={`way-tab-${current.id}`}
            className="w-full min-w-0 min-[901px]:flex-1"
          >
            <MediaSlot media={current.media} slotKey={current.id} alt={current.alt} />
          </div>
        )}
      </div>

      <Reveal>
        <div className="mt-16 flex flex-col gap-6 min-[901px]:flex-row min-[901px]:gap-6">
          <p className="eyebrow m-0 min-[901px]:w-[420px] min-[901px]:shrink-0">плюс</p>
          <p className="m-0 max-w-[600px] text-body" style={{ fontSize: 18, lineHeight: '25px' }}>
            Автоимпорт: папку скриншотов macOS Копирка подхватывает сама — снятое горячей клавишей
            системы попадает в библиотеку без вашего участия.
          </p>
        </div>
      </Reveal>
    </section>
  );
}
