/**
 * LIB-02 — детальный просмотр. Оверлей поверх размытой сетки, без сайдбара (§3 спеки).
 * Листание `←` / `→` идёт по текущему отфильтрованному списку, а не по всей библиотеке.
 *
 * Раскладка — редизайн, артборд R09, узел «Просмотр — оверлей»: поле 24 вокруг
 * всего, панель деталей справа, между ней и колонкой картинки 12. Стрелки 40 px
 * стоят по краям колонки, картинке остаётся 56 (40 стрелки + 16 просвета).
 * Счётчик, стрелки и крестик — стекло; Paper `backdrop-filter` не рисует,
 * поэтому размытие здесь обязательно, иначе они читаются как мутные плашки.
 */
import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, ImageOff, X } from 'lucide-react';
import * as api from '@/lib/api';
import { cn } from '@/lib/cn';
import { Icon } from '@/lib/icons';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { IconButton } from '@/components/ui/IconButton';
import { glassLayerMotion, scrimMotion } from '@/components/ui/motion-presets';
import { useToast } from '@/components/ui/Toast';
import { useLibrary, useOpenFile } from '@/features/library/LibraryProvider';
import { ConfirmDialog } from '@/features/grid/ConfirmDialog';
import { useViewSelector, viewActions } from '@/store/view';
import { DetailPanel } from './DetailPanel';

/** Круглая стеклянная стрелка 40 px по краю колонки с картинкой (R09). */
const ARROW = 'pointer-events-auto absolute disabled:opacity-30';

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
          className="fixed inset-0 z-50 bg-scrim backdrop-blur-[var(--blur-scrim)]"
          onMouseDown={(event) => {
            // Клик по скриму закрывает; клики внутри панели и по картинке — нет.
            if (event.target === event.currentTarget) close();
          }}
        >
          <div className="pointer-events-none flex h-full w-full gap-3 p-[var(--detail-pad)]">
            {/* Изображение */}
            <div className="relative flex min-w-0 flex-1 items-center justify-center px-[var(--detail-arrow-lane)]">
              {/* Счётчик — стекло без обводки: рамки у него в макете нет. */}
              <span
                className={cn(
                  'pointer-events-auto absolute top-0 left-0 flex h-[var(--size-tooltip)] items-center rounded-md px-2',
                  'bg-raised-glass backdrop-blur-[var(--blur-glass)]',
                  'text-xs tracking-[0.02em] text-ink-muted tabular-nums',
                )}
              >
                {index + 1} / {library.total}
              </span>

              <IconButton
                variant="glass"
                size="lg"
                shape="round"
                label="Предыдущий файл"
                disabled={!hasPrev}
                onClick={() => step(-1)}
                className={cn(ARROW, 'left-0')}
              >
                <Icon icon={ChevronLeft} size={16} aria-hidden />
              </IconButton>

              {file.isBroken ? (
                <div className="pointer-events-auto flex flex-col items-center gap-3 text-ink-faint">
                  <Icon icon={ImageOff} size={32} aria-hidden />
                  <span className="text-base">Превью не удалось построить — файл битый</span>
                </div>
              ) : (
                <img
                  key={file.id}
                  src={file.originalUrl}
                  alt={file.originalFilename}
                  decoding="async"
                  className="pointer-events-auto max-h-full max-w-full rounded-card object-contain"
                />
              )}

              <IconButton
                variant="glass"
                size="lg"
                shape="round"
                label="Следующий файл"
                disabled={!hasNext}
                onClick={() => step(1)}
                className={cn(ARROW, 'right-0')}
              >
                <Icon icon={ChevronRight} size={16} aria-hidden />
              </IconButton>
            </div>

            {/*
              Крестик — 32×32 стекло в правом верхнем углу панели деталей
              (поле панели 20 внутри поля оверлея 24 — итого 44 от края окна).
            */}
            <IconButton
              variant="glass"
              label="Закрыть просмотр"
              onClick={close}
              className="pointer-events-auto absolute top-11 right-11 z-20"
            >
              <Icon icon={X} size={16} aria-hidden />
            </IconButton>

            {/* Правая панель */}
            <motion.div
              {...glassLayerMotion({ from: 'right', reduced })}
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
