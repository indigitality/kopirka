/** Правая панель детального просмотра — раздел 3 спеки, сверху вниз. */
import { useEffect, useState } from 'react';
import { ExternalLink, Folder, Globe, ImageOff, RotateCcw, Trash2 } from 'lucide-react';
import type { FileRecord } from '@shared/api';
import * as api from '@/lib/api';
import { cn } from '@/lib/cn';
import { flattenFolders } from '@/lib/folders';
import {
  formatBytes,
  formatDate,
  formatDateTime,
  formatDimensions,
  hostAndPath,
  middleTruncate,
  sourceLabel,
} from '@/lib/format';
import { similarityPercent } from '@/lib/phash';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import { Select, type SelectOption } from '@/components/ui/Select';
import { Tag } from '@/components/ui/Tag';
import { useLibrary } from '@/features/library/LibraryProvider';
import { TagInput } from '@/features/library/TagInput';

/**
 * Раскладка библиотеки на диске (сервер, `paths.ts`): `originals/ab/cd/<sha256>.<ext>`.
 * API путь не отдаёт, а «ПОДРОБНОСТИ» его требуют — собираем по тем же правилам.
 */
function diskPath(libraryPath: string, file: FileRecord): string {
  const shard = `${file.sha256.slice(0, 2)}/${file.sha256.slice(2, 4)}`;
  const root = libraryPath === '' ? '…' : libraryPath;
  return `${root}/originals/${shard}/${file.sha256}.${file.ext}`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <span className="label-section">{title}</span>
      {children}
    </section>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="w-[92px] shrink-0 text-base text-ink-muted">{label}</span>
      <span className={cn('min-w-0 flex-1 truncate text-base text-ink', mono && 'font-mono text-xs')}>
        {value}
      </span>
    </div>
  );
}

/** Блок «Похоже на уже имеющийся» — IMP-01, показывается только при similarToFileId. */
function SimilarBlock({ file, onClose }: { file: FileRecord; onClose: () => void }) {
  const library = useLibrary();
  const [other, setOther] = useState<FileRecord | null>(null);

  useEffect(() => {
    let alive = true;
    if (file.similarToFileId === null) {
      setOther(null);
      return;
    }
    void api
      .getFile(file.similarToFileId)
      .then((record) => {
        if (alive) setOther(record);
      })
      .catch(() => {
        if (alive) setOther(null);
      });
    return () => {
      alive = false;
    };
  }, [file.similarToFileId]);

  const percent = other ? similarityPercent(file.phash, other.phash) : null;

  return (
    <div className="flex flex-col gap-3 rounded-md bg-surface-raised p-3">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-surface-active">
          {other?.previewUrl ? (
            <img
              src={other.previewUrl}
              alt={other.originalFilename}
              className="h-full w-full object-cover"
              decoding="async"
            />
          ) : (
            <ImageOff className="size-4 text-ink-faint" strokeWidth={1.5} aria-hidden />
          )}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-base font-medium text-ink">Похоже на уже имеющийся</span>
          {/* Строка длинная — переносим, а не режем: процент и дата одинаково важны. */}
          <span className="text-technical leading-tight">
            {percent !== null ? `совпадение ${percent}% · ` : ''}
            {other ? `добавлен ${formatDate(other.addedAt)}` : 'ищем оригинал…'}
          </span>
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={() => void library.resolveSimilar(file.id)}
        >
          Оставить оба
        </Button>
        <Button
          variant="secondary"
          className="flex-1"
          onClick={() => {
            void library.trashFiles([file.id]);
            onClose();
          }}
        >
          Удалить этот
        </Button>
      </div>
    </div>
  );
}

export interface DetailPanelProps {
  file: FileRecord;
  inTrash: boolean;
  onClose: () => void;
  onCopy: () => void;
  onReveal: () => void;
  onTrash: () => void;
  onRestore: () => void;
  onPurge: () => void;
}

