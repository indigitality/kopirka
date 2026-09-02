/**
 * Сегментный контрол — единственный тип переключателя в «Копирке» (дизайн-аудит §8.1).
 *
 * Подложка `--color-surface-raised`, радиус `--radius-md`, внутренний паддинг 2,
 * высота `--size-row`; сегмент — `--radius-sm`, активный — плашка
 * `--color-surface-active` + `--color-ink` + вес 500, неактивный — `--color-ink-muted`.
 * Плашка не перекрашивается, а переезжает: `layoutId`, `--dur-fast`, `--ease-out`.
 *
 * Доступность: `role="radiogroup"` + `role="radio"`, roving tabindex (в группу
 * заходят одним Tab), стрелки ←/→ и ↑/↓ переключают внутри группы — так ведут
 * себя радиокнопки, а не кнопки.
 */
import { useId, useRef, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { DUR_FAST, EASE_OUT } from '@/lib/motion';
import { Tooltip } from './Tooltip';

export interface SegmentedOption<T extends string> {
  value: T;
  /** Доступное имя сегмента. Показывается текстом, если нет `icon`. */
  label: string;
  /** Иконка вместо текста — тогда `label` уходит в `aria-label`. */
  icon?: ReactNode;
  /** Подсказка под сегментом; без неё у иконочного сегмента берётся `label`. */
  tooltip?: ReactNode;
  /** Хоткей в подсказке — моно, приглушённый. */
  hotkey?: string;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  /** `aria-label` группы: «Размер карточек». */
  label: string;
  /** Ширина сегмента в px. По умолчанию — по содержимому с паддингом 10. */
  segmentWidth?: number;
  className?: string;
}

export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  label,
  segmentWidth,
  className,
}: SegmentedControlProps<T>) {
  const reduced = useReducedMotion();
  const layoutId = useId();
  const groupRef = useRef<HTMLDivElement>(null);

  /** Стрелка переносит и выбор, и фокус — иначе клавиатура «отстаёт» от подсветки. */
  const step = (delta: 1 | -1) => {
    const index = options.findIndex((option) => option.value === value);
    if (index === -1) return;
    const next = options[(index + delta + options.length) % options.length];
    if (!next) return;
    onValueChange(next.value);
    const node = groupRef.current?.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`);
    node?.focus();
  };

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={label}
      className={cn(
        'inline-flex h-[var(--size-row)] shrink-0 items-center gap-0.5 rounded-md bg-surface-raised p-0.5',
        className,
      )}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
          event.preventDefault();
          step(1);
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
          event.preventDefault();
          step(-1);
        }
      }}
    >
      {options.map((option) => {
        const active = option.value === value;
        const segment = (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.icon ? option.label : undefined}
            data-value={option.value}
            // Roving tabindex: в группу заходят одним Tab, дальше — стрелками.
            tabIndex={active ? 0 : -1}
            onClick={() => onValueChange(option.value)}
            className={cn(
              'relative flex h-7 items-center justify-center rounded-sm whitespace-nowrap',
              'text-base transition-colors duration-[var(--dur-fast)] ease-out',
              segmentWidth === undefined && 'px-2.5',
              active ? 'font-medium text-ink' : 'text-ink-muted hover:text-ink',
            )}
            style={segmentWidth === undefined ? undefined : { width: segmentWidth }}
          >
            {active ? (
              <motion.span
                layoutId={layoutId}
                aria-hidden
                transition={reduced ? { duration: 0 } : { duration: DUR_FAST, ease: EASE_OUT }}
                className="absolute inset-0 rounded-sm bg-surface-active"
              />
            ) : null}
            <span className="relative flex items-center justify-center gap-1.5">
              {option.icon ?? option.label}
            </span>
          </button>
        );

        const hint = option.tooltip ?? (option.icon ? option.label : null);
        if (hint === null) return segment;
        return (
          <Tooltip key={option.value} content={hint} hotkey={option.hotkey} side="bottom">
            {segment}
          </Tooltip>
        );
      })}
    </div>
  );
}
