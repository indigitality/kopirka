/** Пустые состояния сетки. У каждого среза свой смысл — общей заглушки быть не должно. */
import { CheckCheck, FolderOpen, ImageDown, SearchX, ServerCrash, Trash2 } from 'lucide-react';
import type { LibraryScope, TagRecord } from '@shared/api';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { plural } from '@/lib/format';

export interface GridEmptyProps {
  scope: LibraryScope;
  /** Открыта конкретная папка. */
  inFolder: boolean;
  /** Задан поиск или фильтры — «ничего не нашлось», а не «пусто». */
  filtered: boolean;
  /** Строка поиска совпала с существующим тегом — поиск по имени его не найдёт. */
  tagMatch?: TagRecord | null;
  onShowTag?: (tag: string) => void;
  onResetSearch: () => void;
  /** Открыть системный диалог выбора файлов — тот же путь импорта, что и drag&drop. */
  onPickFiles: () => void;
}

export function GridEmpty({
  scope,
  inFolder,
  filtered,
  tagMatch,
  onShowTag,
  onResetSearch,
  onPickFiles,
}: GridEmptyProps) {
  if (filtered) {
    return (
      <EmptyState
        className="h-full"
        icon={<SearchX className="size-5" strokeWidth={1.75} />}
        title="Ничего не нашлось"
        description={
          tagMatch
            ? 'Поиск смотрит на имена файлов, а такой тег в библиотеке есть.'
            : 'Попробуйте другой запрос или снимите фильтры — возможно, файл лежит в другом разделе.'
        }
        action={
          tagMatch && onShowTag ? (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button variant="primary" onClick={() => onShowTag(tagMatch.name)}>
                {`Похоже, это тег. Показать ${tagMatch.fileCount} ${plural(tagMatch.fileCount, 'файл', 'файла', 'файлов')} с тегом «${tagMatch.name}»`}
              </Button>
              <Button variant="ghost" onClick={onResetSearch}>
                Сбросить поиск
              </Button>
            </div>
          ) : (
            <Button variant="secondary" onClick={onResetSearch}>
              Сбросить поиск
            </Button>
          )
        }
      />
    );
  }

  if (scope === 'trash') {
    return (
      <EmptyState
        className="h-full"
        icon={<Trash2 className="size-5" strokeWidth={1.75} />}
        title="Корзина пуста"
        description="Удалённые файлы лежат здесь 30 дней, а потом стираются с диска сами."
      />
    );
  }

  if (scope === 'untagged') {
    return (
      <EmptyState
        className="h-full"
        icon={<CheckCheck className="size-5" strokeWidth={1.75} />}
        title="Все файлы разложены по папкам"
        description="Сюда попадают файлы без папки. Новые импорты будут появляться здесь."
      />
    );
  }

  if (inFolder) {
    return (
      <EmptyState
        className="h-full"
        icon={<FolderOpen className="size-5" strokeWidth={1.75} />}
        title="В папке пусто"
        description="Перетащите сюда карточки из библиотеки или добавьте новые изображения."
        action={
          <Button variant="secondary" onClick={onPickFiles}>
            Выбрать файлы
          </Button>
        }
      />
    );
  }

  return (
    <EmptyState
      className="h-full"
      icon={<ImageDown className="size-5" strokeWidth={1.75} />}
      title="Библиотека пуста"
      description="Перетащите изображения в окно, вставьте из буфера через ⌘V или сохраните картинку из браузера через «Сохранить в Копирку»."
      action={
        <Button variant="primary" onClick={onPickFiles}>
          Выбрать файлы
        </Button>
      }
    />
  );
}

export function GridError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <EmptyState
      className="h-full"
      icon={<ServerCrash className="size-5" strokeWidth={1.75} />}
      title="Не удалось загрузить библиотеку"
      description={message}
      action={
        <Button variant="secondary" onClick={onRetry}>
          Повторить
        </Button>
      }
    />
  );
}
