import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { EASE_OUT, DUR_BASE } from '@/lib/motion';
import type { ImportResponse } from '@shared/api';

/** Автоскрытие по умолчанию. Совпадает с окном отмены удаления (ORG-05). */
const DEFAULT_DURATION_MS = 5000;

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastStat {
  label: string;
  value: number;
  tone?: 'default' | 'muted' | 'danger';
}

export interface ToastOptions {
  title?: string;
  /** Сводка вида «Добавлено 48 · Дубли 2 · Ошибки 1». */
  stats?: readonly ToastStat[];
  action?: ToastAction;
  tone?: 'default' | 'danger';
  /** мс; 0 — не скрывать автоматически. */
  duration?: number;
}

interface ToastRecord extends ToastOptions {
  id: number;
  duration: number;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast: нет ToastProvider выше по дереву');
  return value;
}

/** Готовая сводка массового импорта из ответа сервера. */
export function importSummaryToast(summary: ImportResponse['summary']): ToastOptions {
  const stats: ToastStat[] = [{ label: 'Добавлено', value: summary.added }];
  if (summary.similar > 0) stats.push({ label: 'Похожие', value: summary.similar, tone: 'muted' });
  if (summary.duplicates > 0) stats.push({ label: 'Дубли', value: summary.duplicates, tone: 'muted' });
  if (summary.errors > 0) stats.push({ label: 'Ошибки', value: summary.errors, tone: 'danger' });
  return { stats };
}

const STAT_TONE: Record<NonNullable<ToastStat['tone']>, string> = {
  default: 'text-ink',
  muted: 'text-ink-muted',
  danger: 'text-danger',
};

function ToastRow({ record, onDismiss }: { record: ToastRecord; onDismiss: () => void }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      transition={{ duration: DUR_BASE, ease: EASE_OUT }}
      role="status"
      className={cn(
        'pointer-events-auto relative flex min-h-10 items-center gap-3 overflow-hidden',
        'rounded-md bg-surface-overlay px-4 py-2 shadow-float',
      )}
    >
      {record.title ? (
        <span className={cn('text-base', record.tone === 'danger' ? 'text-danger' : 'text-ink')}>
          {record.title}
        </span>
      ) : null}

      {record.stats ? (
        <span className="flex items-center gap-2 text-base">
          {record.stats.map((stat, index) => (
            <span key={stat.label} className="flex items-center gap-2">
              {index > 0 ? <span className="text-ink-faint">·</span> : null}
              <span className={STAT_TONE[stat.tone ?? 'default']}>
                {stat.label} <span className="font-mono">{stat.value}</span>
              </span>
            </span>
          ))}
        </span>
      ) : null}

      {record.action ? (
        <>
          <span className="h-4 w-px shrink-0 bg-line-strong" aria-hidden />
          <button
            type="button"
            onClick={() => {
              record.action?.onClick();
              onDismiss();
            }}
            className={cn(
              'shrink-0 text-base font-medium text-accent',
              'transition-colors duration-[var(--dur-fast)] ease-out hover:text-accent-hover',
            )}
          >
            {record.action.label}
          </button>
        </>
      ) : null}

      {/* Полоска остатка времени — видно, сколько осталось на «Отменить». */}
      {record.action && record.duration > 0 ? (
        <motion.span
          aria-hidden
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          transition={{ duration: record.duration / 1000, ease: 'linear' }}
          className="absolute inset-x-0 bottom-0 h-px origin-left bg-accent"
        />
      ) : null}
    </motion.div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastRecord[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (options: ToastOptions): number => {
      const id = nextId.current++;
      const duration = options.duration ?? DEFAULT_DURATION_MS;
      setItems((prev) => [...prev, { ...options, id, duration }]);
      if (duration > 0) {
        timers.current.set(
          id,
          window.setTimeout(() => dismiss(id), duration),
        );
      }
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const active = timers.current;
    return () => {
      for (const timer of active.values()) window.clearTimeout(timer);
      active.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex flex-col items-center gap-2">
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <ToastRow key={item.id} record={item} onDismiss={() => dismiss(item.id)} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
