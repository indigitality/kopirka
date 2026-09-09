/**
 * «Скачать» — секция IQJ-0.
 *
 * // Расхождение с макетом: вместо одной кнопки «Скачать для macOS» и приписки
 * // «Intel и Windows — позже [?]» — кнопки-строки по сборкам, сгруппированные
 * // по системам. Сборок три, и с 09.09.2026 каждая качается архивом
 * // «установщик + инструкция» (`Kopirka_0.2.0_macOS_AppleSilicon.zip`,
 * // `..._macOS_Intel.zip`, `..._Windows_x64.zip` — собирает
 * // `work/лендинг (это сделал клод)/деплой/pack-downloads.sh`). Версия 0.2.0,
 * // а не 0.1.0 из макета — по той же причине.
 *
 * Порядок групп зависит от системы гостя (`usePlatform`): гость с Windows видит
 * свою кнопку первой, гость с Mac — свою. Внутри macOS обе кнопки равноправны:
 * какой в Mac чип — Apple Silicon или Intel — браузер не сообщает
 * (`userAgentData.architecture` доступен лишь по запросу и врёт под Rosetta),
 * поэтому подсвечивать нечего.
 *
 * Приписка про неподписанное приложение — для системы гостя: у macOS это
 * Системные настройки, у Windows — SmartScreen. Если система не опознана,
 * показываются обе: пугать человека чужой оговоркой хуже, чем промолчать, а
 * промолчать про свою — нельзя.
 */
import { Apple, Chrome, FileText, LayoutGrid, type LucideIcon } from 'lucide-react';
import { Reveal } from './Reveal';
import { DOWNLOAD, PLATFORMS, RELEASE, platformOrder } from '@/links';
import { usePlatform, type PlatformId } from '@/platform';

/**
 * Значки систем. Логотипа Windows в lucide нет — берём `LayoutGrid`: четыре
 * отдельных квадрата, то есть ровно тот силуэт, по которому знак и узнают.
 * Рисованного логотипа сюда не приносим: набор на странице один.
 */
const ICONS: Record<PlatformId, LucideIcon> = {
  macos: Apple,
  windows: LayoutGrid,
};

/**
 * Чего в Windows-сборке нет. Стоит прямо под её кнопкой и показывается всегда,
 * а не только гостю с Windows: страницу пересылают, а определение системы —
 * догадка по браузеру. Источник: `desktop/src-tauri/src/capture.rs` (захвата
 * области в Windows-сборке нет вовсе) и `folder-action/README.md` (автоимпорт
 * вешается на папку macOS).
 */
const WINDOWS_GAP =
  'Захвата области экрана и автоимпорта папки скриншотов в Windows-сборке пока нет — ' +
  'файлы добавляются перетаскиванием, Ctrl+V и расширением Chrome.';

/**
 * Что человек получит, нажав кнопку. Стоит под кнопками каждой системы, а не
 * один раз на всю секцию: кнопки — то место, где решение принимается, и там же
 * должно быть видно, что инструкцию отдельно искать не надо.
 */
const ARCHIVE_NOTE = 'В архиве — установщик и инструкция по установке.';

/** Приписка про подпись — своя у каждой системы. */
const UNSIGNED: Record<PlatformId, string> = {
  macos:
    'Приложение пока без подписи Apple — при первом запуске откройте Системные настройки → ' +
    'Конфиденциальность и безопасность и нажмите «Открыть всё равно».',
  windows:
    'Установщик пока без подписи — Windows покажет «Windows защитила ваш компьютер». ' +
    'Нажмите «Подробнее» → «Выполнить в любом случае». Прав администратора не нужно: ' +
    '«Копирка» ставится в папку пользователя.',
};

/** Подсказка про опознанную систему. */
const HINT: Record<PlatformId, string> = {
  macos: 'похоже, у вас macOS',
  windows: 'похоже, у вас Windows',
};

