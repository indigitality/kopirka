/**
 * Правая панель детального просмотра — раздел 3 спеки, сверху вниз.
 *
 * Внешний вид — редизайн, артборд R09, узел «Панель деталей»: панель `panel`
 * шириной `--size-detail-panel` с радиусом 24, тело с полем 20 и зазором 20,
 * подвал с линией от края до края. Все подложки внутри — полупрозрачный
 * `control`; акцентных кнопок в панели нет вовсе, включая «Скопировать».
 */
import { useEffect, useState } from 'react';
import { Copy, ExternalLink, Folder, Globe, ImageOff, RotateCcw, Trash2 } from 'lucide-react';
import type { FileRecord, SourceType } from '@shared/api';
import { PHASH_MAX_DISTANCE } from '@shared/api';
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
import { Icon } from '@/lib/icons';
import { similarityPercent } from '@/lib/phash';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import { Select, type SelectOption } from '@/components/ui/Select';
import { Tooltip } from '@/components/ui/Tooltip';
import { useToast } from '@/components/ui/Toast';
import { useLibrary } from '@/features/library/LibraryProvider';
import { TagInput } from '@/features/library/TagInput';
import { viewActions } from '@/store/view';

/**
 * Ниже этого процента цифру не показываем: порог похожести — 10 бит из 64,
 * то есть 84%. Меньшее число на экране подрывает доверие ко всей функции (02 §7).
 */
const MIN_SHOWN_PERCENT = Math.round(((64 - PHASH_MAX_DISTANCE) / 64) * 100);

/** Для этих источников в sourceUrl лежит адрес страницы, а не самой картинки. */
const PAGE_SOURCES: readonly SourceType[] = ['context_menu', 'tab_screenshot', 'area_screenshot'];

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

/**
 * Строка «свойство → значение» раздела «ПОДРОБНОСТИ»: подпись слева прижата
 * к левому краю, значение — к правому (узел «Подробности», R09).
 */
