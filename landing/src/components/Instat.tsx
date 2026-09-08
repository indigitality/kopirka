/**
 * Блок спонсора — секция IX3-0.
 *
 * Логотип студии — настоящий: контуры сняты с `instat.pro` (см. InstatLogo).
 * Раньше здесь стояла текстовая заглушка «INSTAT» вразрядку — правка Сергея
 * 08.09.2026.
 *
 * // [?] «разработан» или «спонсирует» — формулировку выбирает Сергей
 * // (пометка стоит и в макете). Пока оставлена формулировка макета.
 */
import { Reveal } from './Reveal';
import { InstatLogo } from './InstatLogo';
import { INSTAT, isLive } from '@/links';

export function Instat() {
  return (
    <section className="mx-auto max-w-[1200px] px-6 pb-[120px] md:px-10 xl:px-0">
      <div className="flex flex-col items-center text-center">
        <Reveal>
          {isLive(INSTAT) ? (
            <a
              href={INSTAT}
              aria-label="Instat — сайт студии"
              className="inline-flex text-body no-underline transition-colors duration-[140ms] hover:text-display"
            >
              <InstatLogo size={26} />
            </a>
          ) : (
            <span className="inline-flex text-body">
              <InstatLogo size={26} />
            </span>
          )}
        </Reveal>
        <Reveal index={1}>
          <p
            className="mx-auto mt-7 mb-0 max-w-[760px] text-body"
            style={{ fontSize: 18, lineHeight: '26px' }}
          >
            Проект разработан и спонсируется веб-студией Instat — студия оплачивает разработку и
            токены.{' '}
            {isLive(INSTAT) && (
              <a
                href={INSTAT}
                className="text-body underline decoration-hairline underline-offset-4 transition-colors hover:text-display"
              >
                instat.pro
              </a>
            )}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
