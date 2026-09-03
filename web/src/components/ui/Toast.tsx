/**
 * Тосты. Канон — R14 · «Тосты» и R13 · «Стекло и движение».
 *
 * Пилюля: `.glass` (raised-glass + blur 20 + край `line-strong`), высота 40,
 * радиус `--radius-card`, поля 14, зазор 10, ширина по содержимому.
 * Тени у тоста нет вовсе — это проверено по узлам R14.
 * Текст 13/16 · 500: `ink`, у ошибки — `danger`. Иконка слева 16 (лаймовая
 * галка у успеха, `triangle-alert` у ошибки), крестик справа 14 `ink-muted`,
 * кнопка действия — призрачная 32 px с полями 8.
 *
 * Стопка: новый снизу, каждый следующий сверху уезжает на 8 px и теряет 20 %
 * непрозрачности (`toastStackMotion`). Полосы обратного отсчёта в редизайне
 * нет — пауза таймера под курсором осталась.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Check, TriangleAlert, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Icon } from '@/lib/icons';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { glassLayerMotion, toastStackMotion } from './motion-presets';
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
  /* Галка успеха в макете лаймовая, а не зелёная: `success` в редизайне не звучит. */
  success: 'text-ink',
};

/** Глубже трёх стопка не бледнеет: иначе четвёртый тост стал бы невидимым. */
const MAX_STACK_DEPTH = 3;

function ToastRow({
  record,
  depth,
  onDismiss,
  onPause,
  onResume,
}: {
  record: ToastRecord;
  /** Сколько тостов пришло после этого: 0 у самого нижнего, свежего. */
  depth: number;
  onDismiss: () => void;
  onPause: () => void;
  onResume: () => void;
}) {
  const reduced = useReducedMotion();
  /* Пауза таймера под курсором: прочитать сводку из шести чисел за 5 секунд нельзя. */
  const hold = () => onPause();
  const release = () => onResume();

  /*
    Вход и уход — общий стеклянный пресет (тост стоит у нижнего края, значит
    приезжает снизу), а конечное положение переопределяет стопка: сдвиг вверх
    и потеря непрозрачности за каждый следующий тост.
  */
  const layer = glassLayerMotion({ from: 'bottom', reduced });
  const tone = record.tone ?? 'default';

  return (
    <motion.div
      layout
      initial={layer.initial}
      animate={{ ...layer.animate, ...toastStackMotion(Math.min(depth, MAX_STACK_DEPTH), reduced) }}
      exit={layer.exit}
      role="status"
      onMouseEnter={hold}
      onMouseLeave={release}
      onFocusCapture={hold}
      onBlurCapture={release}
      className={cn(
        'glass pointer-events-auto flex h-[var(--size-toast)] w-fit items-center gap-2.5',
        'rounded-card px-3.5',
      )}
    >
      {tone === 'success' ? <Icon icon={Check} size={16} className="shrink-0 text-brand" aria-hidden /> : null}
      {tone === 'danger' ? (
        <Icon icon={TriangleAlert} size={16} className="shrink-0 text-danger" aria-hidden />
      ) : null}

      {record.title ? (
        <span className={cn('shrink-0 text-base leading-4 font-medium', TITLE_TONE[tone])}>
          {record.title}
        </span>
      ) : null}

      {record.stats ? (
        <span className="flex items-center gap-2 text-base leading-4 font-medium">
          {record.stats.map((stat, index) => (
            <span key={stat.label} className="flex items-center gap-2">
              {index > 0 ? <span className="text-ink-faint">·</span> : null}
              <span className={STAT_TONE[stat.tone ?? 'default']}>
                {stat.label} <span className="tabular-nums">{stat.value}</span>
              </span>
            </span>
          ))}
        </span>
      ) : null}

      {/* Действие — призрачная кнопка 32 px с полями 8 (R14 · «действие с отменой»). */}
      {record.action ? (
        <button
          type="button"
          onClick={() => {
            record.action?.onClick();
            onDismiss();
          }}
          className={cn(
            'flex h-[var(--size-row)] shrink-0 items-center rounded-md px-2',
            'text-md leading-[18px] font-medium text-ink-muted',
            'transition-colors duration-[var(--dur-fast)] ease-out hover:bg-control hover:text-ink',
          )}
        >
          {record.action.label}
        </button>
      ) : (
        /* Без действия закрывают крестиком — не дожидаясь пяти секунд. */
        <button
          type="button"
          aria-label="Закрыть уведомление"
          onClick={onDismiss}
          className={cn(
            'flex shrink-0 items-center justify-center text-ink-muted',
            'transition-colors duration-[var(--dur-fast)] ease-out hover:text-ink',
          )}
        >
          <Icon icon={X} size={14} aria-hidden />
        </button>
      )}
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
        {items.map((item, index) => (
          <ToastRow
            key={item.id}
            record={item}
            /* Свежий тост внизу списка: у него глубина 0, у каждого выше — на единицу больше. */
            depth={items.length - 1 - index}
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
