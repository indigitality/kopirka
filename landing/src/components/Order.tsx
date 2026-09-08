/**
 * «Порядок без усилий» — секция IAX-0. Бенто 2 + 3, как в макете:
 * ряд из карточек 392 и 784 (колонки 4 и 8 из 12), ряд из трёх по 384.
 * Зазор 24, радиус карточек 24.
 *
 * Иллюстрации — выгрузки панелей из Paper (`public/media/order-*.webp`),
 * временные, пока нет записей экрана. Ховер: карточка приподнимается на 2 px
 * и получает тень, картинка растёт до 1.02 — оба за 240 мс.
 *
 * Тексты платформенные (с 09.09.2026): подписи хоткеев и имя файлового
 * менеджера берутся по системе гостя — ровно те строки, что покажет само
 * приложение (`app/web/src/lib/platform.ts`). Сами иллюстрации остаются
 * macOS-выгрузками: перерисовать панели под Windows нечем, а живые записи
 * экрана всё равно ждём от Сергея. Поэтому `alt` описывает картинку как она
 * есть, а не текст рядом с ней.
 */
import type { CSSProperties } from 'react';
import { Reveal } from './Reveal';
import { hotkey, platformCopy, usePlatform, type Platform } from '@/platform';

interface Card {
  id: string;
  title: string;
  text: string;
  src: string;
  alt: string;
  /** Пропорции панели-иллюстрации, как в макете. */
  ratio: string;
  /** Колонки из двенадцати. */
  span: string;
}

function cards(platform: Platform): Card[] {
  const copy = platformCopy(platform);
  return [
    {
      id: 'folders',
      title: 'Папки и перетаскивание',
      text: 'Папки и подпапки в сайдбаре. Карточки переносятся мышью — тащите на нужную папку, она подсветится.',
      src: '/media/order-folders.webp',
      alt: 'Сайдбар Копирки: карточка перетаскивается на папку «Типографика», папка подсвечена лаймом',
      ratio: '392 / 484',
      span: 'md:col-span-4',
    },
    {
      id: 'duplicates',
      title: 'Дубли не проскочат',
      text: 'При импорте похожий файл ловится по перцептивному хэшу. Копирка показывает оба и спрашивает, оставлять ли второй.',
      src: '/media/order-duplicates.webp',
      alt: 'Диалог «Похоже, это уже есть»: новый файл и файл из библиотеки рядом, совпадение 91 %',
      ratio: '784 / 484',
      span: 'md:col-span-8',
    },
    {
      id: 'tags',
      title: 'Свободные теги',
      text: 'Чипы прямо на карточке. Никаких обязательных полей и иерархий — называйте как удобно.',
      src: '/media/order-tags.webp',
      alt: 'Карточка референса с чипом папки сверху и тегами «Дашборд», «графики», «+2» снизу',
      ratio: '384 / 300',
      span: 'md:col-span-4',
    },
    {
      id: 'search',
      title: `Поиск ${hotkey('⌘K', platform)}`,
      text: 'По названию, тегам и дате. Плюс фильтры по типу файла и периоду — сужается за пару нажатий.',
      src: '/media/order-search.webp',
      alt: 'Поле поиска по названию с подсказкой ⌘K, рядом сортировка «Сначала новые» и кнопка «Фильтр»',
      ratio: '384 / 300',
      span: 'md:col-span-4',
    },
    {
      id: 'work',
      title: 'Сразу в работу',
      text: `«${copy.revealMenuItem}» или «Скопировать ${hotkey('⌘C', platform)}» — и картинка уже в макете. Корзина с отменой на случай промаха.`,
      src: '/media/order-work.webp',
      alt: 'Контекстное меню карточки: «Открыть», «Скопировать ⌘C», «В папку…», «Показать в Finder», «Удалить»',
      ratio: '384 / 300',
      span: 'md:col-span-4',
    },
  ];
}

export function Order() {
  const platform = usePlatform();
  const items = cards(platform);

  return (
    <section id="order" className="mx-auto max-w-[1200px] px-6 pb-[140px] md:px-10 xl:px-0">
      <Reveal>
        <p className="eyebrow m-0">Возможности · Порядок</p>
      </Reveal>
      <Reveal index={1}>
        <h2
          className="mt-6 mb-0 font-medium text-display"
          style={{ fontSize: 'clamp(30px, 4.17vw, 60px)', lineHeight: 1, letterSpacing: '-0.03em' }}
        >
          Порядок без усилий
        </h2>
      </Reveal>
      <Reveal index={2}>
        <p
          className="mt-5 mb-0 max-w-[760px] text-lead"
          style={{ fontSize: 'clamp(17px, 1.67vw, 24px)', lineHeight: 1.25 }}
        >
          Папки и подпапки, свободные теги, поиск по {hotkey('⌘K', platform)}, защита от дублей и
          быстрый выход в работу. Библиотека, которая не требует ритуалов.
        </p>
      </Reveal>

      <div className="mt-[72px] grid grid-cols-1 gap-6 md:grid-cols-12">
        {items.map((card, index) => (
          <Reveal key={card.id} index={index % 3} className={card.span}>
            <article className="group h-full">
              <div
                className={[
                  'overflow-hidden rounded-[14px] bg-panel md:rounded-[24px]',
                  'transition-[transform,box-shadow] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
                  'group-hover:-translate-y-0.5 group-hover:shadow-[0_16px_40px_#0000008c]',
                  'motion-reduce:transform-none motion-reduce:transition-none',
                ].join(' ')}
                style={{ aspectRatio: card.ratio } as CSSProperties}
              >
                <img
                  src={card.src}
                  alt={card.alt}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.02] motion-reduce:transform-none motion-reduce:transition-none"
                />
              </div>
              <h3
                className="mt-7 mb-0 font-medium text-display"
                style={{ fontSize: 24, lineHeight: '30px', letterSpacing: '-0.02em' }}
              >
                {card.title}
              </h3>
              <p className="mt-3 mb-0 text-body" style={{ fontSize: 18, lineHeight: '25px' }}>
                {card.text}
              </p>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
