/**
 * Подвал — секция J3N-0. Разделитель, три группы: логотип, ссылки, версия.
 *
 * // Расхождение с макетом: слева стоит настоящий логотип (правка Сергея),
 * // крупнее, чем в навигации, — 32 px против 22. Подпись «Сделал Сергей
 * // Оршак · дизайн-клуб ORSHAQ» снята 08.09.2026: лендинг публичный, клуб на
 * // нём не упоминается. Строка «[?] адрес GitHub · домен лендинга · канал
 * // доната…» из макета на сайт не переносится: это рабочая пометка, а не
 * // текст страницы; всё неизвестное помечено в `links.ts`. Версия 0.2.0
 * // вместо 0.1.0 — по факту сборки.
 */
import { Logo } from './Logo';
import { DOWNLOAD, GITHUB, GITHUB_PUBLIC, RELEASE, TELEGRAM } from '@/links';

const LINKS = [
  // Репозиторий приватный — ссылка появится, когда GITHUB_PUBLIC станет true.
  ...(GITHUB_PUBLIC ? [{ href: GITHUB, label: 'GitHub' }] : []),
  { href: TELEGRAM, label: 'Telegram' },
  { href: DOWNLOAD.guide, label: 'Инструкция по установке' },
  { href: TELEGRAM, label: 'Сообщить об ошибке' },
] as const;

export function Footer() {
  return (
    <footer className="mx-auto max-w-[1200px] px-6 pb-24 md:px-10 xl:px-0">
      <div className="h-px w-full bg-hairline" />
      <div className="flex flex-col items-start justify-between gap-8 pt-10 lg:flex-row lg:items-center">
        <a href="#top" className="inline-flex no-underline" aria-label="Копирка — наверх">
          <Logo size={32} wordColor="var(--color-display)" />
        </a>

        <nav className="flex flex-wrap items-center gap-x-7 gap-y-3">
          {LINKS.map((link) => (
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
        </p>
      </div>
    </footer>
  );
}
