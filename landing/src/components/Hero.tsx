/**
 * Первый экран. Макет — H1R-0 (текст H1S-0 + снимок H81-0).
 *
 * За текстом — видеофон на высоту первого экрана, под текстом снимок
 * приложения с наклоном rotateX(8deg), который выравнивается по мере
 * прокрутки; под снимком лаймовое свечение и маска в холст. Видео гасится к
 * низу, и окно выезжает из темноты.
 *
 * Так решено 09.09.2026: до этого первый экран неделю жил в двух вариантах —
 * с видео и с прежним шейдерным фоном, — которые переключались адресом
 * `?hero=…`. Сергей выбрал видео, развилка и её переключатель удалены.
 * На узком экране видео по-прежнему не показывается — см. `HeroBackdrop`.
 *
 * Заголовок появляется по словам: blur 8 → 0, y 12 → 0, пружина 380/32,
 * задержка 40 мс на слово, один раз при загрузке.
 *
 * // Расхождение с макетом: кнопки 40 px и радиуса 8 вместо пилюль 44–48 —
 * // правка Сергея. Версия 0.2.0 и «Apple Silicon и Intel» вместо
 * // «v0.1.0 · Apple Silicon · система определяется автоматически»: обе сборки
 * // существуют (wiki/RELEASE.md), а чип браузер не сообщает.
 *
 * С 09.09.2026 сборок две, и первый экран говорит на языке системы гостя
 * (`usePlatform`): подпись главной кнопки, требования под ней и хоткей вставки
 * в лиде. Гость с неопознанной системой видит нейтральное «Скачать» и
 * требования обеих систем — на телефоне обещать ему macOS незачем.
 */
import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import { Github } from 'lucide-react';
import { Button } from './Button';
import { HeroBackdrop } from './HeroBackdrop';
import { PLATFORMS, RELEASE } from '@/links';
import { GITHUB, GITHUB_PUBLIC } from '@/links';
import { usePlatform, type Platform } from '@/platform';
import { BLUR_ENTER, REVEAL_SHIFT, SPRING_PANEL, WORD_STAGGER } from '@/lib/motion';
import { useReducedMotion } from '@/lib/useReducedMotion';

const HEADLINE_LINES = ['Референсы — на своём диске,', 'а не в чужом облаке'] as const;

/**
 * Лид. Способы захвата в нём перечислены те, что есть на системе гостя:
 * автоимпорт папки скриншотов — только macOS, вставка на Windows идёт Ctrl+V.
 */
function lead(platform: Platform): string {
  const ways =
    platform === 'windows'
      ? 'Захват из Chrome, drag&drop и Ctrl+V.'
      : 'Захват из Chrome, drag&drop, ⌘V и автоимпорт скриншотов.';
  return (
    'Копирка — локальная библиотека визуальных референсов. Плотная сетка, папки, теги, поиск. ' +
    `${ways} Никакого облака и подписки.`
  );
}

/** Подпись главной кнопки. Неопознанная система — нейтральное «Скачать». */
const CTA: Record<Platform, string> = {
  macos: 'Скачать для macOS',
  windows: 'Скачать для Windows',
  other: 'Скачать',
};

/**
 * Строка требований под кнопкой. Для опознанной системы — её версия, вес и
 * архитектуры; для неопознанной — минимумы обеих систем. `filter(Boolean)`
 * оставлен намеренно: вес — единственное значение, которое links.ts имеет право
 * держать пустым, пока новая сборка не собрана.
 */
function requirements(platform: Platform): string {
  const parts =
    platform === 'other'
      ? [RELEASE.version, PLATFORMS.macos.minOS, PLATFORMS.windows.minOS]
      : [RELEASE.version, PLATFORMS[platform].size, PLATFORMS[platform].minOS, PLATFORMS[platform].arch];
  return parts.filter(Boolean).join(' · ');
}