function DetailRow({ label, value, technical }: { label: string; value: string; technical?: boolean }) {
  return (
    <div className="flex h-7 items-center justify-between gap-3">
      <span className="shrink-0 text-base text-ink-muted">{label}</span>
      <span
        className={cn(
          'min-w-0 truncate text-right text-base text-ink',
          technical && 'text-xs tabular-nums',
        )}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Иконочное действие внутри строки контрола: своей подложки не имеет,
 * отзывается цветом (строка «Источник», R09).
 */
function RowAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'flex size-4 shrink-0 items-center justify-center text-ink-muted',
        'transition-colors duration-[var(--dur-fast)] ease-out hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

/** Блок «Похоже, это уже есть» — IMP-01, показывается только при similarToFileId. */
function SimilarBlock({
  file,
  inTrash,
  onTrash,
}: {
  file: FileRecord;
  inTrash: boolean;
  onTrash: () => void;
}) {
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
  const match =
    percent !== null && percent >= MIN_SHOWN_PERCENT ? `совпадение ${percent}%` : 'похожие кадры';

  const openOther = () => {
    if (!other) return;
    // Похожий файл может лежать в другой папке — тогда сначала выходим в библиотеку.
    if (!library.files.some((item) => item.id === other.id)) viewActions.setScope('library');
    viewActions.openFile(other.id);
  };

  const thumb = (
    <>
      {other?.previewUrl ? (
        <img
          src={other.previewUrl}
          alt={other.originalFilename}
          className="size-full rounded-md object-cover"
          decoding="async"
        />
      ) : (
        <Icon icon={ImageOff} size={16} className="text-ink-faint" aria-hidden />
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-2.5 rounded-card bg-control p-3">
      <div className="flex items-center gap-2.5">
        {/*
          Превью 44×44 (узел «Похоже, это уже есть», R09). Оно же — вход в тот
          файл: отдельной ссылки «Открыть тот файл» редизайн не оставил, а
          возможность уйти к оригиналу терять нельзя.
        */}
        {other ? (
          <Tooltip content="Открыть тот файл" side="right">
            <button
              type="button"
              aria-label="Открыть тот файл"
              onClick={openOther}
              className={cn(
                'flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-control',
                'transition-shadow duration-[var(--dur-fast)] ease-out',
                'hover:shadow-[0_0_0_2px_var(--color-brand)]',
              )}
            >
              {thumb}
            </button>
          </Tooltip>
        ) : (
          <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-control">
            {thumb}
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-md font-medium text-ink">Похоже, это уже есть</span>
          <span className="truncate text-2xs text-ink-muted tabular-nums">
            {other ? `${match} · добавлен ${formatDate(other.addedAt)}` : 'ищем оригинал…'}
          </span>
        </div>
      </div>
      {inTrash ? null : (
        <div className="flex items-center gap-2">
          {/* Обе кнопки тихие: выбор здесь равноправный, подталкивать лаймом нечего. */}
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => void library.resolveSimilar(file.id)}
          >
            Это не дубль
          </Button>
          <Button variant="danger" onClick={onTrash}>
            Удалить этот
          </Button>
        </div>
      )}
    </div>
  );
}

export interface DetailPanelProps {
  file: FileRecord;
  inTrash: boolean;
  onCopy: () => void;
  onReveal: () => void;
  onTrash: () => void;
  onRestore: () => void;
  onPurge: () => void;
}

export function DetailPanel({
  file,
  inTrash,
  onCopy,
  onReveal,
  onTrash,
  onRestore,
  onPurge,
}: DetailPanelProps) {
  const library = useLibrary();
  const { toast } = useToast();
  const [tagOpen, setTagOpen] = useState(false);

  const folderOptions: SelectOption<number | null>[] = [
    { value: null, label: 'Без папки' },
    ...flattenFolders(library.folders).map(({ folder, depth }) => ({
      value: folder.id,
      label: folder.name,
      depth,
      icon: <Icon icon={Folder} size={16} className="text-ink-muted" aria-hidden />,
    })),
  ];

  return (
    <aside
      className="flex h-full w-[var(--size-detail-panel)] shrink-0 flex-col overflow-hidden rounded-panel bg-panel"
      aria-label="Свойства файла"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5">
        <header className="flex flex-col gap-1.25">
          {/* Крестик закрытия стоит в правом верхнем углу панели — не наезжаем на него. */}
          <h2
            className="truncate pr-10 text-md leading-5 font-medium tracking-tight text-ink"
            title={file.originalFilename}
          >
            {file.originalFilename}
          </h2>
          <span className="text-technical">
            {formatDimensions(file.width, file.height)} · {file.ext.toUpperCase()} ·{' '}
            {formatBytes(file.sizeBytes)}
          </span>
        </header>

        {file.sourceUrl ? (
          <Section title="Источник">
            {/* Строка-контрол 34 px: адрес и два действия живут на одной подложке. */}
            <div className="flex h-[var(--size-field)] items-center gap-2 rounded-md bg-control px-2.5">
              <a
                href={file.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                title={file.sourceUrl}
                className={cn(
                  'flex min-w-0 flex-1 items-center gap-2 text-base text-ink',
                  'transition-colors duration-[var(--dur-fast)] ease-out hover:text-brand',
                )}
              >
                <Icon icon={Globe} size={16} className="shrink-0 text-ink-muted" aria-hidden />
                {/* Для картинки из браузера в базе лежит адрес страницы, а не файла — говорим прямо. */}
                {PAGE_SOURCES.includes(file.sourceType) ? (
                  <span className="shrink-0 text-ink-faint">Страница:</span>
                ) : null}
                <span className="min-w-0 flex-1 truncate">{hostAndPath(file.sourceUrl)}</span>
                <Icon icon={ExternalLink} size={16} className="shrink-0 text-ink-muted" aria-hidden />
              </a>
              {/* В окне приложения ссылка открывается десктопным слоем; копия работает всегда. */}
              <RowAction
                label="Скопировать адрес"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(file.sourceUrl ?? '')
                    .then(() => toast({ title: 'Адрес скопирован', tone: 'success' }))
                    .catch(() => toast({ title: 'Не удалось скопировать адрес', tone: 'danger' }));
                }}
              >
                <Icon icon={Copy} size={16} aria-hidden />
              </RowAction>
            </div>
          </Section>
        ) : null}

        <Section title="Папка">
          <Select
            value={file.folderId}
            onValueChange={(next) => void library.moveToFolder([file.id], next)}
            options={folderOptions}
            icon={<Icon icon={Folder} size={16} className="text-ink-muted" aria-hidden />}
            placeholder="Без папки"
            disabled={inTrash}
          />
        </Section>

        <Section title="Теги">
          <div className="flex flex-wrap gap-1.5">
            {/* Клик по пилюле — «покажи всё с этим тегом»: путь «добавил → нашёл» (01 п.2). */}
            {file.tags.map((tag) => (
              <Chip
                key={tag}
                as="button"
                variant="control"
                title={`Показать всё с тегом «${tag}»`}
                onClick={() => viewActions.showTag(tag)}
                onRemove={inTrash ? undefined : () => void library.removeTags([file.id], [tag])}
                removeLabel={`Убрать тег «${tag}»`}
              >
                {tag}
              </Chip>
            ))}
            {inTrash ? null : (
              <Popover open={tagOpen} onOpenChange={setTagOpen}>
                <PopoverTrigger asChild>
                  <Chip as="button" variant="outline">
                    + тег
                  </Chip>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[var(--size-tag-popover)] p-3">
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

        {/* Дубль — вопрос, требующий решения: он выше справочных «Подробностей» (02 §7). */}
        {file.similarToFileId !== null ? (
          <SimilarBlock file={file} inTrash={inTrash} onTrash={onTrash} />
        ) : null}

        <Section title="Подробности">
          <div className="flex flex-col gap-1">
            <DetailRow label="Добавлено" value={formatDateTime(file.addedAt)} />
            <DetailRow label="Как попал" value={sourceLabel(file.sourceType)} />
            <DetailRow
              label="На диске"
              technical
              value={middleTruncate(diskPath(library.libraryPath, file), 44)}
            />
          </div>
        </Section>

        {/* Распорка: подвал прижат к низу даже у файла без источника и тегов. */}
        <div className="flex-1" />
      </div>

      {/* Линия подвала идёт от края до края панели цветом обводки (узел «Подвал панели», R09). */}
      <footer className="flex shrink-0 flex-col gap-4 pb-5">
        <div className="h-px w-full shrink-0 bg-line-strong" />
        <div className="flex items-center gap-2 px-5">
          {inTrash ? (
            <>
              <Button
                variant="secondary"
                className="flex-1"
                icon={<Icon icon={RotateCcw} size={16} aria-hidden />}
                onClick={onRestore}
              >
                Восстановить
              </Button>
              {/* Необратимое подтверждается модалкой — здесь мягкая опасная. */}
              <Button variant="danger" onClick={onPurge}>
                Удалить навсегда
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                className="flex-1 gap-1.5"
                hotkey="⌘C"
                onClick={onCopy}
              >
                Скопировать
              </Button>
              <Button variant="secondary" onClick={onReveal}>
                В Finder
              </Button>
              <IconButton label="В корзину" variant="danger" onClick={onTrash}>
                <Icon icon={Trash2} size={16} aria-hidden />
              </IconButton>
            </>
          )}
        </div>
      </footer>
    </aside>
  );
}
