import { motion } from 'motion/react';
import { FolderInput, Tag as TagIcon, Trash2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { EASE_OUT, DUR_BASE } from '@/lib/motion';
import { Button } from './Button';
import { IconButton } from './IconButton';

export interface SelectionBarProps {
  count: number;
  onMoveToFolder: () => void;
  onTag: () => void;
  onDelete: () => void;
  onCancel: () => void;
  className?: string;
}

const Divider = () => <span className="h-5 w-px shrink-0 bg-line-strong" aria-hidden />;

/** ORG-04 — плавающая панель массового выделения, раздел 2 спеки. */
export function SelectionBar({
  count,
  onMoveToFolder,
  onTag,
  onDelete,
  onCancel,
  className,
}: SelectionBarProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: DUR_BASE, ease: EASE_OUT }}
      role="toolbar"
      aria-label="Действия над выделенными файлами"
      className={cn(
        'flex h-11 items-center gap-2 rounded-md bg-surface-overlay px-4 shadow-float',
        className,
      )}
    >
      <span className="shrink-0 text-base text-ink-muted">
        <span className="font-mono">{count}</span> выбрано
      </span>
      <Divider />
      <Button variant="ghost" icon={<FolderInput className="size-4" strokeWidth={2} />} onClick={onMoveToFolder}>
        В папку
      </Button>
      <Button variant="ghost" icon={<TagIcon className="size-4" strokeWidth={2} />} onClick={onTag}>
        Тег
      </Button>
      <IconButton label="Удалить" variant="danger" onClick={onDelete}>
        <Trash2 className="size-4" strokeWidth={2} aria-hidden />
      </IconButton>
      <Divider />
      <Button variant="ghost" onClick={onCancel}>
        Отменить
      </Button>
    </motion.div>
  );
}