export function Download() {
  const platform = usePlatform();
  const order = platformOrder(platform);
  const known = platform === 'other' ? null : platform;

  return (
    <section id="download" className="mx-auto max-w-[1200px] px-6 pb-[140px] md:px-10 xl:px-0">
      <div className="flex flex-col items-center text-center">
        <Reveal>
          <p className="eyebrow m-0">Установка</p>
        </Reveal>
        <Reveal index={1}>
          <h2
            className="mt-6 mb-0 font-medium text-display"
            style={{ fontSize: 'clamp(30px, 4.17vw, 60px)', lineHeight: 1, letterSpacing: '-0.03em' }}
          >
            Скачать
          </h2>
        </Reveal>

        {/* Reveal — блок; внутри флекс-колонки он бы сжался по содержимому,
            поэтому ширину задаём на самой обёртке. */}
        <Reveal index={2} className="w-full">
          <div className="mx-auto mt-9 flex w-full max-w-[640px] flex-col gap-8">
            {order.map((id) => {
              const release = PLATFORMS[id];
              const Icon = ICONS[id];
              // Вес показываем, только если он известен: у Windows-установщика
              // его пока нет (см. `[?]` в links.ts).
              const requirement = [release.minOS, release.size].filter(Boolean).join(' · ');

              return (
                <div key={id} className="text-left">
                  <p className="eyebrow m-0">{requirement}</p>
                  <div
                    className={[
                      'mt-3 grid grid-cols-1 gap-3',
                      // Одна сборка занимает всю ширину: половинная кнопка-строка
                      // рядом с пустотой читалась бы как недогруженная вёрстка.
                      release.builds.length > 1 ? 'sm:grid-cols-2' : '',
                    ].join(' ')}
                  >
                    {release.builds.map((build) => (
                      <a
                        key={build.id}
                        href={build.href}
                        download={build.file}
                        className="flex items-center gap-3 rounded-[8px] bg-control px-5 py-4 text-left no-underline transition-colors duration-[140ms] hover:bg-control-hover"
                      >
                        <Icon size={18} strokeWidth={1.8} className="shrink-0 text-ink" aria-hidden />
                        <span className="min-w-0">
                          <span className="block text-[15px] leading-5 font-medium text-ink">
                            {build.title}
                          </span>
                          <span className="block text-[13px] leading-4 text-faint tabular-nums">
                            {build.note}
                          </span>
                        </span>
                      </a>
                    ))}
                  </div>
                  <p className="mt-3 mb-0 text-[13px] leading-[18px] text-faint">{ARCHIVE_NOTE}</p>
                  {id === 'windows' && (
                    <p className="mt-2 mb-0 text-[13px] leading-[18px] text-faint">{WINDOWS_GAP}</p>
                  )}
                </div>
              );
            })}
          </div>
        </Reveal>

        <Reveal index={3}>
          <p className="eyebrow mt-8 mb-0">
            {RELEASE.version}
            {known ? ` · ${HINT[known]}` : ''}
          </p>
        </Reveal>

        <Reveal index={4}>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            <a
              href={DOWNLOAD.extensionZip}
              className="inline-flex items-center gap-2 text-[15px] leading-5 text-body no-underline transition-colors hover:text-display"
            >
              <Chrome size={16} strokeWidth={1.8} aria-hidden />
              Расширение Chrome — zip
            </a>
            {/* Те же инструкции лежат внутри архивов, но ссылки остаются: PDF
                открывается в браузере одним щелчком — можно прочитать, не
                качая 48 МБ, и переслать коллеге на другой системе. Показаны
                обе: человек качает своё, а пересылает часто чужое. */}
            {order.map((id) => (
              <a
                key={id}
                href={PLATFORMS[id].guide}
                className="inline-flex items-center gap-2 text-[15px] leading-5 text-body no-underline transition-colors hover:text-display"
              >
                <FileText size={16} strokeWidth={1.8} aria-hidden />
                Инструкция — {PLATFORMS[id].label}
              </a>
            ))}
          </div>
        </Reveal>

        <Reveal index={5} className="w-full">
          <div className="mx-auto mt-14 max-w-[900px]">
            {(known ? [known] : order).map((id) => (
              <p key={id} className="m-0 mb-4 text-body" style={{ fontSize: 18, lineHeight: '26px' }}>
                {UNSIGNED[id]}
              </p>
            ))}
            <p className="m-0 text-body" style={{ fontSize: 18, lineHeight: '26px' }}>
              Расширение Chrome ставится распакованным — в режиме разработчика. Автообновлений пока
              нет.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
