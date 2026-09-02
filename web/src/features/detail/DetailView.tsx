/**
 * LIB-02 — детальный просмотр. Оверлей поверх размытой сетки, без сайдбара (§3 спеки).
 * Листание `←` / `→` идёт по текущему отфильтрованному списку, а не по всей библиотеке.
 */
import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, ImageOff, X } from 'lucide-react';
import * as api from '@/lib/api';
import { cn } from '@/lib/cn';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { IconButton } from '@/components/ui/IconButton';
import { layerMotion, scrimMotion } from '@/components/ui/motion-presets';
import { useToast } from '@/components/ui/Toast';
import { useLibrary, useOpenFile } from '@/features/library/LibraryProvider';
import { ConfirmDialog } from '@/features/grid/ConfirmDialog';
import { useViewSelector, viewActions } from '@/store/view';
import { DetailPanel } from './DetailPanel';

const ARROW =
  'flex size-10 items-center justify-center rounded-pill bg-surface-overlay text-ink ' +
  'transition-colors duration-[var(--dur-fast)] ease-out hover:bg-surface-active ' +
  'disabled:pointer-events-none disabled:opacity-30';

export function DetailView() {
  const library = useLibrary();
  const { toast } = useToast();
  const scope = useViewSelector((s) => s.scope);
  const openFileId = useViewSelector((s) => s.openFileId);
  const { file, index } = useOpenFile();
  const [purgeOpen, setPurgeOpen] = useState(false);
  const reduced = useReducedMotion();

  const close = useCallback(() => viewActions.openFile(null), []);

  // Файл уехал из среза (сменили папку, удалили) — оставлять пустой оверлей нельзя.
  // Небольшая пауза: при переходе к файлу из другого среза список успевает начать грузиться,
  // и просмотр не схлопывается на полпути.
  useEffect(() => {
    if (openFileId === null || file !== null || library.loading) return;
    const timer = window.setTimeout(close, 250);
    return () => window.clearTimeout(timer);
  }, [openFileId, file, library.loading, close]);

  const step = useCallback(
    (delta: 1 | -1) => {
      const next = library.files[index + delta];
      if (next) viewActions.openFile(next.id);
      else if (delta === 1 && library.hasMore) library.loadMore();
    },
    [library, index],
  );

  const notify = useCallback(
    (cause: unknown, fallback: string) => {
      const message = cause instanceof api.ApiRequestError ? cause.message : fallback;
      toast({ title: message, tone: 'danger' });
    },
    [toast],
  );

  const inTrash = scope === 'trash';
  const hasPrev = index > 0;
  const hasNext = index < library.files.length - 1 || library.hasMore;

  // `return null` выше AnimatePresence не давал проиграть выход — 02 §8.2.
  return (
    <AnimatePresence>
      {file ? (
        <motion.div
          key="detail"
          {...scrimMotion()}
          role="dialog"
          aria-modal="true"
          aria-label={`Просмотр «${file.originalFilename}»`}
          className="fixed inset-0 z-50 bg-scrim backdrop-blur-[8px]"
          onMouseDown={(event) => {
            // Клик по скриму закрывает; клики внутри панели и по картинке — нет.
            if (event.target === event.currentTarget) close();
          }}
        >
          <div className="pointer-events-none flex h-full w-full gap-4 p-4">
            {/* Изображение */}
            <div className="relative flex min-w-0 flex-1 items-center justify-center">
              <span className="pointer-events-auto absolute top-0 left-0 rounded-xs bg-surface-overlay px-2 py-1 font-mono text-xs text-ink-muted tabular-nums">
                {index + 1} / {library.total}
              </span>

              <button
                type="button"
                aria-label="Предыдущий файл"
                disabled={!hasPrev}
                onClick={() => step(-1)}
                className={cn(ARROW, 'pointer-events-auto absolute left-0')}
              >
                <ChevronLeft className="size-5" strokeWidth={2} aria-hidden />
              </button>

              <div className="pointer-events-auto flex max-h-full max-w-full items-center justify-center px-16 py-4">
                {file.isBroken ? (
                  <div className="flex flex-col items-center gap-3 text-ink-faint">
                    <ImageOff className="size-8" strokeWidth={1.5} aria-hidden />
                    <span className="text-base">Превью не удалось построить — файл битый</span>
                  </div>
                ) : (
                  <img
                    key={file.id}
                    src={file.originalUrl}
                    alt={file.originalFilename}
                    decoding="async"
                    className="max-h-[calc(100vh-6rem)] max-w-full rounded-md object-contain"
                  />
                )}
              </div>

              <button
                type="button"
                aria-label="Следующий файл"
                disabled={!hasNext}
                onClick={() => step(1)}
                className={cn(ARROW, 'pointer-events-auto absolute right-0')}
              >
                <ChevronRight className="size-5" strokeWidth={2} aria-hidden />
              </button>
            </div>

            {/* Крестик — правый верх экрана, 32×32 (DESIGN-SPEC §3). */}
            <IconButton
              label="Закрыть просмотр"
              onClick={close}
              className="pointer-events-auto absolute top-4 right-4 z-20 bg-surface-overlay"
            >
              <X className="size-4" strokeWidth={2} aria-hidden />
            </IconButton>

            {/* Правая панель */}
            <motion.div
              {...layerMotion({ y: 8, reduced })}
              className="pointer-events-auto relative flex h-full shrink-0 items-stretch"
            >
              <DetailPanel
                file={file}
                inTrash={inTrash}
                onCopy={() => {
                  void api
                    .copyFile(file.id)
                    .then(() => toast({ title: 'Скопировано в буфер', tone: 'success' }))
                    .catch((cause: unknown) => notify(cause, 'Не удалось скопировать файл'));
                }}
                onReveal={() => {
                  void api
                    .revealFile(file.id)
                    .catch((cause: unknown) => notify(cause, 'Не удалось открыть Finder'));
                }}
                onTrash={() => {
                  const ids = [file.id];
                  void library
                    .trashFiles(ids)
                    .then(() => {
                      close();
                      toast({
                        title: 'Файл в корзине',
                        action: {
                          label: 'Отменить',
                          onClick: () => void library.restoreFiles(ids).catch(() => undefined),
                        },
                      });
                    })
                    .catch((cause: unknown) => notify(cause, 'Не удалось удалить файл'));
                }}
                onRestore={() => {
                  void library
                    .restoreFiles([file.id])
                    .then(() => {
                      close();
                      toast({ title: 'Файл вернулся в библиотеку', tone: 'success' });
                    })
                    .catch((cause: unknown) => notify(cause, 'Не удалось восстановить файл'));
                }}
                onPurge={() => setPurgeOpen(true)}
              />
            </motion.div>
          </div>

          <ConfirmDialog
            open={purgeOpen}
            title="Удалить навсегда?"
            description="Файл будет стёрт с диска вместе с превью. Отменить это нельзя."
            confirmLabel="Удалить навсегда"
            onCancel={() => setPurgeOpen(false)}
            onConfirm={() => {
              setPurgeOpen(false);
              void library
                .purgeFiles([file.id])
                .then(() => {
                  close();
                  toast({ title: 'Удалено навсегда' });
                })
                .catch((cause: unknown) => notify(cause, 'Не удалось удалить файл'));
            }}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
