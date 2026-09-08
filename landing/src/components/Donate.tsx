/**
 * «Поддержать» — секция IW0-0.
 *
 * Текст переписан Сергеем 08.09.2026: приложение бесплатное и таким останется,
 * донат — только по желанию. Прежние формулировки («бонус для участников
 * клуба», «сэкономила вам час», «это просто спасибо») сняты: лендинг публичный,
 * упоминаний клуба на нём нет.
 *
 * Адреса доната нет — `DONATE` в `links.ts` помечен `[?]` и ведёт на `'#'`;
 * пока так, вместо кнопки стоит тихая строка.
 * // Расхождение с макетом: чипы сумм в макете не нарисованы вовсе — они
 * // добавлены постановкой задачи; геометрия у них та же, что у кнопок (8).
 */
import { Reveal } from './Reveal';
import { Button } from './Button';
import { DONATE, DONATE_AMOUNTS, isLive } from '@/links';

export function Donate() {
  return (
    <section id="donate" className="mx-auto max-w-[1200px] px-6 pb-[140px] md:px-10 xl:px-0">
      <div className="flex flex-col items-center text-center">
        <Reveal>
          <p className="eyebrow m-0">Поддержать</p>
        </Reveal>
        <Reveal index={1}>
          <h2
            className="mt-6 mb-0 font-medium text-display"
            style={{ fontSize: 'clamp(30px, 4.17vw, 60px)', lineHeight: 1.03, letterSpacing: '-0.03em' }}
          >
            Копирка бесплатная
            <span className="block text-faint">и такой останется</span>
          </h2>
        </Reveal>
        <Reveal index={2}>
          <p
            className="mx-auto mt-7 mb-0 max-w-[760px] text-lead"
            style={{ fontSize: 'clamp(17px, 1.67vw, 24px)', lineHeight: 1.29 }}
          >
            Но если есть желание поддержать проект донатом — мы только за: токены, на которых всё
            это делается, далеко не бесплатные.
          </p>
        </Reveal>

        <Reveal index={3}>
          {isLive(DONATE) ? (
            <div className="mt-10 flex flex-col items-center gap-4">
              <Button href={DONATE} variant="primary" size="hero">
                Поддержать
              </Button>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {DONATE_AMOUNTS.map((amount) => (
                  <a
                    key={amount}
                    href={DONATE}
                    className="inline-flex h-8 items-center rounded-[8px] bg-control px-3 text-[14px] leading-[18px] font-medium text-ink tabular-nums no-underline transition-colors duration-[140ms] hover:bg-control-hover"
                  >
                    {amount}
                  </a>
                ))}
              </div>
            </div>
          ) : (
            // Канал доната не выбран — вместо мёртвой кнопки тихая строка.
            <p className="mt-10 text-[15px]" style={{ color: 'var(--color-ink-muted)' }}>
              Ссылка для поддержки появится здесь чуть позже.
            </p>
          )}
        </Reveal>
      </div>
    </section>
  );
}
