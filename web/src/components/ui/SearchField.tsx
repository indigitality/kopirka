import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { BorderBeam } from 'border-beam';
import { Search } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useReducedMotion } from '@/lib/useReducedMotion';

// ── Параметры бима. Крутить здесь. ─────────────────────────────────────────
/** Пресет вращающегося бима по периметру. */
const BEAM_SIZE = 'md' as const;
/** 'colorful' | 'mono' | 'ocean' | 'sunset' */
const BEAM_COLOR_VARIANT = 'colorful' as const;
/** Интенсивность 0…1. */
const BEAM_STRENGTH = 0.6;
/** Тема подложки. */
const BEAM_THEME = 'dark' as const;
/** Длительность одного оборота, секунды (дефолт пресета 'md'). */
const BEAM_DURATION_S = 1.96;
/** Режим 'hover': сколько оборотов отработать и погаснуть. */
const HOVER_CYCLES = 3;
/** Режим 'cycle': пауза между оборотами, мс. */
const CYCLE_PAUSE_MS = 2000;
/** Длительность затухания бима в пакете (beam-fade-out 0.5s) — для страховочного таймера. */
const BEAM_FADE_OUT_MS = 500;
/** Радиус поля в px — должен совпадать с --radius-lg, бим рисует контур по нему. */
const FIELD_RADIUS_PX = 10;

export type BeamMode = 'hover' | 'cycle';

export interface SearchFieldProps {
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  /** 'hover' — 3 оборота по наведению/фокусу; 'cycle' — оборот, пауза 2 с, повтор. */
  beamMode?: BeamMode;
  /** Глобальный ⌘K фокусирует поле. На витрине выключаем, чтобы поля не дрались. */
  globalHotkey?: boolean;
  className?: string;
}

export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  {
    value,
    onValueChange,
    placeholder = 'Поиск по названию',
    beamMode = 'hover',
    globalHotkey = true,
    className,
  },
  forwardedRef,
) {
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(forwardedRef, () => inputRef.current as HTMLInputElement, []);

  const reducedMotion = useReducedMotion();
  const [beamActive, setBeamActive] = useState(false);
  const hoverTimerRef = useRef<number | null>(null);
  const pauseTimerRef = useRef<number | null>(null);

  const cycling = beamMode === 'cycle' && !reducedMotion;

  // Режим 'cycle': запускаем первый оборот. При reduce-motion бим не включаем вовсе.
  useEffect(() => {
    if (pauseTimerRef.current !== null) {
      window.clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
    setBeamActive(cycling);
  }, [cycling]);

  // Фаза «горит»: один оборот и гасим.
  useEffect(() => {
    if (!cycling || !beamActive) return;
    const id = window.setTimeout(() => setBeamActive(false), BEAM_DURATION_S * 1000);
    return () => window.clearTimeout(id);
  }, [cycling, beamActive]);

  // Фаза «погас»: паузу заводит onDeactivate, когда затухание закончилось.
  // Этот таймер — страховка: onDeactivate приходит из animationend, а в скрытой
  // вкладке CSS-анимации не идут, и без него цикл встал бы навсегда.
  useEffect(() => {
    if (!cycling || beamActive) return;
    const id = window.setTimeout(
      () => setBeamActive(true),
      BEAM_FADE_OUT_MS + CYCLE_PAUSE_MS + 200,
    );
    return () => window.clearTimeout(id);
  }, [cycling, beamActive]);

  /** Режим 'hover': запуск ровно на HOVER_CYCLES оборотов, повторное наведение — заново. */
  const startHoverBeam = useCallback(() => {
    if (reducedMotion || beamMode !== 'hover') return;
    if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
    setBeamActive(true);
    hoverTimerRef.current = window.setTimeout(() => {
      hoverTimerRef.current = null;
      setBeamActive(false);
    }, HOVER_CYCLES * BEAM_DURATION_S * 1000);
  }, [beamMode, reducedMotion]);

  const handleDeactivate = useCallback(() => {
    if (!cycling) return;
    if (pauseTimerRef.current !== null) window.clearTimeout(pauseTimerRef.current);
    pauseTimerRef.current = window.setTimeout(() => {
      pauseTimerRef.current = null;
      setBeamActive(true);
    }, CYCLE_PAUSE_MS);
  }, [cycling]);

  // Снимаем висящие таймеры при размонтировании и смене режима.
  useEffect(
    () => () => {
      if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
      if (pauseTimerRef.current !== null) window.clearTimeout(pauseTimerRef.current);
    },
    [],
  );

  // ⌘K / Ctrl+K — фокус на поле.
  useEffect(() => {
    if (!globalHotkey) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
      startHoverBeam();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [globalHotkey, startHoverBeam]);

  return (
    <BorderBeam
      size={BEAM_SIZE}
      colorVariant={BEAM_COLOR_VARIANT}
      strength={BEAM_STRENGTH}
      theme={BEAM_THEME}
      duration={BEAM_DURATION_S}
      active={beamActive}
      onDeactivate={handleDeactivate}
      borderRadius={FIELD_RADIUS_PX}
      className={cn('w-[280px] shrink-0', className)}
      onMouseEnter={startHoverBeam}
    >
      <div
        className={cn(
          'flex h-[34px] w-full items-center gap-2 rounded-lg bg-surface-raised px-2.5',
          'transition-colors duration-[var(--dur-fast)] ease-out',
        )}
      >
        <Search className="size-3.5 shrink-0 text-ink-faint" strokeWidth={2} aria-hidden />
        <input
          ref={inputRef}
          type="search"
          value={value}
          onChange={(event) => onValueChange?.(event.target.value)}
          onFocus={startHoverBeam}
          placeholder={placeholder}
          aria-label={placeholder}
          className={cn(
            'min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-ink-faint',
            'outline-none [&::-webkit-search-cancel-button]:appearance-none',
          )}
        />
        <kbd className="shrink-0 rounded-xs bg-surface-active px-1.5 py-0.5 font-mono text-2xs text-ink-faint">
          ⌘K
        </kbd>
      </div>
    </BorderBeam>
  );
});
