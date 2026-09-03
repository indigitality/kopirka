/**
 * Тег — тонкая обёртка над `Chip`, оставленная ради совместимости: на неё
 * ссылается панель просмотра и витрина.
 *
 * В новом коде пишите `Chip` напрямую:
 *   тег в панели просмотра  → `<Chip variant="control" onRemove={…}>`
 *   кнопка «+ тег»          → `<Chip variant="outline" as="button">`
 *   тег на карточке сетки   → `<Chip variant="light">`
 *   имя папки на карточке   → `<Chip variant="dark">`
 *
 * Канон — R09 · «Теги» в панели деталей (высота 26, радиус pill, поля 10,
 * текст 12/16 · 500) и R13 · «Карточка сетки и чипы».
 */
import { forwardRef, type HTMLAttributes } from 'react';
import { Chip } from './Chip';

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  /** Если задан — справа появляется «×». */
  onRemove?: () => void;
  /** Пунктирная рамка: вариант кнопки «+ тег». */
  dashed?: boolean;
}

export const Tag = forwardRef<HTMLSpanElement, TagProps>(function Tag(
  { onRemove, dashed, children, ...rest },
  ref,
) {
  return (
    <Chip
      ref={ref as never}
      variant={dashed ? 'outline' : 'control'}
      onRemove={onRemove}
      removeLabel="Убрать тег"
      {...rest}
    >
      {children}
    </Chip>
  );
});
