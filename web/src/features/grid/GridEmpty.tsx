/** Пустые состояния сетки. У каждого среза свой смысл — общей заглушки быть не должно. */
import { CheckCheck, FolderOpen, ImageDown, SearchX, ServerCrash, Trash2 } from 'lucide-react';
import type { LibraryScope } from '@shared/api';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';

export interface GridEmptyProps {
  scope: LibraryScope;
  /** Открыта конкретная папка. */
  inFolder: boolean;
  /** Задан поиск или фильтры — «ничего не нашлось», а не «пусто». */
  filtered: boolean;
  onResetSearch: () => void;
  /** Открыть системный диалог выбора файлов — тот же путь импорта, что и drag&drop. */
  onPickFiles: () => void;
}

export function GridEmpty({ scope, inFolder, filtered, onResetSearch, onPickFiles }: GridEmptyProps) {
  if (filtered) {
    return (
      <EmptyState
        className="h-full"
        icon={<SearchX className="size-5" strokeWidth={1.75} />}
        title="Ничего не нашлось"
        description="Попробуйте другой запрос или снимите фильтры — возможно, файл лежит в другом разделе."
        action={
          <Button variant="secondary" onClick={onResetSearch}>
            Сбросить поиск
          </Button>
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
        title="Всё разобрано"
        description="У каждого файла есть папка и хотя бы один тег. Новые импорты будут появляться здесь."
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
