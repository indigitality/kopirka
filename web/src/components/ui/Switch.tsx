/**
 * Тогл — второй переключатель системы после сегментного контрола (§12).
 * Канон — Paper, страница «Доработки от 11.09», артборд D40 «Switch — состояния».
 *
 * Геометрия одна: дорожка 36 × 20, радиус `--radius-pill`, внутреннее поле 2;
 * бегунок 16 × 16, ход 16.
 * Дорожка: выкл `--color-control-hover`, выкл·ховер `--color-control-active`,
 * вкл `--color-brand`, вкл·ховер `--color-brand-hover`.
 * Бегунок: выкл `--color-ink`, вкл `--color-brand-ink` — правка Сергея при
 * приёмке 11.09: белый бегунок на лайме сливался с дорожкой, и включённый тогл
 * читался как сплошная лаймовая плашка. Тёмный бегунок на лайме — та же пара,
 * что у галки чекбокса и у текста на кнопке `primary`.
 * Фокус с клавиатуры — кольцо `--color-brand` 2 px с зазором 2 px.
 * Недоступен — непрозрачность 50 %.
 *
 * Отличие от чекбокса — не в форме, а в смысле: чекбокс отмечает («этот тег
 * участвует в фильтре»), тогл включает («горячая клавиша работает»). Поэтому
 * `role="switch"`, а не `checkbox`, и подпись стоит слева от контрола, а не
 * справа: строка настройки читается «что включаем — включено ли».
 */
import { forwardRef, useId, type ButtonHTMLAttributes } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { DUR_FAST, EASE_OUT } from '@/lib/motion';
import { useReducedMotion } from '@/lib/useReducedMotion';

/** Дорожка, бегунок и ход — D40. Держим числами: их же читает анимация. */
const TRACK_W = 36;
const TRACK_H = 20;
const THUMB = 16;
const PAD = 2;
const TRAVEL = TRACK_W - THUMB - PAD * 2; // 16

export interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  /**
   * Доступное имя. Если задан `labelText`, оно и так стоит рядом — тогда `label`
   * нужен только когда подписи нет (тогл в правом краю строки, как в настройках).
   */
  label?: string;
  /** Необязательная подпись слева, 13 / 16 · 500 (D40 · «с подписью слева»). */
  labelText?: string;
}

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { checked, onCheckedChange, label, labelText, className, disabled, onClick, ...rest },
  ref,
) {
  const reduced = useReducedMotion();
  const labelId = useId();

  const control = (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      /* Подпись рядом — она и есть имя; без неё имя приходит пропом. */
      aria-label={labelText === undefined ? label : undefined}
      aria-labelledby={labelText === undefined ? undefined : labelId}
      disabled={disabled}
      onClick={(event) => {
        onClick?.(event);
        onCheckedChange?.(!checked);
      }}
      /*
        Space и Enter у `<button>` работают сами; отдельного обработчика клавиш
        не нужно — он бы задвоил нажатие. Фокус — `outline`, а не `box-shadow`:
        кольцо с зазором тогда не зависит от цвета подложки под тоглом.
      */
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-pill',
        'transition-colors duration-[var(--dur-fast)] ease-out',
        'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
        'disabled:pointer-events-none disabled:opacity-50',
        checked
          ? 'bg-brand hover:bg-brand-hover'
          : 'bg-control-hover hover:bg-control-active',
        className,
      )}
      style={{ width: TRACK_W, height: TRACK_H, padding: PAD }}
      {...rest}
    >
      <motion.span
        aria-hidden
        className={cn(
          'block rounded-pill transition-colors duration-[var(--dur-fast)] ease-out',
          checked ? 'bg-brand-ink' : 'bg-ink',
        )}
        style={{ width: THUMB, height: THUMB }}
        animate={{ x: checked ? TRAVEL : 0 }}
        initial={false}
        transition={reduced ? { duration: 0 } : { duration: DUR_FAST, ease: EASE_OUT }}
      />
    </button>
  );

  if (labelText === undefined) return control;

  return (
    <span className="inline-flex items-center gap-2.5">
      <span id={labelId} className="text-base leading-4 font-medium text-ink">
        {labelText}
      </span>
      {control}
    </span>
  );
});
