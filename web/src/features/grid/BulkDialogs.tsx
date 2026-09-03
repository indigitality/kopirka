/**
 * Диалоги панели выделения: «В папку» (ORG-03) и «Тег» (ORG-01).
 * Канон — R14 · «Массовые действия»: та же модалка, что у подтверждений, внутри
 * один контрол (селект папки или поле тега с подсказками), внизу «Отмена» и
 * лаймовое действие.
 */
import { useEffect, useState } from 'react';
import { Folder } from 'lucide-react';
import type { FolderRecord } from '@shared/api';
import { Button } from '@/components/ui/Button';
import { Modal, ModalContent } from '@/components/ui/Modal';
import { Select, type SelectOption } from '@/components/ui/Select';
import { flattenFolders } from '@/lib/folders';
import { plural } from '@/lib/format';
import { Icon } from '@/lib/icons';
import { TagInput } from '@/features/library/TagInput';

/** Значение «пользователь ещё ничего не выбрал» для селекта: такого id у папок нет. */
const NOTHING_SELECTED = -1;

function folderOptions(folders: readonly FolderRecord[]): SelectOption<number | null>[] {
  return [
    { value: null, label: 'Без папки' },
    ...flattenFolders(folders).map(({ folder, depth }) => ({
      value: folder.id,
      label: folder.name,
      depth,
      icon: <Icon icon={Folder} size={16} aria-hidden />,
    })),
  ];
}

export function MoveToFolderDialog({
  open,
  count,
  folders,
  onMove,
  onCancel,
}: {
  open: boolean;
  count: number;
  folders: readonly FolderRecord[];
  onMove: (folderId: number | null) => void;
  onCancel: () => void;
}) {
  /** undefined — ничего не выбрано; null — осознанный выбор «Без папки» (02 §4.24). */
  const [folderId, setFolderId] = useState<number | null | undefined>(undefined);

  // Диалог переиспользуется между выделениями — прошлый выбор к новому отношения не имеет.
  useEffect(() => {
    if (open) setFolderId(undefined);
  }, [open]);

  return (
    <Modal open={open} onOpenChange={(next) => (next ? undefined : onCancel())}>
      <ModalContent
        title="Переместить в папку"
        description={`${count} ${plural(count, 'файл переедет', 'файла переедут', 'файлов переедут')} в выбранную папку. Из текущей ${plural(count, 'он исчезнет', 'они исчезнут', 'они исчезнут')}.`}
        footer={
          <>
            <Button variant="secondary" onClick={onCancel}>
              Отмена
            </Button>
            <Button
              variant="primary"
              disabled={folderId === undefined}
              onClick={() => {
                if (folderId !== undefined) onMove(folderId);
              }}
            >
              Переместить
            </Button>
          </>
        }
      >
        <Select
          // Ни одна папка не имеет id −1: селект не находит совпадения и рисует плейсхолдер.
          value={folderId === undefined ? NOTHING_SELECTED : folderId}
          onValueChange={setFolderId}
          options={folderOptions(folders)}
          icon={<Icon icon={Folder} size={16} aria-hidden />}
          placeholder="Выберите папку"
        />
      </ModalContent>
    </Modal>
  );
}

export function AddTagDialog({
  open,
  count,
  known,
  onAdd,
  onCancel,
}: {
  open: boolean;
  count: number;
  known: readonly string[];
  onAdd: (tag: string) => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} onOpenChange={(next) => (next ? undefined : onCancel())}>
      <ModalContent
        title="Добавить тег"
        description={`Тег ${plural(count, 'получит', 'получат', 'получат')} все ${count} ${plural(count, 'выбранный файл', 'выбранных файла', 'выбранных файлов')}. Уже проставленные теги останутся.`}
        footer={
          // Первичное действие — «Добавить» у поля; «Готово» просто закрывает (02 §4.25).
          <Button variant="ghost" onClick={onCancel}>
            Готово
          </Button>
        }
      >
        <TagInput known={known} onSubmit={onAdd} onCancel={onCancel} submitLabel="Добавить" />
      </ModalContent>
    </Modal>
  );
}
