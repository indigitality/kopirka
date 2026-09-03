/**
 * Пустое состояние. Канон — R12 · «Пустые состояния», все семь образцов
 * собраны из одной колонки шириной 420 с зазором 12:
 *   квадрат 44 с радиусом `--radius-card` и заливкой `control`, иконка 20;
 *   заголовок 16/20 · 500 `ink`;
 *   текст 13/19 `ink-muted`, по центру;
 *   ряд кнопок с зазором 8 и дополнительным отступом сверху 4.
 *
 * `tone="danger"` — образец 7 «сервер недоступен»: квадрат `danger-tint`,
 * иконка и заголовок `danger`, текст остаётся приглушённым.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type EmptyStateTone = 'neutral' | 'danger';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  /** Обычно один или два `<Button>`. */
  action?: ReactNode;
  tone?: EmptyStateTone;
  className?: string;
}

const BOX: Record<EmptyStateTone, string> = {
  neutral: 'bg-control text-ink-muted',
  danger: 'bg-danger-tint text-danger',
};

const TITLE: Record<EmptyStateTone, string> = {
  neutral: 'text-ink',
  danger: 'text-danger',
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  tone = 'neutral',
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        /* `mx-auto` + `justify-center` — чтобы колонка вставала по центру и по
           горизонтали, и по вертикали, когда родитель отдаёт ей всю высоту. */
        'mx-auto flex w-[420px] max-w-full flex-col items-center justify-center gap-3 text-center',
        className,
      )}
    >
      {icon ? (
        <div
          className={cn(
            'flex size-[var(--size-bar)] shrink-0 items-center justify-center rounded-card',
            BOX[tone],
          )}
        >
          {icon}
        </div>
      ) : null}
      <p className={cn('text-lg leading-5 font-medium', TITLE[tone])}>{title}</p>
      {description ? (
        <p className="self-stretch text-base leading-[19px] text-ink-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-1 flex items-center gap-2">{action}</div> : null}
    </div>
  );
}
