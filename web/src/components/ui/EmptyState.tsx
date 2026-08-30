import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  /** Обычно <Button>. */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-8 py-16 text-center', className)}>
      {icon ? (
        <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-surface-raised text-ink-faint">
          {icon}
        </div>
      ) : null}
      <p className="text-md font-medium text-ink">{title}</p>
      {description ? <p className="mt-1 max-w-[380px] text-base text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
