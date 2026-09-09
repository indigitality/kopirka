/**
 * Единственное место, где живут внешние ссылки и факты о релизе.
 *
 * Правило: ни один компонент не пишет URL или цифру у себя. Что известно —
 * подтверждено `wiki/RELEASE.md` (обновлён 04.09.2026), `app/README.md` и
 * кодом сборки. Что неизвестно — константа со значением `'#'` (или `null`,
 * если это число) и пометкой `[?]` в комментарии: так видно, что спросить у
 * Сергея, и лендинг при этом собирается и работает.
 *
 * С 09.09.2026 сборок две — macOS и Windows. Поэтому всё платформенное
 * (файлы, вес, требования, инструкция) лежит не плоскими константами, а
 * записью `PLATFORMS` по системам: добавить третью систему — значит дописать
 * сюда ключ, а не править шесть компонентов.
 */
import type { PlatformId } from '@/platform';

/** Версия и месяц сборки — общие для обеих платформ. `confirmed`. */
export const RELEASE = {
  version: '0.2.0',
  /** Месяц сборки, для подвала. */
  date: 'сентябрь 2026',
} as const;

/** Одна загружаемая сборка — кнопка-строка в блоке «Скачать». */
export interface Build {
  id: string;
  /** Первая строка кнопки. */
  title: string;
  /** Вторая строка, мелким. */
  note: string;
  /** Адрес файла на сервере раздачи. */
  href: string;
  /**
   * Имя, под которым файл ляжет на диск (атрибут `download`). С 09.09.2026
   * качается не установщик, а архив «установщик + инструкция», и имя у всех
   * трёх архивов ASCII — то же, что отдаёт сервер в `Content-Disposition`.
   * Так осознанно: архив пересылают мессенджерами и распаковывают чем попало, а
   * кириллицу в имени файла и то и другое исторически ломает. Человеческие
   * русские имена лежат внутри архива — за них там отвечает бит 11 (UTF-8)
   * в самом zip (`work/лендинг (это сделал клод)/деплой/pack-downloads.sh`).
   */
  file: string;
}

/** Всё, что страница знает про одну систему. */
export interface PlatformRelease {
  id: PlatformId;
  /** Название системы в тексте страницы. */
  label: string;
  /** Требования к системе, как их писать человеку. */
  minOS: string;
  /** Архитектуры, под которые есть сборки. */
  arch: string;
  /** Вес загрузки (архива). `null` — файла ещё нет, и цифру выдумывать нельзя. */
  size: string | null;
  /** Сборки этой системы, в порядке показа. */
  builds: Build[];
  /** PDF-инструкция по установке именно для этой системы. */
  guide: string;
}

/**
 * Сборки, требования и инструкции по системам.
 *
 * С 09.09.2026 качается не установщик, а архив: внутри установщик под эту
 * систему и PDF-инструкция для неё. Требование Сергея — что бы человек ни
 * скачал, инструкция должна лежать в скачанном, а не отдельной ссылкой рядом.
 * Архивы собирает `work/лендинг (это сделал клод)/деплой/pack-downloads.sh`,
 * он же печатает их размеры — цифры `size` ниже взяты из его вывода.
 *
 * macOS — `wiki/RELEASE.md`: два образа, минимум macOS 13. Архивы —
 * 47 742 308 байт (Apple Silicon) и 50 347 556 (Intel), отсюда «48–50 МБ».
 * Windows — `desktop/src-tauri/tauri.windows.conf.json` и
 * `desktop/scripts/build-windows.mjs`: NSIS-установщик `currentUser` (права
 * администратора не нужны), только x64. Требования — Windows 10 1809+ / 11:
 * ниже 1809 не живёт WebView2, который установщик несёт загрузчиком
 * (`webviewInstallMode: embedBootstrapper`).
 */
