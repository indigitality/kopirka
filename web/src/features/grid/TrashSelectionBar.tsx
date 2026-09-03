/**
 * Панель выделения для корзины. Геометрия и тон — как у примитива SelectionBar
 * (канон R06 · `FIR-0`: стекло, высота 44, поля 16, зазор 12, радиус `--radius-card`,
 * тень `--shadow-glass`, вертикальные разделители 1×20), но действия другие:
 * восстановить и удалить навсегда.
 */
import { motion } from 'motion/react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Icon } from '@/lib/icons';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { glassLayerMotion } from '@/components/ui/motion-presets';

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
  const reduced = useReducedMotion();

  return (
    <motion.div
      {...glassLayerMotion({ from: 'bottom', reduced })}
      role="toolbar"
      aria-label="Действия над выделенными файлами корзины"
      className={cn(
        'glass mx-auto flex h-[var(--size-bar)] w-max items-center gap-3 rounded-card px-4 shadow-glass',
        className,
      )}
    >
      <span className="shrink-0 text-md leading-[18px] font-medium text-ink tabular-nums">
        {count} выбрано
      </span>
      <Divider />
      <Button variant="ghost" icon={<Icon icon={RotateCcw} size={16} />} onClick={onRestore}>
        Восстановить
      </Button>
      {/* Необратимое действие — иконкой в опасном тоне, как «🗑» в R06. */}
      <IconButton label="Удалить навсегда" variant="danger" size="sm" onClick={onPurge}>
        <Icon icon={Trash2} size={16} aria-hidden />
      </IconButton>
      <Divider />
      <Button variant="ghost" onClick={onCancel}>
        Отменить
      </Button>
    </motion.div>
  );
}
