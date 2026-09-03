/**
 * IMP-01 — «Похоже, это уже есть». Синхронный путь импорта: файл ещё не сохранён,
 * ждём решения. Точный дубль сюда не попадает — он только строка в сводном тосте.
 *
 * Канон — R14 · «Похоже, уже есть»: модалка 720, два кадра 320 × 200 с зазором 32,
 * над каждым — подпись заглавными, под каждым — техническая строка; у нового файла
 * кадр обведён лаймом 2 px. Внизу «Не импортировать» и «Импортировать всё равно».
 */
import { ImageOff } from 'lucide-react';
import type { FileRecord, ImportResultItem } from '@shared/api';
import { cn } from '@/lib/cn';
import { Icon } from '@/lib/icons';
import { Button } from '@/components/ui/Button';
import { Modal, ModalContent } from '@/components/ui/Modal';
import { formatBytes, formatDimensions, plural } from '@/lib/format';

/** Ширина модалки «Похоже, это уже есть» — два кадра 320 плюс зазор и поля (R14). */
const MODAL_WIDTH = 720;

function Frame({
  label,
  caption,
  url,
  accent,
}: {
  label: string;
  caption: string;
  url: string | null;
  accent?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <span className="label-section">{label}</span>
      {/* Кадры сравнивают целиком: object-contain, обрезки быть не должно (02 §4.19). */}
      <div
        className={cn(
          'flex h-[var(--size-similar-preview-h)] items-center justify-center overflow-clip rounded-card bg-raised p-2',
          /* Новый файл обведён лаймом 2 px — так видно, о каком из двух кадров речь. */
          accent && 'border-2 border-brand',
        )}
      >
        {url ? (
          <img
            src={url}
            alt={label}
            className="max-h-full max-w-full object-contain"
            decoding="async"
          />
        ) : (
          <Icon icon={ImageOff} size={20} className="text-ink-faint" aria-hidden />
        )}
      </div>
      <span className="text-xs leading-4 truncate text-ink-muted tabular-nums">{caption}</span>
    </div>
  );
}

function captionFor(file: FileRecord | undefined): string {
  if (!file) return '—';
  return `${file.originalFilename} · ${formatDimensions(file.width, file.height)} · ${formatBytes(file.sizeBytes)}`;
}

export interface SimilarConfirmModalProps {
  item: ImportResultItem;
  /** Локальный превью ещё не сохранённого файла. */
  localUrl: string | null;
  /** Сколько подтверждений осталось, включая текущее. */
  remaining: number;
  /** Папка, в которую шёл импорт; null — файл ляжет без папки. */
  folderName: string | null;
  onConfirm: () => void;
  onSkip: () => void;
}

export function SimilarConfirmModal({
  item,
  localUrl,
  remaining,
  folderName,
  onConfirm,
  onSkip,
}: SimilarConfirmModalProps) {
  const existing = item.existingFile;

  return (
    <Modal open onOpenChange={(open) => (open ? undefined : onSkip())}>
      <ModalContent
        width={MODAL_WIDTH}
        title="Похоже, это уже есть"
        description={
          remaining > 1
            ? `«${item.originalFilename}» похож на файл из библиотеки. Сравните и решите, оставлять ли оба. Ещё ${remaining - 1} ${plural(remaining - 1, 'файл ждёт', 'файла ждут', 'файлов ждут')} решения.`
            : `«${item.originalFilename}» похож на файл, который уже есть в библиотеке. Сравните и решите, оставлять ли оба.`
        }
        footer={
          <>
            <Button variant="secondary" onClick={onSkip}>
              Не импортировать
            </Button>
            <Button variant="primary" onClick={onConfirm}>
              Импортировать всё равно
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="flex gap-8">
            <Frame label="Новый файл" caption={item.originalFilename} url={localUrl} accent />
            <Frame
              label="Уже в библиотеке"
              caption={captionFor(existing)}
              url={existing?.previewUrl ?? null}
            />
          </div>
          {folderName ? (
            <p className="text-sm text-ink-muted">
              Файл попадёт в папку <span className="text-ink">«{folderName}»</span>.
            </p>
          ) : null}
        </div>
      </ModalContent>
    </Modal>
  );
}
