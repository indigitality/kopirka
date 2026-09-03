/**
 * Строка списка тегов в панели фильтров (R05, «Секция · Теги»): квадратный
 * чекбокс, имя, счётчик. Сам чекбокс — примитив `Checkbox shape="square"`,
 * здесь только строка вокруг него.
 *
 * Геометрия снята с узла панели: высота 28, зазор 10, полей нет — строка идёт
 * от края до края тела панели. Поэтому наведение показано не заливкой
 * (её негде нарисовать), а цветом имени.
 *
 * Строка — не кнопка: настоящий контрол внутри, и вкладывать кнопку в кнопку
 * нельзя. Клик по строке переключает тег; клик по самому чекбоксу до строки
 * не доходит — `Checkbox` гасит всплытие.
 */
import type { ReactNode } from 'react';
import { Checkbox } from '@/components/ui/Checkbox';
import { cn } from '@/lib/cn';

export interface CheckRowProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: ReactNode;
  /** Правый слот: счётчик файлов у тега. */
  trailing?: ReactNode;
  /** Подпись контрола для скринридера. По умолчанию берётся из текста строки. */
  label?: string;
  className?: string;
}

export function CheckRow({
  checked,
  onCheckedChange,
  children,
  trailing,
  label,
  className,
}: CheckRowProps) {
  return (
    /* `shrink-0`: список тегов — колонка с потолком высоты, без этого строки
       сжимаются, чтобы влезть, и высота 28 расходится с макетом. */
    <div
      onClick={() => onCheckedChange(!checked)}
      className={cn('group/row flex h-7 shrink-0 cursor-pointer items-center gap-2.5', className)}
    >
      <Checkbox
        shape="square"
        checked={checked}
        onCheckedChange={onCheckedChange}
        label={label ?? (typeof children === 'string' ? children : 'Выбрать')}
        className="group-hover/row:border-ink-muted"
      />
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-md font-medium select-none',
          'transition-colors duration-[var(--dur-fast)] ease-out',
          checked ? 'text-ink' : 'text-ink-muted group-hover/row:text-ink',
        )}
      >
        {children}
      </span>
      {trailing !== undefined ? (
        <span className="shrink-0 text-2xs text-ink-faint tabular-nums">{trailing}</span>
      ) : null}
    </div>
  );
}
