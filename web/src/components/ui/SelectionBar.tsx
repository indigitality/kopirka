/**
 * Плавающая панель массового выделения. Канон — R06 · «Панель выделения»,
 * R13 · «Стекло и движение» и доработки 11.09.2026: D21 · `LB5-0`,
 * D21b · `M0T-0`, D22 · `MGL-0`.
 *
 * Стекло `.glass`, высота 44, радиус `--radius-card`, тень `--shadow-glass`,
 * поля 16, зазор 12. Слева квадратный чекбокс 16 «выбрать все», за ним счётчик
 * «Выбрано 7 из 142» 14/18 · 500 `ink` табличными цифрами, дальше разделители
 * 1×20 цветом обводки, призрачные кнопки 32 px (иконка 16 + текст `ink-muted`),
 * корзина — квадрат 28 `danger-tint`.
 *
 * Панель стоит у нижнего края экрана — приезжает снизу (`from="bottom"`).
 */
import { motion } from 'motion/react';
import { Download, Folder, Tag as TagIcon, Trash2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { selectionLabel } from '@/lib/format';
import { Icon } from '@/lib/icons';
import { hotkeyLabel } from '@/lib/platform';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { glassLayerMotion } from './motion-presets';
import { Checkbox } from './Checkbox';
import { IconButton } from './IconButton';
import { Tooltip } from './Tooltip';

export interface SelectionBarProps {
  count: number;
  /** Сколько файлов в текущем срезе всего — вторая половина «Выбрано 7 из 142». */
  total: number;
  /** Клик по чекбоксу: выбрать все видимые в срезе либо снять выделение. */
  onToggleAll: () => void;
  onMoveToFolder: () => void;
  onTag: () => void;
  /** FDB-05 — выгрузить выбранное в папку на диске (D22 · сегмент «Экспорт»). */
  onExport: () => void;
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
  total,
  onToggleAll,
  onMoveToFolder,
  onTag,
  onExport,
  onDelete,
  onCancel,
  className,
}: SelectionBarProps) {
  const reduced = useReducedMotion();
  /* Выбрано всё, что есть в срезе — тогда галка сплошная, иначе минус (D22). */
  const all = total > 0 && count >= total;

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
      <Checkbox
        shape="square"
        checked={all}
        indeterminate={!all}
        label={all ? 'Снять выделение' : 'Выбрать все'}
        onCheckedChange={onToggleAll}
      />
      <span className="shrink-0 text-md leading-[18px] font-medium text-ink tabular-nums">
        {selectionLabel(count, total)}
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
      {/*
        Тултип стоит сверху, а не снизу как в листе состояний D22: панель живёт
        у нижнего края окна, и снизу подсказке просто некуда встать.
      */}
      <Tooltip content="Экспортировать в папку…" hotkey={hotkeyLabel('⇧⌘E')} side="top">
        <button type="button" className={SEGMENT} onClick={onExport}>
          <Icon icon={Download} size={16} aria-hidden />
          Экспорт
        </button>
      </Tooltip>
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
