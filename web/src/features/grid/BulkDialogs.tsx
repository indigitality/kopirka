/** Диалоги панели выделения: «В папку» (ORG-03) и «Тег» (ORG-01). */
import { useState } from 'react';
import { Folder } from 'lucide-react';
import type { FolderRecord } from '@shared/api';
import { Button } from '@/components/ui/Button';
import { Modal, ModalContent } from '@/components/ui/Modal';
import { Select, type SelectOption } from '@/components/ui/Select';
import { flattenFolders } from '@/lib/folders';
import { plural } from '@/lib/format';
import { TagInput } from '@/features/library/TagInput';

function folderOptions(folders: readonly FolderRecord[]): SelectOption<number | null>[] {
  return [
    { value: null, label: 'Без папки' },
    ...flattenFolders(folders).map(({ folder, depth }) => ({
      value: folder.id,
      label: folder.name,
      depth,
      icon: <Folder className="size-3.5" strokeWidth={2} aria-hidden />,
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
  const [folderId, setFolderId] = useState<number | null>(null);

  return (
    <Modal open={open} onOpenChange={(next) => (next ? undefined : onCancel())}>
      <ModalContent
        title="Переместить в папку"
        description={`${count} ${plural(count, 'файл переедет', 'файла переедут', 'файлов переедут')} в выбранную папку. Файл принадлежит одной папке — прежняя связь снимется.`}
        footer={
          <>
            <Button variant="secondary" onClick={onCancel}>
              Отмена
            </Button>
            <Button variant="primary" onClick={() => onMove(folderId)}>
              Переместить
            </Button>
          </>
        }
      >
        <Select
          value={folderId}
          onValueChange={setFolderId}
          options={folderOptions(folders)}
          icon={<Folder className="size-3.5" strokeWidth={2} aria-hidden />}
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
        description={`Тег получат ${count} ${plural(count, 'выбранный файл', 'выбранных файла', 'выбранных файлов')}.`}
        footer={
          <Button variant="secondary" onClick={onCancel}>
            Готово
          </Button>
        }
      >
        <TagInput known={known} onSubmit={onAdd} onCancel={onCancel} />
      </ModalContent>
    </Modal>
  );
}
