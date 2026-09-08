/**
 * Фон первого экрана — дыхание света за заголовком.
 *
 * Три слоя, от дешёвого к дорогому:
 *   1. CSS-подложка: два радиальных пятна лаймом на 6 % и 4 % и виньетка
 *      к #050505. Она есть всегда — и в статичном кадре, и под шейдером.
 *   2. Шейдер `GrainGradient` из `@paper-design/shaders-react` (0.0.80,
 *      пакет существует и встал). Грузится лениво и только когда первый экран
 *      виден, а движение разрешено: чанк с WebGL не должен ехать в первом
 *      запросе. Прозрачность слоя 0.32 + радиальная маска: в полосе заголовка
 *      пик яркости фона измерен как 9,6 % от белого (headless Chrome,
 *      ffmpeg signalstats по чистой подложке), заголовок читается без спора.
 *   3. Запасной вариант — canvas 2D: медленно плывущее лаймовое пятно 6–8 %
 *      и статичное зерно. Включается, если WebGL недоступен или чанк шейдера
 *      не загрузился.
 *
 * При `prefers-reduced-motion` не запускается ничего: остаётся слой 1.
 *
 * Вариант `video` — второй первый экран на сравнение (см. `heroVariant.ts`):
 * вместо шейдера и запасного canvas крутится петля `media/hero-loop.webm`
 * (фолбэк mp4 для Safari), а поверх неё лежит градиент, под которым читается
 * заголовок. Виньетка слоя 1 там не нужна: в самом видео она уже есть, вторая
 * съедает стену карточек по краям до черноты
 * (`work/лендинг (это сделал клод)/видео-фон-v2/ИНТЕГРАЦИЯ.md`).
 *
 * Видео показывается только от 901 px — правка Сергея 08.09.2026: на телефоне
 * остаётся снимок приложения на прежнем фоне. Проверка идёт по `useCompact`, а
 * не по CSS, поэтому на узком экране `<video>` не появляется в разметке вовсе
 * и мегабайт петли не качается.
 */
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import type { HeroVariant } from '@/heroVariant';
import { useCompact } from '@/lib/useCompact';
import { useInView } from '@/lib/useInView';
import { useReducedMotion } from '@/lib/useReducedMotion';

const ShaderLayer = lazy(() => import('./HeroShader'));

/** Есть ли WebGL. Проверяем один раз: контекст создаётся и сразу выбрасывается. */
function hasWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export interface HeroBackdropProps {
  variant?: HeroVariant;
}

