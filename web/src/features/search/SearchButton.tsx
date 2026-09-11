/**
 * NEW-02 — кнопка поиска верхней панели (артборд D05). Пришла на место поля 280:
 * поиск переехал в модалку, а в панели осталась компактная кнопка «Поиск ⌘K».
 *
 * Геометрия с макета: высота `--size-row` 32, поля 10, радиус `--radius-card` 12
 * (тот же карточный радиус, что был у поля), зазор 8, подложка `--color-control`,
 * наведение `--color-control-hover`. Лупа 16 и обе подписи — `--color-ink-faint`.
 *
 * Одно состояние добавлено сверх макета: когда на сетке лежит строка запроса,
 * кнопка показывает её саму и крестик очистки. Иначе после «⌘↵ применить как
 * фильтр» активный поиск не был бы виден нигде — раньше его показывало поле.
 */
import { Search, X } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/cn';
import { Icon } from '@/lib/icons';
import { hotkeyLabel } from '@/lib/platform';
import { useViewSelector, viewActions } from '@/store/view';

export interface SearchButtonProps {
  onOpen: () => void;
  className?: string;
}

export function SearchButton({ onOpen, className }: SearchButtonProps) {
  const query = useViewSelector((s) => s.query);
  const active = query.trim() !== '';

  return (
    <div
      className={cn(
        'flex h-[var(--size-row)] shrink-0 items-center gap-2 rounded-card px-2.5',
        'transition-colors duration-[var(--dur-fast)] ease-out',
        active ? 'bg-brand-tint' : 'bg-control hover:bg-control-hover',
        className,
      )}
    >
      <Tooltip content={`Поиск по библиотеке ${hotkeyLabel('⌘K')}`} side="bottom">
        <button
          type="button"
          onClick={onOpen}
          aria-label={active ? `Поиск: ${query}` : 'Поиск по библиотеке'}
          data-search-trigger=""
          className="flex min-w-0 items-center gap-2"
        >
          <Icon
            icon={Search}
            size={16}
            className={cn('shrink-0', active ? 'text-brand' : 'text-ink-faint')}
            aria-hidden
          />
          <span
            className={cn(
              'max-w-40 truncate text-md leading-[18px] font-medium',
              active ? 'text-brand' : 'text-ink-faint',
            )}
          >
            {active ? query : 'Поиск'}
          </span>
          {active ? null : (
            <kbd className="shrink-0 text-2xs leading-[15px] font-medium tracking-label text-ink-faint">
              {hotkeyLabel('⌘K')}
            </kbd>
          )}
        </button>
      </Tooltip>

      {active ? (
        <Tooltip content="Очистить поиск" side="bottom">
          <button
            type="button"
            aria-label="Очистить поиск"
            onClick={() => viewActions.setQuery('')}
            className="flex size-4 shrink-0 items-center justify-center text-brand opacity-70 transition-opacity duration-[var(--dur-fast)] ease-out hover:opacity-100"
          >
            <Icon icon={X} size={14} aria-hidden />
          </button>
        </Tooltip>
      ) : null}
    </div>
  );
}
