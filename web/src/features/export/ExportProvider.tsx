/**
 * FDB-05 / FDB-11 — экспорт выбранных файлов в обычную папку на диске.
 * Макеты: D22 (сегмент «Экспорт» в панели выделения), D23 (кнопка в подвале
 * панели деталей), D24 (полка прогресса и тост результата), D25 (тост ошибки).
 *
 * Два режима:
 *  · в окне приложения папку выбирает системный диалог (`pickDirectory`), а
 *    копирует оригиналы сам сервер — это единственный способ положить файлы
 *    туда, куда попросили, не гоняя мегабайты через страницу;
 *  · в браузере нативного диалога нет вовсе, поэтому файлы уходят по одному в
 *    «Загрузки» (`GET /api/files/:id/original?download=1`).
 *
 * Прогресс. Серверный экспорт — один запрос на пачку, промежуточных событий у
 * него нет, поэтому список режется на куски: счётчик «3 из 7» двигается по мере
 * того, как куски отвечают. Коллизии имён это не ломает — их разводит сервер,
 * сверяясь с содержимым папки на каждый файл.
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
import type { FileExportFailure } from '@shared/api';
import * as api from '@/lib/api';
import { plural } from '@/lib/format';
import { DUR_BASE, EASE_OUT } from '@/lib/motion';
import { platformStrings } from '@/lib/platform';
import { isTauri, pickDirectory } from '@/lib/tauri';
import { useToast } from '@/components/ui/Toast';

/** Куда выгружали в прошлый раз — системный диалог откроется там же. */
const LAST_DIR_KEY = 'kopirka.export.lastDir';

/**
 * Сколько запросов максимум делаем на один экспорт. Меньше — счётчик стоит
 * на месте, больше — сервер молотит накладными расходами вместо копирования.
 */
const MAX_CHUNKS = 20;

/** Пауза между скачиваниями в браузере: залпом браузер их душит сам. */
const BROWSER_DOWNLOAD_GAP_MS = 150;

export interface ExportProgress {
  total: number;
  done: number;
}

export interface ExportValue {
  progress: ExportProgress | null;
  /** Запустить экспорт: сам спросит папку и сам отчитается тостами. */
  exportFiles: (fileIds: readonly number[]) => void;
  /** Экспорт уже идёт — второй запускать нельзя. */
  busy: boolean;
}

const ExportContext = createContext<ExportValue | null>(null);