export function Hero() {
  const reduced = useReducedMotion();
  const platform = usePlatform();

  let wordIndex = 0;

  return (
    <section id="top" className="relative isolate overflow-hidden pt-[140px] pb-[140px]">
      <HeroBackdrop />

      {/*
        Колонка заголовка шире общей 1200: в макете строка «Референсы — на своём
        диске,» набрана 96 px и выходит за колонку — узел H1V-0 шириной 1250.
        Чтобы заголовок оставался в двух строках, как нарисовано, даём ему 1300.
      */}
      <div
        id="hero-content"
        className="relative mx-auto flex max-w-[1300px] flex-col items-center px-6 text-center md:px-10 xl:px-0"
      >
        <p className="eyebrow m-0">Бесплатно · macOS и Windows · файлы у вас на диске</p>

        <h1
          className="mt-9 mb-0 font-medium text-display"
          style={{
            fontSize: 'clamp(34px, 6.66vw, 96px)',
            lineHeight: 0.96,
            letterSpacing: '-0.04em',
          }}
        >
          {HEADLINE_LINES.map((line, lineIndex) => (
            <span key={line} className="block">
              {line.split(' ').map((word) => {
                const delay = wordIndex * WORD_STAGGER;
                wordIndex += 1;
                return (
                  <motion.span
                    key={`${lineIndex}-${word}-${delay}`}
                    className="inline-block whitespace-pre"
                    initial={
                      reduced
                        ? { opacity: 0 }
                        : { opacity: 0, y: REVEAL_SHIFT, filter: `blur(${BLUR_ENTER}px)` }
                    }
                    animate={
                      reduced
                        ? { opacity: 1 }
                        : { opacity: 1, y: 0, filter: 'blur(0px)' }
                    }
                    transition={reduced ? { duration: 0.2, delay: 0 } : { ...SPRING_PANEL, delay }}
                  >
                    {word}
                    {' '}
                  </motion.span>
                );
              })}
            </span>
          ))}
        </h1>

        <p
          className="mx-auto mt-8 mb-0 max-w-[780px] text-lead"
          style={{ fontSize: 'clamp(17px, 1.67vw, 24px)', lineHeight: 1.25 }}
        >
          {lead(platform)}
        </p>

        <div className="mt-11 flex flex-wrap items-center justify-center gap-3">
          <Button href="#download" variant="primary" size="hero">
            {CTA[platform]}
          </Button>
          {/* Репозиторий приватный — на публичной странице кнопки нет. */}
          {GITHUB_PUBLIC && (
            <Button
              href={GITHUB}
              variant="secondary"
              size="hero"
              icon={<Github size={16} strokeWidth={1.8} aria-hidden />}
            >
              Открыть на GitHub
            </Button>
          )}
        </div>

        <p className="eyebrow mt-7 mb-0">{requirements(platform)}</p>
      </div>

      <HeroShot reduced={reduced} />
    </section>
  );
}

/**
 * Снимок приложения под текстом. Вынесен отдельным компонентом, чтобы
 * `useScroll` не висел на ref, которого нет в разметке, и чтобы оба варианта
 * первого экрана собирали его одинаково.
 */
function HeroShot({ reduced }: { reduced: boolean }) {
  const shotRef = useRef<HTMLDivElement>(null);

  // Наклон снимка выравнивается, пока он въезжает в экран.
  const { scrollYProgress } = useScroll({
    target: shotRef,
    offset: ['start end', 'center center'],
  });
  const rotateX = useTransform(scrollYProgress, [0, 1], [8, 0]);

  return (
    <div
      ref={shotRef}
      className="relative mx-auto mt-[88px] w-full max-w-[1200px] px-6 md:px-10 xl:px-0"
      style={{ perspective: 1400 }}
    >
      {/* Свечение под рамкой: лайм 12 % с большим размытием. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-10 top-10 bottom-0"
        style={{ background: 'rgb(197 253 99 / 0.12)', filter: 'blur(80px)', borderRadius: 24 }}
      />
      <motion.div
        className="overflow-hidden rounded-[14px] border border-line-strong bg-panel md:rounded-[24px]"
        style={{
          rotateX: reduced ? 0 : rotateX,
          transformOrigin: 'center top',
          // Низ снимка уходит в холст.
          maskImage: 'linear-gradient(to bottom, #000 72%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, #000 72%, transparent 100%)',
        }}
      >
        <img
          src="/media/hero-library.webp"
          width={2400}
          height={1500}
          alt="Окно Копирки: сайдбар с папками, плотная сетка референсов"
          className="block h-auto w-full"
          fetchPriority="high"
        />
      </motion.div>
    </div>
  );
}
