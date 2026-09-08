/**
 * «Скачать» — секция IQJ-0.
 *
 * // Расхождение с макетом: вместо одной кнопки «Скачать для macOS» и приписки
 * // «Intel и Windows — позже [?]» — две кнопки-строки, Apple Silicon и Intel.
 * // Обе сборки существуют: `Копирка_0.2.0_aarch64.dmg` и
 * // `Копирка_0.2.0_x64.dmg` (wiki/RELEASE.md, 04.09.2026). Версия 0.2.0, а не
 * // 0.1.0 из макета — по той же причине.
 *
 * Подсказка «похоже, у вас macOS» показывается только если система и правда
 * macOS. Какой внутри чип — Apple Silicon или Intel — браузер не сообщает
 * (userAgentData.architecture доступен лишь по запросу и врёт под Rosetta),
 * поэтому обе кнопки равноправны и подсвечивать нечего.
 */
import { useEffect, useState } from 'react';
import { Apple, Chrome, FileText } from 'lucide-react';
import { Reveal } from './Reveal';
import { DMG, DOWNLOAD, RELEASE } from '@/links';

/** Похоже ли, что это macOS. Только факт системы, без догадок про чип. */
function looksLikeMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  const data = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  const platform = data?.platform ?? navigator.platform ?? '';
  return /mac/i.test(platform) || /Mac OS X/i.test(navigator.userAgent);
}

interface Build {
  id: string;
  title: string;
  note: string;
  href: string;
  file: string;
}

const BUILDS: Build[] = [
  {
    id: 'aarch64',
    title: 'Apple Silicon',
    note: 'M1 и новее',
    href: DOWNLOAD.appleSilicon,
    file: DMG.appleSilicon,
  },
  {
    id: 'x64',
    title: 'Intel',
    note: 'Mac до 2020 года',
    href: DOWNLOAD.intel,
    file: DMG.intel,
  },
];

export function Download() {
  const [isMac, setIsMac] = useState(false);
  useEffect(() => setIsMac(looksLikeMac()), []);

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
          <div className="mx-auto mt-9 grid w-full max-w-[640px] grid-cols-1 gap-3 sm:grid-cols-2">
            {BUILDS.map((build) => (
              <a
                key={build.id}
                href={build.href}
                download={build.file}
                className="flex items-center gap-3 rounded-[8px] bg-control px-5 py-4 text-left no-underline transition-colors duration-[140ms] hover:bg-control-hover"
              >
                <Apple size={18} strokeWidth={1.8} className="shrink-0 text-ink" aria-hidden />
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
        </Reveal>

        <Reveal index={3}>
          <p className="eyebrow mt-6 mb-0">
            {RELEASE.version} · {RELEASE.size} · {RELEASE.minMacOS}
            {isMac ? ' · похоже, у вас macOS' : ''}
          </p>
        </Reveal>

        <Reveal index={4}>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
            <a
              href={DOWNLOAD.extensionZip}
              className="inline-flex items-center gap-2 text-[15px] leading-5 text-body no-underline transition-colors hover:text-display"
            >
              <Chrome size={16} strokeWidth={1.8} aria-hidden />
              Расширение Chrome — zip
            </a>
            <a
              href={DOWNLOAD.guide}
              className="inline-flex items-center gap-2 text-[15px] leading-5 text-body no-underline transition-colors hover:text-display"
            >
              <FileText size={16} strokeWidth={1.8} aria-hidden />
              Инструкция по установке
            </a>
          </div>
        </Reveal>

        <Reveal index={5} className="w-full">
          <div className="mx-auto mt-14 max-w-[900px]">
            <p className="m-0 text-body" style={{ fontSize: 18, lineHeight: '26px' }}>
              Приложение пока без подписи Apple — при первом запуске откройте Системные настройки →
              Конфиденциальность и безопасность и нажмите «Открыть всё равно».
            </p>
            <p className="mt-4 mb-0 text-body" style={{ fontSize: 18, lineHeight: '26px' }}>
              Расширение Chrome ставится распакованным — в режиме разработчика. Автообновлений пока
              нет.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
