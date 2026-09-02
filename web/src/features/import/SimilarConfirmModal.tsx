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
      {/* Кадры сравнивают целиком: object-contain, обрезки быть не должно (02 §4.19). */}
      <div
        className={
          accent
            ? 'flex h-[200px] items-center justify-center overflow-hidden rounded-md bg-surface-raised p-2 shadow-card-selected'
            : 'flex h-[200px] items-center justify-center overflow-hidden rounded-md bg-surface-raised p-2'
        }
      >
        {url ? (
          <img
            src={url}
            alt={label}
            className="max-h-full max-w-full object-contain"
            decoding="async"
          />
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
        width={560}
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
        <div className="flex flex-col gap-3">
          <div className="flex gap-4">
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
