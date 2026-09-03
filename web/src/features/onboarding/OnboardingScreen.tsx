/**
 * Онбординг первого запуска — экран 1 по PRD §6.1, редизайн — артборд R11.
 * Показывается, пока `firstRunCompleted === false`. Один экран, не мастер:
 * объяснение в одну фразу, путь библиотеки и кнопка. Всё остальное — потом.
 *
 * Оболочка та же, что у всего приложения: фон окна `--color-app`, поле
 * `--shell-pad`, внутри — одна панель `--color-panel` с радиусом
 * `--radius-panel`. Колонка 420 стоит по центру панели, элементы разделены
 * зазором 28 (узлы R11); подзаголовок поджат к заголовку на 14.
 */
import { useState, type FormEvent, type ReactNode } from 'react';
import { Clipboard, Folder, Image, Puzzle, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Logo } from '@/components/ui/Logo';
import { cn } from '@/lib/cn';
import { Icon } from '@/lib/icons';
import { isTauri, pickDirectory } from '@/lib/tauri';

/** SET-01 — путь библиотеки по умолчанию. */
export const DEFAULT_LIBRARY_PATH = '~/Pictures/Копирка';

export interface OnboardingScreenProps {
  /** Предзаполнение поля. */
  defaultPath?: string;
  /** Создать библиотеку: PATCH /api/settings + POST /api/onboarding/complete. */
  onSubmit: (libraryPath: string) => Promise<void> | void;
  /** Внешняя блокировка (например, идёт запрос выше по дереву). */
  busy?: boolean;
  className?: string;
}

const HINTS: readonly { icon: LucideIcon; text: ReactNode }[] = [
  { icon: Image, text: 'Перетащите картинки прямо в окно' },
  {
    icon: Clipboard,
    text: (
      <>
        Вставьте из буфера обмена —{' '}
        {/* Чип хоткея: 18 в высоту, поля 6, радиус `--radius-sm`, текст 10/12. */}
        <span className="ml-0.5 inline-flex h-[18px] items-center rounded-sm bg-control px-1.5 align-middle text-2xs leading-3 text-ink-muted">
          ⌘V
        </span>
      </>
    ),
  },
  { icon: Puzzle, text: 'Сохраняйте из браузера через расширение «Копирка»' },
];

export function OnboardingScreen({
  defaultPath = DEFAULT_LIBRARY_PATH,
  onSubmit,
  busy,
  className,
}: OnboardingScreenProps) {
  const [path, setPath] = useState(defaultPath);
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Диалог выбора папки не открылся — пишем под полем, тостов на онбординге нет. */
  const [pickError, setPickError] = useState<string | null>(null);

  const emptyError = path.trim() ? null : 'Укажите путь к папке библиотеки';
  const shown = pickError ?? (submitted ? (error ?? emptyError) : null);
  const disabled = pending || busy;

  // Кнопки нет в браузере: абсолютный путь оттуда взять неоткуда, поле остаётся единственным входом.
  const inTauri = isTauri();

  /** Системный выбор папки. Дальше — обычная отправка формы кнопкой «Создать библиотеку». */
  const chooseFolder = async () => {
    setPickError(null);
    setPicking(true);
    try {
      const selected = await pickDirectory({
        defaultPath: path.trim() === '' ? undefined : path.trim(),
        title: 'Папка библиотеки «Копирки»',
      });
      // Отмена — не ошибка: поле остаётся как было.
      if (selected === null) return;
      setPath(selected);
      setError(null);
    } catch (cause) {
      setPickError(
        cause instanceof Error
          ? `Диалог выбора папки не открылся: ${cause.message}`
          : 'Диалог выбора папки не открылся',
      );
    } finally {
      setPicking(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    setError(null);
    setPickError(null);
    if (emptyError) return;

    setPending(true);
    try {
      await onSubmit(path.trim());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось создать библиотеку');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={cn('flex h-full flex-col bg-app p-[var(--shell-pad)]', className)}>
      <div className="min-h-0 flex-1 overflow-y-auto rounded-[var(--radius-panel)] bg-panel">
        {/*
          Полоса перетаскивания окна. Верхней панели оболочки на онбординге нет,
          и первое окно приложения нечем было двигать (замечание Сергея
          02.09.2026). Высота — `--size-topbar`, как у верхней панели оболочки.
          Обёртка нулевой высоты и `sticky`: полоса не занимает места в потоке,
          держится у верха видимой области и не мешает прокрутке колеса — она
          лежит внутри прокручиваемого блока. Интерактивного в этих 60 px нет:
          колонка стоит по центру. В браузере это обычный div без поведения.
        */}
        <div aria-hidden className="sticky top-0 z-10 h-0">
          <div data-tauri-drag-region="deep" className="h-[var(--size-topbar)]" />
        </div>

        {/* `min-h-full` + центрирование: в низком окне колонка не обрезается сверху. */}
        <div className="flex min-h-full items-center justify-center px-6 py-12">
          <div className="flex w-full max-w-[420px] flex-col items-start gap-7">
            <Logo />

            <h1 className="text-2xl leading-[34px] font-medium tracking-tight text-ink">
              Соберём библиотеку референсов
            </h1>
            {/* Подзаголовок принадлежит заголовку: −14 гасит половину зазора колонки. */}
            <p className="-mt-3.5 text-md leading-[21px] text-ink-muted">
              Скриншоты, картинки и экспорты — в одной плотной сетке, а файлы остаются у вас на диске.
            </p>

            <form onSubmit={handleSubmit} className="flex w-full flex-col gap-2">
              <label htmlFor="onboarding-path" className="label-section">
                Путь библиотеки
              </label>
              <div className="flex items-center gap-2">
                <Input
                  id="onboarding-path"
                  value={path}
                  spellCheck={false}
                  autoComplete="off"
                  autoFocus
                  aria-invalid={Boolean(shown)}
                  onChange={(event) => setPath(event.target.value)}
                  /* Путь набран мельче тела — 12/16, как в R10 и R11. */
                  className={cn(
                    'min-w-0 flex-1 text-sm leading-4',
                    shown && 'shadow-[inset_0_0_0_1px_var(--color-danger)]',
                  )}
                />
                {inTauri ? (
                  <Button
                    variant="secondary"
                    disabled={disabled || picking}
                    onClick={() => void chooseFolder()}
                    icon={<Icon icon={Folder} aria-hidden />}
                  >
                    Выбрать папку…
                  </Button>
                ) : null}
              </div>
              {shown ? (
                <p role="alert" className="text-sm leading-[18px] text-danger">
                  {shown}
                </p>
              ) : (
                <p className="text-sm leading-[18px] text-ink-faint">
                  Папку создадим, если её ещё нет. Путь можно поменять позже в настройках.
                </p>
              )}

              {/*
                Кнопка живёт внутри формы (иначе Enter её не отправит), а стоять
                должна на зазоре колонки: 8 от `gap-2` формы плюс 20 отступа = 28.
              */}
              <Button type="submit" variant="primary" size="lg" fullWidth disabled={disabled} className="mt-5">
                {pending ? 'Создаём…' : 'Создать библиотеку'}
              </Button>
            </form>

            <div className="h-px w-full shrink-0 bg-line-strong" aria-hidden />

            <div className="flex w-full flex-col">
              <p className="label-section mb-2">Как наполнять</p>
              {HINTS.map((hint, index) => (
                <div key={index} className="flex h-7 items-center gap-2.5">
                  <Icon icon={hint.icon} className="shrink-0 text-ink-faint" aria-hidden />
                  <span className="text-base leading-4 text-ink-muted">{hint.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
