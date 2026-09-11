/**
 * Подвал — секция J3N-0. Разделитель, три группы: логотип, ссылки, версия.
 *
 * // Расхождение с макетом: слева стоит настоящий логотип (правка Сергея),
 * // крупнее, чем в навигации, — 32 px против 22. Подпись «Сделал Сергей
 * // Оршак · дизайн-клуб ORSHAQ» снята 08.09.2026: лендинг публичный, клуб на
 * // нём не упоминается. Строка «[?] адрес GitHub · домен лендинга · канал
 * // доната…» из макета на сайт не переносится: это рабочая пометка, а не
 * // текст страницы; всё неизвестное помечено в `links.ts`. Версия 0.3.0
 * // вместо 0.1.0 — по факту сборки.
 *
 * Рядом с версией — «Что нового»: история версий живёт в Notion (`CHANGELOG`
 * в `links.ts`), и в подвал она просится к номеру версии, а не в общий ряд
 * ссылок. Пока адрес — заглушка `'#'`, ссылка не рисуется вовсе (`isLive`).
 */
import { Logo } from './Logo';
import { CHANGELOG, GITHUB, GITHUB_PUBLIC, PLATFORMS, RELEASE, TELEGRAM, isLive } from '@/links';
import { usePlatform, type Platform } from '@/platform';

/**
 * Ссылки подвала. Инструкций с 09.09.2026 две — здесь стоит та, что нужна
 * системе гостя; обе рядом друг с другом показаны в блоке «Скачать», где
 * человек выбирает файл.
 */
function links(platform: Platform) {
  return [
    // Репозиторий публичный с 09.09.2026 — ссылка на GitHub есть.
    ...(GITHUB_PUBLIC ? [{ href: GITHUB, label: 'GitHub' }] : []),
    { href: TELEGRAM, label: 'Telegram' },
    {
      href: PLATFORMS[platform === 'windows' ? 'windows' : 'macos'].guide,
      label: 'Инструкция по установке',
    },
    { href: TELEGRAM, label: 'Сообщить об ошибке' },
  ];
}

export function Footer() {
  const platform = usePlatform();

  return (
    <footer className="mx-auto max-w-[1200px] px-6 pb-24 md:px-10 xl:px-0">
      <div className="h-px w-full bg-hairline" />
      <div className="flex flex-col items-start justify-between gap-8 pt-10 lg:flex-row lg:items-center">
        <a href="#top" className="inline-flex no-underline" aria-label="Копирка — наверх">
          <Logo size={32} wordColor="var(--color-display)" />
        </a>

        <nav className="flex flex-wrap items-center gap-x-7 gap-y-3">
          {links(platform).map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-[15px] leading-[18px] text-body no-underline transition-colors duration-[120ms] hover:text-display"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <p className="eyebrow m-0">
          v{RELEASE.version} · {RELEASE.date}
          {isLive(CHANGELOG) && (
            <>
              {' · '}
              <a
                href={CHANGELOG}
                target="_blank"
                rel="noreferrer"
                className="text-inherit no-underline transition-colors duration-[120ms] hover:text-display"
              >
                что нового
              </a>
            </>
          )}
        </p>
      </div>
    </footer>
  );
}
