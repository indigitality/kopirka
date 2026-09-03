/**
 * Поле поиска верхней панели. Канон — R01 (покой) и R05 (активное).
 *
 * Ширина 280, высота 32, заливка `control`, радиус `--radius-card` (12 —
 * единственный контрол верхней панели с карточным радиусом), поля 10,
 * зазор 8. Иконка 16 `ink-faint`, текст 14/18 · 500, плейсхолдер `ink-faint`,
 * чип «⌘K» — 10/15 · 500 с `tracking-label`, без подложки.
 *
 * Состояния ровно по канону, без надстроек: покой — заливка `control`,
 * наведение — `control-hover`, фокус — лаймовая обводка 1 px внутрь (R05).
 * Вращающийся бим по периметру (пакет `border-beam`) убран правкой Сергея
 * 03.09.2026: «не нужны они нам, убрать и сделать прямо по дизайну».
 */
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Icon } from '@/lib/icons';
import { Tooltip } from './Tooltip';

export interface SearchFieldProps {
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  /** Глобальный ⌘K фокусирует поле. На витрине выключаем, чтобы поля не дрались. */
  globalHotkey?: boolean;
  className?: string;
}

export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  { value, onValueChange, placeholder = 'Поиск по названию', globalHotkey = true, className },
  forwardedRef,
) {
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(forwardedRef, () => inputRef.current as HTMLInputElement, []);

  // ⌘K / Ctrl+K — фокус на поле.
  useEffect(() => {
    if (!globalHotkey) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [globalHotkey]);

  return (
    <div
      className={cn(
        /*
          280 — макетная ширина, но не жёсткая: пульт верхней панели справа не
          ужимается, и на минимальном окне 900 ряд не помещался — пульт уезжал
          за правый край панели. Сжимается поле (`min-w` держит пол 180), а не
          органы управления: обрезанный плейсхолдер честнее пропавшей кнопки.
        */
        'flex h-[var(--size-row)] w-[var(--size-search)] min-w-[var(--size-search-min)]',
        'items-center gap-2 rounded-card bg-control px-2.5',
        'transition-[background-color,box-shadow] duration-[var(--dur-fast)] ease-out',
        'hover:bg-control-hover',
        /* R05: активное поле обведено лаймом. Обводка тенью — размеры не едут. */
        'focus-within:bg-control focus-within:shadow-[inset_0_0_0_1px_var(--color-brand)]',
        className,
      )}
    >
      <Icon icon={Search} size={16} className="shrink-0 text-ink-faint" aria-hidden />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => onValueChange?.(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn(
          'min-w-0 flex-1 bg-transparent text-md leading-[18px] font-medium text-ink',
          'placeholder:font-medium placeholder:text-ink-faint',
          'outline-none [&::-webkit-search-cancel-button]:appearance-none',
        )}
      />
      {/* Нативный крестик у type="search" отключён — свой, и только когда есть что стирать. */}
      {value ? (
        <Tooltip content="Очистить" side="bottom">
          <button
            type="button"
            aria-label="Очистить поиск"
            onClick={() => {
              onValueChange?.('');
              inputRef.current?.focus();
            }}
            className={cn(
              'flex size-4 shrink-0 items-center justify-center text-ink-faint',
              'transition-colors duration-[var(--dur-fast)] ease-out hover:text-ink',
            )}
          >
            <Icon icon={X} size={16} aria-hidden />
          </button>
        </Tooltip>
      ) : null}
      {/* Хоткей ⌘K. В редизайне это просто подпись, без плашки (R01 / R05). */}
      <kbd className="shrink-0 text-2xs leading-[15px] font-medium tracking-label text-ink-faint">
        ⌘K
      </kbd>
    </div>
  );
});
