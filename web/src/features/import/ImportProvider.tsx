/**
 * CAP-03 / CAP-04 — импорт перетаскиванием и вставкой из буфера.
 * Один вход: `startImport(files)`. Дальше — прогресс, очередь модалок
 * «Похоже, уже есть» (IMP-01) и один сводный тост по итогу (6.3 PRD).
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { ImportResultItem, ImportResponse } from '@shared/api';
import * as api from '@/lib/api';
import { EASE_OUT, DUR_BASE } from '@/lib/motion';
import { useToast, type ToastStat } from '@/components/ui/Toast';
import { useLibrary } from '@/features/library/LibraryProvider';
import { SimilarConfirmModal } from './SimilarConfirmModal';

export type ImportSource = 'drag_drop' | 'clipboard';

interface ImportProgress {
  total: number;
  /** 0…1 — отправка на сервер. */
  ratio: number;
  /** После отправки сервер ещё считает хэши и рисует превью. */
  phase: 'upload' | 'process';
}

interface Totals {
  added: number;
  duplicates: number;
  similar: number;
  errors: number;
  skipped: number;
}

interface PendingItem {
  item: ImportResultItem;
  /** Превью ещё не сохранённого файла — из локального File. */
  localUrl: string | null;
}

export interface ImportValue {
  progress: ImportProgress | null;
  startImport: (files: readonly File[], source?: ImportSource) => Promise<void>;
  /** Файлы из события drop или paste. Пустой список игнорируется. */
  importFromTransfer: (data: DataTransfer | null, source: ImportSource) => void;
}

const ImportContext = createContext<ImportValue | null>(null);

export function useImport(): ImportValue {
  const value = useContext(ImportContext);
  if (!value) throw new Error('useImport: нет ImportProvider выше по дереву');
  return value;
}

function summaryStats(totals: Totals): ToastStat[] {
  const stats: ToastStat[] = [{ label: 'Добавлено', value: totals.added }];
  if (totals.similar > 0) stats.push({ label: 'Похожие', value: totals.similar, tone: 'muted' });
  if (totals.duplicates > 0) stats.push({ label: 'Дубли', value: totals.duplicates, tone: 'muted' });
  if (totals.skipped > 0) stats.push({ label: 'Пропущено', value: totals.skipped, tone: 'muted' });
  if (totals.errors > 0) stats.push({ label: 'Ошибки', value: totals.errors, tone: 'danger' });
  return stats;
}

export function ImportProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const { reload } = useLibrary();
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [queue, setQueue] = useState<PendingItem[]>([]);
  const totalsRef = useRef<Totals>({ added: 0, duplicates: 0, similar: 0, errors: 0, skipped: 0 });
  const busyRef = useRef(false);

  const finish = useCallback(async () => {
    const totals = totalsRef.current;
    await reload();
    const failed = totals.errors > 0 && totals.added === 0;
    toast({
      title: failed ? 'Импорт не удался' : undefined,
      stats: summaryStats(totals),
      tone: failed ? 'danger' : 'default',
    });
  }, [reload, toast]);

  /** Разбор ответа: что посчитать в сводку, а что показать модалкой. */
  const consume = useCallback(
    async (response: ImportResponse, files: readonly File[]) => {
      const pending: PendingItem[] = [];
      response.items.forEach((item, index) => {
        if (item.outcome !== 'needs_confirmation') return;
        const source = files[index];
        pending.push({
          item,
          localUrl: source ? URL.createObjectURL(source) : null,
        });
      });

      totalsRef.current = {
        added: response.summary.added,
        duplicates: response.summary.duplicates,
        similar: response.summary.similar,
        errors: response.summary.errors,
        skipped: 0,
      };

      if (pending.length === 0) {
        await finish();
        return;
      }
      setQueue(pending);
    },
    [finish],
  );

  const startImport = useCallback(
    async (files: readonly File[], source: ImportSource = 'drag_drop') => {
      if (files.length === 0 || busyRef.current) return;
      busyRef.current = true;
      setProgress({ total: files.length, ratio: 0, phase: 'upload' });
      try {
        const response = await api.importFiles(files, {
          sourceType: source,
          onProgress: (ratio) =>
            setProgress((prev) =>
              prev === null ? prev : { ...prev, ratio, phase: ratio >= 1 ? 'process' : 'upload' },
            ),
        });
        await consume(response, files);
      } catch (error) {
        const message =
          error instanceof api.ApiRequestError ? error.message : 'Не удалось импортировать файлы';
        toast({ title: message, tone: 'danger' });
      } finally {
        busyRef.current = false;
        setProgress(null);
      }
    },
    [consume, toast],
  );

  const importFromTransfer = useCallback(
    (data: DataTransfer | null, source: ImportSource) => {
      if (!data) return;
      const files = Array.from(data.files);
      if (files.length === 0) return;
      void startImport(files, source);
    },
    [startImport],
  );

  /** Ответ на одну модалку: досохранить файл или пропустить. Дальше — следующая. */
  const advanceQueue = useCallback(
    async (decision: 'confirm' | 'skip') => {
      const [current, ...rest] = queue;
      if (!current) return;
      if (current.localUrl) URL.revokeObjectURL(current.localUrl);

      if (decision === 'confirm' && current.item.pendingToken) {
        try {
          const response = await api.importConfirm({ pendingToken: current.item.pendingToken });
          totalsRef.current.added += response.summary.added;
          totalsRef.current.errors += response.summary.errors;
        } catch {
          totalsRef.current.errors += 1;
        }
      } else {
        totalsRef.current.skipped += 1;
      }

      setQueue(rest);
      if (rest.length === 0) await finish();
    },
    [queue, finish],
  );

  const value = useMemo<ImportValue>(
    () => ({ progress, startImport, importFromTransfer }),
    [progress, startImport, importFromTransfer],
  );

  const current = queue[0];

  return (
    <ImportContext.Provider value={value}>
      {children}

      <AnimatePresence>
        {progress ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: DUR_BASE, ease: EASE_OUT }}
            role="status"
            className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2"
          >
            <div className="flex h-11 w-[280px] flex-col justify-center gap-1.5 rounded-md bg-surface-overlay px-4 shadow-float">
              <div className="flex items-center justify-between">
                <span className="text-base text-ink">
                  {progress.phase === 'upload' ? 'Импорт' : 'Обрабатываем'}
                </span>
                <span className="font-mono text-xs text-ink-faint tabular-nums">
                  {progress.total} {progress.total === 1 ? 'файл' : 'файлов'}
                </span>
              </div>
              <span className="h-0.5 w-full overflow-hidden rounded-pill bg-surface-active">
                <motion.span
                  className="block h-full origin-left bg-accent"
                  initial={false}
                  animate={
                    progress.phase === 'upload'
                      ? { scaleX: Math.max(0.04, progress.ratio), opacity: 1 }
                      : { scaleX: 1, opacity: [1, 0.4, 1] }
                  }
                  transition={
                    progress.phase === 'upload'
                      ? { duration: 0.15, ease: 'linear' }
                      : { duration: 1.2, repeat: Infinity, ease: 'easeInOut' }
                  }
                />
              </span>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {current ? (
        <SimilarConfirmModal
          item={current.item}
          localUrl={current.localUrl}
          remaining={queue.length}
          onConfirm={() => void advanceQueue('confirm')}
          onSkip={() => void advanceQueue('skip')}
        />
      ) : null}
    </ImportContext.Provider>
  );
}