export function useExport(): ExportValue {
  const value = useContext(ExportContext);
  if (!value) throw new Error('useExport: нет ExportProvider выше по дереву');
  return value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Имя папки для тоста: «7 файлов экспортированы в «Клиенту»» (D24). */
function folderLabel(dir: string): string {
  const parts = dir.split(/[\\/]/).filter((part) => part !== '');
  return parts.at(-1) ?? dir;
}

function readLastDir(): string | undefined {
  try {
    return window.localStorage.getItem(LAST_DIR_KEY) ?? undefined;
  } catch {
    // Приватный режим браузера: без памяти о прошлой папке жить можно.
    return undefined;
  }
}

function writeLastDir(dir: string): void {
  try {
    window.localStorage.setItem(LAST_DIR_KEY, dir);
  } catch {
    /* см. readLastDir */
  }
}

export function ExportProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);

  const notifyResult = useCallback(
    (exported: number, failed: readonly FileExportFailure[], place: string, reveal: (() => void) | null) => {
      if (exported > 0) {
        const noun = plural(exported, 'файл', 'файла', 'файлов');
        const verb = plural(exported, 'экспортирован', 'экспортированы', 'экспортированы');
        toast({
          title: `${exported} ${noun} ${verb} в «${place}»`,
          tone: 'success',
          ...(reveal === null
            ? {}
            : { action: { label: `Показать ${platformStrings().inFileManager}`, onClick: reveal } }),
        });
      }
      if (failed.length > 0) {
        const noun = plural(failed.length, 'файл', 'файла', 'файлов');
        toast({
          title: `Не удалось экспортировать ${failed.length} ${noun}`,
          tone: 'danger',
          details: failed.map((item) => `${item.name} — ${item.reason}`),
          // Разбираться с причинами за пять секунд нельзя — закрывает человек.
          duration: 0,
        });
      }
    },
    [toast],
  );

  /** Окно приложения: папку выбирает система, файлы копирует сервер. */
  const exportToFolder = useCallback(
    async (fileIds: readonly number[]) => {
      const targetDir = await pickDirectory({
        title: 'Куда выгрузить файлы',
        defaultPath: readLastDir(),
      });
      if (targetDir === null) return;
      writeLastDir(targetDir);

      const chunkSize = Math.max(1, Math.ceil(fileIds.length / MAX_CHUNKS));
      const failed: FileExportFailure[] = [];
      let exported = 0;

      setProgress({ total: fileIds.length, done: 0 });
      for (let index = 0; index < fileIds.length; index += chunkSize) {
        const slice = fileIds.slice(index, index + chunkSize);
        const result = await api.exportFiles({ fileIds: [...slice], targetDir });
        exported += result.exported;
        failed.push(...result.failed);
        setProgress({ total: fileIds.length, done: Math.min(fileIds.length, index + slice.length) });
      }

      notifyResult(exported, failed, folderLabel(targetDir), () => {
        void api.revealPath({ path: targetDir }).catch(() => {
          toast({ title: platformStrings().revealFailedToast, tone: 'danger' });
        });
      });
    },
    [notifyResult, toast],
  );

  /** Браузер: нативного диалога нет — забираем файлы по одному в «Загрузки». */
  const exportToDownloads = useCallback(
    async (fileIds: readonly number[]) => {
      setProgress({ total: fileIds.length, done: 0 });
      for (const [index, id] of fileIds.entries()) {
        const link = document.createElement('a');
        link.href = api.fileDownloadUrl(id);
        // Имя файла подставит сервер заголовком Content-Disposition.
        link.download = '';
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setProgress({ total: fileIds.length, done: index + 1 });
        if (index < fileIds.length - 1) await sleep(BROWSER_DOWNLOAD_GAP_MS);
      }
      notifyResult(fileIds.length, [], 'Загрузки', null);
    },
    [notifyResult],
  );

  const exportFiles = useCallback(
    (fileIds: readonly number[]) => {
      if (fileIds.length === 0 || busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      const ids = [...fileIds];
      const run = isTauri() ? exportToFolder(ids) : exportToDownloads(ids);
      void run
        .catch((cause: unknown) => {
          const message =
            cause instanceof api.ApiRequestError ? cause.message : 'Не удалось экспортировать файлы';
          toast({ title: message, tone: 'danger' });
        })
        .finally(() => {
          busyRef.current = false;
          setBusy(false);
          setProgress(null);
        });
    },
    [exportToFolder, exportToDownloads, toast],
  );

  const value = useMemo<ExportValue>(() => ({ progress, exportFiles, busy }), [progress, exportFiles, busy]);

  /*
    Полка прогресса — та же, что у импорта (`#kopirka-shelf`): её рисует сетка,
    поэтому элемент ищем в момент показа, а не на первом рендере провайдера.
  */
  const [shelf, setShelf] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setShelf(document.getElementById('kopirka-shelf'));
  }, []);
  useEffect(() => {
    if (progress === null) return;
    setShelf(document.getElementById('kopirka-shelf'));
  }, [progress]);

  /* Полка экспорта повторяет полку импорта R08 и узел «Тост · Экспортирую» D24. */
  const panel = progress ? (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: DUR_BASE, ease: EASE_OUT }}
      role="status"
      aria-label="Экспорт файлов"
      className={
        shelf ? 'flex w-full justify-center' : 'fixed bottom-6 left-1/2 z-50 -translate-x-1/2'
      }
    >
      <div className="glass flex w-[var(--size-import-shelf)] flex-col gap-2 rounded-card px-3.5 py-3 shadow-glass">
        <div className="flex items-center gap-2">
          <span className="text-md leading-[18px] font-medium text-ink">Экспортирую…</span>
          <span className="flex-1" />
          <span className="text-xs leading-[15px] text-ink-muted tabular-nums">
            {progress.done} из {progress.total}
          </span>
        </div>
        <span className="h-[var(--size-progress)] w-full overflow-clip rounded-pill bg-control">
          <motion.span
            className="block h-full origin-left rounded-pill bg-brand"
            initial={false}
            /* Минимум 4 %: нулевая полоса читается как «ничего не происходит». */
            animate={{ scaleX: Math.max(0.04, progress.total === 0 ? 0 : progress.done / progress.total) }}
            transition={{ duration: 0.15, ease: 'linear' }}
          />
        </span>
      </div>
    </motion.div>
  ) : null;

  return (
    <ExportContext.Provider value={value}>
      {children}
      {/* Полка внизу области контента, если сетка её завела; иначе панель висит сама. */}
      <AnimatePresence>{shelf && panel ? createPortal(panel, shelf) : panel}</AnimatePresence>
    </ExportContext.Provider>
  );
}
