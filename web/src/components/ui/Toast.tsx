import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
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

export type ToastTone = 'default' | 'danger' | 'success';

export interface ToastOptions {
  title?: string;
  /** Сводка вида «Добавлено 48 · Дубли 2 · Ошибки 1». */
  stats?: readonly ToastStat[];
  action?: ToastAction;
  /** `success` — «Скопировано», «Файл вернулся»; `danger` — не получилось. */
  tone?: ToastTone;
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

const TITLE_TONE: Record<ToastTone, string> = {
  default: 'text-ink',
  danger: 'text-danger',
  success: 'text-success',
};

function ToastRow({
  record,
  onDismiss,
  onPause,
  onResume,
}: {
  record: ToastRecord;
  onDismiss: () => void;
  onPause: () => void;
  onResume: () => void;
}) {
  /* Пауза таймера под курсором: прочитать сводку из шести чисел за 5 секунд нельзя. */
  const [paused, setPaused] = useState(false);

  const hold = () => {
    setPaused(true);
    onPause();
  };
  const release = () => {
    setPaused(false);
    onResume();
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      transition={{ duration: DUR_BASE, ease: EASE_OUT }}
      role="status"
      onMouseEnter={hold}
      onMouseLeave={release}
      onFocusCapture={hold}
      onBlurCapture={release}
      className={cn(
        'pointer-events-auto relative flex min-h-10 items-center gap-3 overflow-hidden',
        'rounded-md bg-surface-overlay py-2 pr-2.5 pl-4 shadow-float',
      )}
    >
      {record.title ? (
        <span className={cn('text-base', TITLE_TONE[record.tone ?? 'default'])}>{record.title}</span>
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

      {/* Закрыть руками, не дожидаясь пяти секунд (аудит 4.23). */}
      <button
        type="button"
        aria-label="Закрыть уведомление"
        onClick={onDismiss}
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-xs text-ink-faint',
          'transition-colors duration-[var(--dur-fast)] ease-out hover:text-ink',
        )}
      >
        <X className="size-4" strokeWidth={2} aria-hidden />
      </button>

      {/* Полоска остатка времени — видно, сколько осталось на «Отменить». */}
      {record.action && record.duration > 0 ? (
        <span
          aria-hidden
          style={
            {
              '--toast-duration': `${record.duration}ms`,
              animationPlayState: paused ? 'paused' : 'running',
            } as CSSProperties
          }
          className="toast-countdown absolute inset-x-0 bottom-0 h-px bg-accent"
        />
      ) : null}
    </motion.div>
  );
}

/** Таймер одного тоста. `handle === null` — стоит на паузе под курсором. */
interface ToastTimer {
  handle: number | null;
  endsAt: number;
  remaining: number;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastRecord[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ToastTimer>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer?.handle != null) window.clearTimeout(timer.handle);
    timers.current.delete(id);
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (options: ToastOptions): number => {
      const id = nextId.current++;
      const duration = options.duration ?? DEFAULT_DURATION_MS;
      setItems((prev) => [...prev, { ...options, id, duration }]);
      if (duration > 0) {
        timers.current.set(id, {
          handle: window.setTimeout(() => dismiss(id), duration),
          endsAt: Date.now() + duration,
          remaining: duration,
        });
      }
      return id;
    },
    [dismiss],
  );

  /** Курсор на тосте — таймер стоит; уехал — идёт дальше с того же места. */
  const pause = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (!timer || timer.handle === null) return;
    window.clearTimeout(timer.handle);
    timers.current.set(id, {
      handle: null,
      endsAt: timer.endsAt,
      remaining: Math.max(0, timer.endsAt - Date.now()),
    });
  }, []);

  const resume = useCallback(
    (id: number) => {
      const timer = timers.current.get(id);
      if (!timer || timer.handle !== null) return;
      timers.current.set(id, {
        handle: window.setTimeout(() => dismiss(id), timer.remaining),
        endsAt: Date.now() + timer.remaining,
        remaining: timer.remaining,
      });
    },
    [dismiss],
  );

  useEffect(() => {
    const active = timers.current;
    return () => {
      for (const timer of active.values()) if (timer.handle != null) window.clearTimeout(timer.handle);
      active.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ toast, dismiss }), [toast, dismiss]);

  /*
    «Полка» (дизайн-аудит 4.14–4.15) живёт в области контента и монтируется вместе
    с сеткой, то есть позже провайдера. Ищем её не один раз, а на каждое изменение
    списка тостов, и в layout-эффекте — чтобы первый кадр тоста уже был на месте
    и портал не пересобирался, заново проигрывая появление.
    Полки нет (витрина, онбординг, настройки) — работаем как раньше, по центру окна.
  */
  const [shelf, setShelf] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setShelf(document.getElementById('kopirka-shelf'));
  }, [items]);

  const stack = (
    <div
      className={cn(
        'shelf-toast pointer-events-none z-[60] flex flex-col items-center gap-2',
        shelf === null && 'fixed inset-x-0 bottom-6',
      )}
    >
      <AnimatePresence initial={false}>
        {items.map((item) => (
          <ToastRow
            key={item.id}
            record={item}
            onDismiss={() => dismiss(item.id)}
            onPause={() => pause(item.id)}
            onResume={() => resume(item.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {shelf === null ? stack : createPortal(stack, shelf)}
    </ToastContext.Provider>
  );
}
