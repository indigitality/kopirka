/**
 * Плавающая панель массового выделения. Канон — R06 · «Панель выделения»
 * и R13 · «Стекло и движение».
 *
 * Стекло `.glass`, высота 44, радиус `--radius-card`, тень `--shadow-glass`,
 * поля 16, зазор 12. Слева счётчик 14/18 · 500 `ink`, дальше разделители
 * 1×20 цветом обводки, призрачные кнопки 32 px (иконка 16 + текст `ink-muted`),
 * корзина — квадрат 28 `danger-tint`.
 *
 * Панель стоит у нижнего края экрана — приезжает снизу (`from="bottom"`).
 */
import { motion } from 'motion/react';
import { Folder, Tag as TagIcon, Trash2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Icon } from '@/lib/icons';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { glassLayerMotion } from './motion-presets';
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

/** Сегмент панели: призрачная кнопка 32 px с полями 12 и зазором 6. */
const SEGMENT = cn(
  'flex h-[var(--size-row)] shrink-0 items-center gap-1.5 rounded-md px-3',
  'text-md leading-[18px] font-medium text-ink-muted select-none',
  'transition-colors duration-[var(--dur-fast)] ease-out hover:bg-control hover:text-ink',
);

/** ORG-04 — плавающая панель массового выделения. */
export function SelectionBar({
  count,
  onMoveToFolder,
  onTag,
  onDelete,
  onCancel,
  className,
}: SelectionBarProps) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      {...glassLayerMotion({ from: 'bottom', reduced })}
      role="toolbar"
      aria-label="Действия над выделенными файлами"
      className={cn(
        'flex h-[var(--size-bar)] items-center gap-3 rounded-card px-4 shadow-glass glass',
        className,
      )}
    >
      <span className="shrink-0 text-md leading-[18px] font-medium text-ink">
        <span className="tabular-nums">{count}</span> выбрано
      </span>
      <Divider />
      <button type="button" className={SEGMENT} onClick={onMoveToFolder}>
        <Icon icon={Folder} size={16} aria-hidden />
        В папку
      </button>
      <button type="button" className={SEGMENT} onClick={onTag}>
        <Icon icon={TagIcon} size={16} aria-hidden />
        Тег
      </button>
      <IconButton label="Удалить" variant="danger" size="sm" onClick={onDelete}>
        <Icon icon={Trash2} size={16} aria-hidden />
      </IconButton>
      <Divider />
      <button type="button" className={SEGMENT} onClick={onCancel}>
        Отменить
      </button>
    </motion.div>
  );
}
