/**
 * «Файлы на диске» — секция IPM-0. Слева крупная мысль 36/42, справа три
 * чипа-«без»: без облака, без аккаунта, без телеметрии.
 *
 * Чипы в макете нарисованы пилюлями 44 px с обводкой `#2F2F2F`. Правка Сергея
 * про радиус 8 касается кнопок; здесь это не кнопки, а неинтерактивные метки —
 * но радиус приведён к тому же 8, чтобы на странице не было двух геометрий.
 * // Расхождение с макетом: радиус чипов 8 вместо 999.
 *
 * Путь библиотеки — платформенный: на macOS это `~/Pictures/Копирка`, на
 * Windows `%USERPROFILE%\Pictures\Копирка` (первоисточник —
 * `app/server/src/config.ts`). Показываем путь той системы, с которой пришёл
 * гость; неопознанная система видит macOS-путь, как было до Windows-сборки.
 */
import { Reveal } from './Reveal';
import { LIBRARY_PATH } from '@/links';
import { usePlatform } from '@/platform';

const MARKS = ['без облака', 'без аккаунта', 'без телеметрии'] as const;

export function Files() {
  const platform = usePlatform();
  const libraryPath = LIBRARY_PATH[platform === 'windows' ? 'windows' : 'macos'];

  return (
    <section className="mx-auto max-w-[1200px] px-6 pb-[140px] md:px-10 xl:px-0">
      <div className="flex flex-col items-start justify-between gap-10 lg:flex-row">
        <div className="max-w-[800px]">
          <Reveal>
            <p className="eyebrow m-0">Файлы на диске</p>
          </Reveal>
          <Reveal index={1}>
            <p
              className="mt-7 mb-0 text-display"
              style={{ fontSize: 'clamp(22px, 2.5vw, 36px)', lineHeight: 1.17, letterSpacing: '-0.02em' }}
            >
              Обычная папка <span className="tabular-nums">{libraryPath}</span>. Ничего скрытого:
              копируется, бэкапится, переносится как угодно. Удалите приложение — файлы останутся.
            </p>
          </Reveal>
        </div>

        <div className="flex flex-row flex-wrap gap-3 pt-2 lg:flex-col lg:items-end">
          {MARKS.map((mark, index) => (
            <Reveal key={mark} index={index}>
              <span
                className="eyebrow inline-flex h-11 items-center justify-center rounded-[8px] border border-hairline px-6"
                style={{ color: 'var(--color-body)' }}
              >
                {mark}
              </span>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