export function DetailPanel({
  file,
  inTrash,
  onClose,
  onCopy,
  onReveal,
  onTrash,
  onRestore,
  onPurge,
}: DetailPanelProps) {
  const library = useLibrary();
  const [tagOpen, setTagOpen] = useState(false);

  const folderOptions: SelectOption<number | null>[] = [
    { value: null, label: 'Без папки' },
    ...flattenFolders(library.folders).map(({ folder, depth }) => ({
      value: folder.id,
      label: folder.name,
      depth,
      icon: <Folder className="size-3.5" strokeWidth={2} aria-hidden />,
    })),
  ];

  return (
    <aside
      className="flex h-full w-[var(--size-detail-panel)] shrink-0 flex-col rounded-xl bg-surface"
      aria-label="Свойства файла"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5">
        <header className="flex flex-col gap-1">
          <h2 className="truncate text-md font-medium text-ink" title={file.originalFilename}>
            {file.originalFilename}
          </h2>
          <span className="text-technical">
            {formatDimensions(file.width, file.height)} · {file.ext.toUpperCase()} ·{' '}
            {formatBytes(file.sizeBytes)}
          </span>
        </header>

        {file.sourceUrl ? (
          <Section title="Источник">
            <a
              href={file.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className={cn(
                'flex h-[var(--size-row)] items-center gap-2 rounded-md bg-surface-raised px-2.5',
                'text-base text-ink-muted transition-colors duration-[var(--dur-fast)] ease-out',
                'hover:bg-surface-hover hover:text-ink',
              )}
            >
              <Globe className="size-3.5 shrink-0 text-ink-faint" strokeWidth={2} aria-hidden />
              <span className="min-w-0 flex-1 truncate">{hostAndPath(file.sourceUrl)}</span>
              <ExternalLink className="size-3.5 shrink-0 text-ink-faint" strokeWidth={2} aria-hidden />
            </a>
          </Section>
        ) : null}

        <Section title="Папка">
          <Select
            value={file.folderId}
            onValueChange={(next) => void library.moveToFolder([file.id], next)}
            options={folderOptions}
            icon={<Folder className="size-3.5" strokeWidth={2} aria-hidden />}
            placeholder="Без папки"
            disabled={inTrash}
          />
        </Section>

        <Section title="Теги">
          <div className="flex flex-wrap gap-1.5">
            {file.tags.map((tag) => (
              <Tag
                key={tag}
                onRemove={inTrash ? undefined : () => void library.removeTags([file.id], [tag])}
              >
                {tag}
              </Tag>
            ))}
            {inTrash ? null : (
              <Popover open={tagOpen} onOpenChange={setTagOpen}>
                <PopoverTrigger asChild>
                  <Tag dashed className="cursor-pointer">
                    + тег
                  </Tag>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[260px] p-3">
                  <TagInput
                    known={library.tags.map((item) => item.name)}
                    exclude={file.tags}
                    onSubmit={(tag) => void library.addTags([file.id], [tag])}
                    onCancel={() => setTagOpen(false)}
                  />
                </PopoverContent>
              </Popover>
            )}
          </div>
        </Section>

        <Section title="Подробности">
          <div className="flex flex-col gap-1.5">
            <DetailRow label="Добавлено" value={formatDateTime(file.addedAt)} />
            <DetailRow label="Как попал" value={sourceLabel(file.sourceType)} />
            <DetailRow
              label="На диске"
              mono
              value={middleTruncate(diskPath(library.libraryPath, file), 44)}
            />
          </div>
        </Section>

        {file.similarToFileId !== null ? <SimilarBlock file={file} onClose={onClose} /> : null}
      </div>

      <footer className="flex shrink-0 items-center gap-2 border-t border-line p-4">
        {inTrash ? (
          <>
            <Button
              variant="primary"
              className="flex-1"
              icon={<RotateCcw className="size-4" strokeWidth={2} />}
              onClick={onRestore}
            >
              Восстановить
            </Button>
            <Button variant="danger" onClick={onPurge}>
              Удалить навсегда
            </Button>
          </>
        ) : (
          <>
            <Button variant="primary" className="flex-1" hotkey="⌘C" onClick={onCopy}>
              Скопировать
            </Button>
            <Button variant="secondary" onClick={onReveal}>
              В Finder
            </Button>
            <IconButton label="В корзину" variant="danger" onClick={onTrash}>
              <Trash2 className="size-4" strokeWidth={2} aria-hidden />
            </IconButton>
          </>
        )}
      </footer>
    </aside>
  );
}
