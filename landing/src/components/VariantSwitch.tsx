/**
 * Переключатель вариантов первого экрана. Показывается только когда в адресе
 * есть `?hero=…` — на публичной ссылке его нет. См. `heroVariant.ts`.
 *
 * // Временный элемент на время выбора: удаляется вместе с `heroVariant.ts`.
 */
import type { HeroVariant } from '@/heroVariant';
import { variantHref } from '@/heroVariant';

const OPTIONS: Array<{ id: HeroVariant; label: string }> = [
  { id: 'shot', label: 'Снимок' },
  { id: 'video', label: 'Видео' },
];

export interface VariantSwitchProps {
  current: HeroVariant;
}

export function VariantSwitch({ current }: VariantSwitchProps) {
  return (
    <div className="fixed inset-x-0 bottom-5 z-[60] flex justify-center px-6">
      <div
        className="glass flex items-center gap-1 rounded-[10px] border border-line-strong p-1"
        style={{ boxShadow: '0 12px 32px #00000073' }}
      >
        <span className="eyebrow px-2" style={{ lineHeight: '28px' }}>
          Первый экран
        </span>
        {OPTIONS.map((option) => {
          const isActive = option.id === current;
          return (
            <a
              key={option.id}
              href={variantHref(option.id)}
              aria-current={isActive ? 'page' : undefined}
              className={[
                'inline-flex h-7 items-center rounded-[8px] px-3 text-[14px] leading-[18px]',
                'font-medium no-underline transition-colors duration-[140ms]',
                isActive ? 'bg-brand text-brand-ink' : 'text-body hover:bg-control hover:text-display',
              ].join(' ')}
            >
              {option.label}
            </a>
          );
        })}
      </div>
    </div>
  );
}
