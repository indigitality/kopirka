/**
 * IMP-01 — «Похоже, уже есть». Синхронный путь импорта: файл ещё не сохранён,
 * ждём решения. Точный дубль сюда не попадает — он только строка в сводном тосте.
 */
import { ImageOff } from 'lucide-react';
import type { FileRecord, ImportResultItem } from '@shared/api';
import { Button } from '@/components/ui/Button';
import { Modal, ModalContent } from '@/components/ui/Modal';
import { formatBytes, formatDate, formatDimensions, plural } from '@/lib/format';

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
      <div
        className={
          accent
            ? 'flex aspect-square items-center justify-center overflow-hidden rounded-md bg-surface-raised shadow-card-selected'
            : 'flex aspect-square items-center justify-center overflow-hidden rounded-md bg-surface-raised'
        }
      >
        {url ? (
          <img src={url} alt={label} className="h-full w-full object-cover" decoding="async" />
        ) : (
          <ImageOff className="size-5 text-ink-faint" strokeWidth={1.5} aria-hidden />
        )}
      </div>
      <span className="text-technical truncate">{caption}</span>
    </div>
  );
}

function captionFor(file: FileRecord | undefined): string {
  if (!file) return '—';
  return `${formatDimensions(file.width, file.height)} · ${formatBytes(file.sizeBytes)} · ${formatDate(file.addedAt)}`;
}

export interface SimilarConfirmModalProps {
  item: ImportResultItem;
  /** Локальный превью ещё не сохранённого файла. */
  localUrl: string | null;
  /** Сколько подтверждений осталось, включая текущее. */
  remaining: number;
  onConfirm: () => void;
  onSkip: () => void;
}

export function SimilarConfirmModal({
  item,
  localUrl,
  remaining,
  onConfirm,
  onSkip,
}: SimilarConfirmModalProps) {
  const existing = item.existingFile;

  return (
    <Modal open onOpenChange={(open) => (open ? undefined : onSkip())}>
      <ModalContent
        width={520}
        title="Похоже, уже есть"
        description={
          remaining > 1
            ? `«${item.originalFilename}» похож на файл из библиотеки. Ещё ${remaining - 1} ${plural(remaining - 1, 'файл ждёт', 'файла ждут', 'файлов ждут')} решения.`
            : `«${item.originalFilename}» похож на файл, который уже есть в библиотеке.`
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
        <div className="flex gap-4">
          <Frame label="Новый файл" caption={item.originalFilename} url={localUrl} accent />
          <Frame
            label="Уже в библиотеке"
            caption={captionFor(existing)}
            url={existing?.previewUrl ?? null}
          />
        </div>
      </ModalContent>
    </Modal>
  );
}
