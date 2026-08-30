/**
 * Панель выделения для корзины. Геометрия и тон — как у примитива SelectionBar (§2 спеки),
 * но действия другие: восстановить и удалить навсегда.
 */
import { motion } from 'motion/react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { EASE_OUT, DUR_BASE } from '@/lib/motion';
import { Button } from '@/components/ui/Button';

const Divider = () => <span className="h-5 w-px shrink-0 bg-line-strong" aria-hidden />;

export interface TrashSelectionBarProps {
  count: number;
  onRestore: () => void;
  onPurge: () => void;
  onCancel: () => void;
  className?: string;
}

export function TrashSelectionBar({
  count,
  onRestore,
  onPurge,
  onCancel,
  className,
}: TrashSelectionBarProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: DUR_BASE, ease: EASE_OUT }}
      role="toolbar"
      aria-label="Действия над выделенными файлами корзины"
      className={cn(
        'flex h-11 items-center gap-2 rounded-md bg-surface-overlay px-4 shadow-float',
        className,
      )}
    >
      <span className="shrink-0 text-base text-ink-muted">
        <span className="font-mono">{count}</span> выбрано
      </span>
      <Divider />
      <Button variant="ghost" icon={<RotateCcw className="size-4" strokeWidth={2} />} onClick={onRestore}>
        Восстановить
      </Button>
      <Button variant="ghost" icon={<Trash2 className="size-4" strokeWidth={2} />} onClick={onPurge}>
        Удалить навсегда
      </Button>
      <Divider />
      <Button variant="ghost" onClick={onCancel}>
        Отменить
      </Button>
    </motion.div>
  );
}
