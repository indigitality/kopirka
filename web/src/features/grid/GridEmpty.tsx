/**
 * Пустые состояния сетки. У каждого среза свой смысл — общей заглушки быть не должно.
 * Канон — R12 «Пустые состояния»: семь образцов, тексты и кнопки сняты с узлов.
 */
import { CheckCheck, FolderOpen, Image, SearchX, ServerCrash, Trash2 } from 'lucide-react';
import type { LibraryScope, TagRecord } from '@shared/api';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/lib/icons';
import { plural } from '@/lib/format';
import { hotkeyLabel } from '@/lib/platform';

/**
 * Пустое состояние занимает всю свободную высоту панели: сетка живёт в колонке
 * `flex`, и без `flex-1` заглушка прилипла бы к заголовку контента.
 */
const SLOT = 'min-h-0 flex-1';

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
  // Образцы 1 и 2 R12: поиск ничего не нашёл; второй — когда запрос совпал с именем тега.
  if (filtered) {
    return (
      <EmptyState
        className={SLOT}
        icon={<Icon icon={SearchX} size={20} aria-hidden />}
        title="Ничего не нашлось"
        description={
          tagMatch
            ? 'Поиск смотрит на имена файлов, а такой тег в библиотеке есть.'
            : 'Попробуйте другой запрос или снимите фильтры — возможно, файл лежит в другом разделе.'
        }
        action={
          tagMatch && onShowTag ? (
            <>
              <Button variant="primary" onClick={() => onShowTag(tagMatch.name)}>
                {`Показать ${tagMatch.fileCount} ${plural(tagMatch.fileCount, 'файл', 'файла', 'файлов')} с тегом «${tagMatch.name}»`}
              </Button>
              <Button variant="ghost" onClick={onResetSearch}>
                Сбросить поиск
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={onResetSearch}>
              Сбросить поиск
            </Button>
          )
        }
      />
    );
  }

  // Образец 3: срез «Корзина», кнопок нет — здесь нечего делать.
  if (scope === 'trash') {
    return (
      <EmptyState
        className={SLOT}
        icon={<Icon icon={Trash2} size={20} aria-hidden />}
        title="Корзина пуста"
        description="Удалённые файлы лежат здесь 30 дней, а потом стираются с диска сами."
      />
    );
  }

  // Образец 4: срез «Не разобрано» — файлов без папки нет.
  if (scope === 'untagged') {
    return (
      <EmptyState
        className={SLOT}
        icon={<Icon icon={CheckCheck} size={20} aria-hidden />}
        title="Все файлы разложены по папкам"
        description="Сюда попадают файлы без папки. Новые импорты будут появляться здесь."
      />
    );
  }

  // Образец 5: выбрана папка, в ней пусто.
  if (inFolder) {
    return (
      <EmptyState
        className={SLOT}
        icon={<Icon icon={FolderOpen} size={20} aria-hidden />}
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

  // Образец 6: вся библиотека, файлов нет вовсе — единственная лаймовая кнопка.
  return (
    <EmptyState
      className={SLOT}
      icon={<Icon icon={Image} size={20} aria-hidden />}
      title="Библиотека пуста"
      description={`Перетащите изображения в окно, вставьте из буфера через ${hotkeyLabel('⌘V')} или сохраните картинку из браузера через «Сохранить в Копирку».`}
      action={
        <Button variant="primary" onClick={onPickFiles}>
          Выбрать файлы
        </Button>
      }
    />
  );
}

/** Образец 7 R12: сервер не ответил. Иконка и заголовок — цветом ошибки. */
export function GridError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <EmptyState
      className={SLOT}
      tone="danger"
      icon={<Icon icon={ServerCrash} size={20} aria-hidden />}
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