export function HeroBackdrop({ variant = 'shot' }: HeroBackdropProps) {
  const reduced = useReducedMotion();
  const compact = useCompact();
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.01 });
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [shaderFailed, setShaderFailed] = useState(false);

  useEffect(() => setWebgl(hasWebGL()), []);

  // На узком экране вариант `video` показывает тот же фон, что и `shot`.
  const showVideo = variant === 'video' && !compact;
  const wantsMotion = !reduced && inView;
  const useShader = !showVideo && wantsMotion && webgl === true && !shaderFailed;
  const useCanvas = !showVideo && wantsMotion && (webgl === false || shaderFailed);

  if (showVideo) {
    return (
      <div
        ref={ref}
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 overflow-hidden"
        /* Ровно первый экран. Нижняя граница — 720, чтобы на низких окнах
           видео не обрезало текст. */
        style={{ height: 'max(100svh, 720px)' }}
      >
        {/* Подложка: она видна, пока грузится первый кадр. */}
        <div className="absolute inset-0" style={{ background: 'var(--color-canvas)' }} />

        {reduced ? (
          <img
            src="/media/hero-loop-poster.jpg"
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <video
            autoPlay
            muted
            loop
            playsInline
            preload={inView ? 'auto' : 'metadata'}
            poster="/media/hero-loop-poster.jpg"
            className="absolute inset-0 h-full w-full object-cover"
          >
            <source src="/media/hero-loop.webm" type="video/webm" />
            <source src="/media/hero-loop.mp4" type="video/mp4" />
          </video>
        )}

        {/*
          Градиент поверх видео. Четыре слоя, сверху вниз по списку:
            • полоса под навигацией, чтобы логотип и кнопка не спорили с картинками;
            • низ уходит в холст перед следующей секцией;
            • мягкий эллипс под текстом — под ним и читается заголовок;
            • лаймовый шёпот, чтобы фон не был просто серым.
          Значения подобраны на глаз по живой странице; лаймовый слой на 5 %
          заметен только рядом с чистым видео, но без него первый экран
          отваливается от остальной страницы по цвету.
        */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to bottom, rgb(5 5 5 / 0.82) 0%, rgb(5 5 5 / 0.34) 13%, transparent 30%),' +
              'linear-gradient(to top, #050505 0%, rgb(5 5 5 / 0.88) 10%, rgb(5 5 5 / 0.38) 29%, transparent 54%),' +
              'radial-gradient(ellipse 86% 66% at 50% 42%, rgb(5 5 5 / 0.88) 0%, rgb(5 5 5 / 0.66) 42%, rgb(5 5 5 / 0.26) 70%, transparent 86%),' +
              'radial-gradient(ellipse 62% 46% at 50% 40%, rgb(197 253 99 / 0.05), transparent 74%)',
          }}
        />
      </div>
    );
  }

  return (
    <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Слой 1 — статичная подложка. Она же единственный кадр при reduce. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(60% 46% at 50% 30%, rgb(197 253 99 / 0.06), transparent 70%),' +
            'radial-gradient(38% 30% at 68% 58%, rgb(197 253 99 / 0.04), transparent 72%)',
        }}
      />

      {useShader ? (
        <Suspense fallback={null}>
          <ShaderLayer onError={() => setShaderFailed(true)} />
        </Suspense>
      ) : null}

      {useCanvas ? <CanvasGlow /> : null}

      {/* Виньетка: края уходят в холст, чтобы фон не читался «градиентной лужей». */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(78% 62% at 50% 34%, transparent 0%, transparent 42%, #050505 100%)',
        }}
      />
      {/* Низ первого экрана растворяется в холсте перед следующей секцией. */}
      <div
        className="absolute inset-x-0 bottom-0 h-40"
        style={{ background: 'linear-gradient(to bottom, transparent, #050505)' }}
      />
    </div>
  );
}

/**
 * Запасной фон на canvas 2D: медленно плывущее лаймовое пятно 6–8 % и зерно.
 * Зерно рисуется один раз в отдельный холст и потом только накладывается —
 * генерировать шум каждый кадр незачем, он статичный по замыслу.
 */
function CanvasGlow() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Половинное разрешение: пятно размытое, деталей там нет.
    const SCALE = 0.5;
    let raf = 0;
    let noise: HTMLCanvasElement | null = null;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * SCALE));
      canvas.height = Math.max(1, Math.round(rect.height * SCALE));
      noise = makeNoise(canvas.width, canvas.height);
    };

    const draw = (t: number) => {
      const { width: w, height: h } = canvas;
      ctx.clearRect(0, 0, w, h);

      // Два пятна с разными периодами — движение не читается как маятник.
      const drift = (period: number, phase: number) => Math.sin((t / period) * Math.PI * 2 + phase);
      const spots: Array<[number, number, number, number]> = [
        [0.5 + drift(28000, 0) * 0.06, 0.32 + drift(37000, 1.2) * 0.05, 0.62, 0.075],
        [0.66 + drift(41000, 2.1) * 0.05, 0.58 + drift(31000, 0.4) * 0.04, 0.4, 0.05],
      ];
      for (const [x, y, r, alpha] of spots) {
        const grad = ctx.createRadialGradient(x * w, y * h, 0, x * w, y * h, r * w);
        grad.addColorStop(0, `rgba(197, 253, 99, ${alpha})`);
        grad.addColorStop(1, 'rgba(197, 253, 99, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }

      if (noise) {
        ctx.globalAlpha = 0.5;
        ctx.drawImage(noise, 0, 0);
        ctx.globalAlpha = 1;
      }
      raf = requestAnimationFrame(draw);
    };

    resize();
    raf = requestAnimationFrame(draw);
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />;
}

/** Статичное зерно: серый шум с очень низкой прозрачностью. */
function makeNoise(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const img = ctx.createImageData(w, h);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    const v = 120 + Math.random() * 135;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 14;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