export const PLATFORMS: Record<PlatformId, PlatformRelease> = {
  macos: {
    id: 'macos',
    label: 'macOS',
    minOS: 'macOS 13+',
    arch: 'Apple Silicon и Intel',
    size: '48–50 МБ',
    builds: [
      {
        id: 'aarch64',
        title: 'Apple Silicon',
        note: 'M1 и новее',
        href: '/downloads/Kopirka_0.2.0_macOS_AppleSilicon.zip',
        file: 'Kopirka_0.2.0_macOS_AppleSilicon.zip',
      },
      {
        id: 'mac-x64',
        title: 'Intel',
        note: 'Mac до 2020 года',
        href: '/downloads/Kopirka_0.2.0_macOS_Intel.zip',
        file: 'Kopirka_0.2.0_macOS_Intel.zip',
      },
    ],
    /** Источник — `app/docs/install-guide.md`. На сервере лежит под этим именем. */
    guide: '/downloads/Kopirka_Install_Guide.pdf',
  },
  windows: {
    id: 'windows',
    label: 'Windows',
    minOS: 'Windows 10 (1809) и 11',
    arch: 'x64',
    /** Вес архива — 34 359 357 байт, из вывода `pack-downloads.sh` (09.09.2026). */
    size: '34 МБ',
    builds: [
      {
        id: 'win-x64',
        title: 'Windows x64',
        note: 'Установщик, без прав администратора',
        href: '/downloads/Kopirka_0.2.0_Windows_x64.zip',
        file: 'Kopirka_0.2.0_Windows_x64.zip',
      },
    ],
    /** Отдельная инструкция для Windows — тот же образец имени, что у macOS. */
    guide: '/downloads/Kopirka_Install_Guide_Windows.pdf',
  },
};

/**
 * Порядок показа систем: своя — первой. Гость с неопознанной системой видит
 * прежний порядок (macOS, потом Windows).
 */
export function platformOrder(guest: PlatformId | 'other'): PlatformId[] {
  return guest === 'windows' ? ['windows', 'macos'] : ['macos', 'windows'];
}

/**
 * Файлы, общие для обеих систем. Адреса относительные — лендинг публикуется на
 * том же домене, что и раздача. Файлы кладёт в папку раздачи
 * `work/лендинг (это сделал клод)/деплой/deploy.sh`; сервер отдаёт их с
 * заголовком `Content-Disposition` (карта в `provision.sh`).
 */
export const DOWNLOAD = {
  /** Zip расширения Chrome: ставится распакованным, автообновлений нет. */
  extensionZip: '/downloads/Kopirka_Chrome_Extension_0.2.0.zip',
} as const;

/**
 * Репозиторий. Адрес известен и подтверждён (`wiki/RELEASE.md`), но пока
 * приватный: ссылка ведёт на 404 для всех, кроме Сергея.
 */
export const GITHUB = 'https://github.com/indigitality/kopirka';

/**
 * Репозиторий приватный (LND-10) — пока `false` кнопка/ссылка GitHub на сайте
 * не рендерится вовсе. Переключить в `true`, когда Сергей откроет репозиторий.
 */
export const GITHUB_PUBLIC = false;

/** «Сообщить об ошибке» — тот же адрес, что зашит в приложении. `confirmed`. */
export const TELEGRAM = 'https://t.me/orshaks';

/**
 * Канал доната — DonationAlerts студии. Адрес дал Сергей 09.09.2026. `confirmed`.
 *
 * Общее правило осталось: если значение ссылки — `'#'`, компонент не рисует для
 * неё ни кнопку, ни ссылку. См. `isLive` ниже.
 */
export const DONATE = 'https://www.donationalerts.com/r/instat';

/** Живая ли ссылка — не заглушка `'#'`. Единое место для этой проверки. */
export function isLive(url: string): boolean {
  return url !== '#';
}


/**
 * [?] Студия-спонсор. Домен взят из текста фрейма A, а тексты там черновые —
 * их писали агенты, Сергей адрес не подтверждал. Значение оставлено рабочим,
 * но перед публикацией проверить. Логотипа у нас тоже нет — см. Instat.tsx.
 */
export const INSTAT = 'https://instat.pro';

/**
 * Путь библиотеки на диске — так, как его видит пользователь каждой системы.
 * Первоисточник: `app/server/src/config.ts` (`defaultLibraryPathFor`) и
 * `app/web/src/lib/platform.ts` (`defaultLibraryPath`).
 */
export const LIBRARY_PATH: Record<PlatformId, string> = {
  macos: '~/Pictures/Копирка',
  windows: String.raw`%USERPROFILE%\Pictures\Копирка`,
};
