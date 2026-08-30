import { forwardRef, type HTMLAttributes } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  /** Если задан — по наведению справа появляется «×». */
  onRemove?: () => void;
  /** Пунктирная рамка: вариант кнопки «+ тег». */
  dashed?: boolean;
}

export const Tag = forwardRef<HTMLSpanElement, TagProps>(function Tag(
  { onRemove, dashed, className, children, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn(
        'group/tag inline-flex h-6 max-w-full items-center rounded-pill px-2.5 text-sm',
        'transition-colors duration-[var(--dur-fast)] ease-out',
        dashed
          ? 'border border-dashed border-line-strong bg-transparent text-ink-faint hover:text-ink-muted'
          : 'bg-surface-active text-ink-muted hover:text-ink',
        onRemove && 'pr-1.5',
        className,
      )}
      {...rest}
    >
      <span className="truncate">{children}</span>
      {onRemove ? (
        <button
          type="button"
          aria-label="Убрать тег"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          className={cn(
            'ml-1 flex size-4 shrink-0 items-center justify-center rounded-pill',
            'opacity-0 transition-opacity duration-[var(--dur-fast)] ease-out',
            'group-hover/tag:opacity-100 focus-visible:opacity-100',
            'text-ink-faint hover:text-ink',
          )}
        >
          <X className="size-3" strokeWidth={2.5} aria-hidden />
        </button>
      ) : null}
    </span>
  );
});
