/**
 * Онбординг первого запуска — экран 1 по PRD §6.1.
 * Показывается, пока `firstRunCompleted === false`. Один экран, не мастер:
 * объяснение в одну фразу, путь библиотеки и кнопка. Всё остальное — потом.
 */
import { useState, type FormEvent, type ReactNode } from 'react';
import { ClipboardPaste, FolderOpen, ImageDown, Puzzle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/cn';
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

const HINTS: readonly { icon: ReactNode; text: ReactNode }[] = [
  { icon: <ImageDown className="size-3.5" strokeWidth={2} aria-hidden />, text: 'Перетащите картинки прямо в окно' },
  {
    icon: <ClipboardPaste className="size-3.5" strokeWidth={2} aria-hidden />,
    text: (
      <>
        Вставьте из буфера обмена —{' '}
        {/* 11px, а не 10: строкой ниже 13px чип на 10px превращается в пятно. */}
        <span className="rounded-xs bg-surface-active px-1.5 py-0.5 font-mono text-xs text-ink">⌘V</span>
      </>
    ),
  },
  {
    icon: <Puzzle className="size-3.5" strokeWidth={2} aria-hidden />,
    text: 'Сохраняйте из браузера через расширение «Копирка»',
  },
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
    <div className={cn('relative h-full overflow-y-auto bg-bg', className)}>
      {/*
        Полоса перетаскивания окна. Оболочки с шапкой на онбординге нет, и первое
        окно приложения нечем было двигать (замечание Сергея 02.09.2026). Высота —
        `--size-topbar`: десктопная обёртка уже прибавила к нему инсет 28px под
        светофор macOS, так что полоса накрывает и его. Обёртка нулевой высоты и
        `sticky` — полоса не занимает места в потоке, держится у верха видимой
        области и никогда не вылезает за пределы экрана онбординга. Лежит поверх
        содержимого нарочно: иначе нажатие досталось бы блоку с текстом, а
        интерактивного в этих 60 px ничего нет — только логотип. В браузере это
        обычный div без поведения.
      */}
      <div aria-hidden className="sticky top-0 z-10 h-0">
        <div data-tauri-drag-region="deep" className="h-[var(--size-topbar)]" />
      </div>

      <div className="flex min-h-full items-center justify-center px-6 py-12">
        <div className="w-full max-w-[420px]">
          <div className="flex items-center gap-2.5">
            <span
              className="size-[22px] shrink-0 rounded-sm bg-linear-to-br from-accent to-accent-deep"
              aria-hidden
            />
            <span className="text-lg font-medium text-ink">Копирка</span>
          </div>

          <h1 className="mt-7 text-2xl leading-tight font-medium tracking-tight text-ink">
            Соберём библиотеку референсов
          </h1>
          <p className="mt-3 text-md text-ink-muted">
            Скриншоты, картинки и экспорты — в одной плотной сетке, а файлы остаются у вас на диске.
          </p>

          <form onSubmit={handleSubmit} className="mt-8">
            <label htmlFor="onboarding-path" className="label-section block">
              Путь библиотеки
            </label>
            <div className="mt-2 flex gap-2">
              <Input
                id="onboarding-path"
                value={path}
                spellCheck={false}
                autoComplete="off"
                autoFocus
                aria-invalid={Boolean(shown)}
                onChange={(event) => setPath(event.target.value)}
                className={cn('min-w-0 flex-1 font-mono text-xs', shown && 'border-danger')}
              />
              {inTauri ? (
                <Button
                  variant="secondary"
                  disabled={disabled || picking}
                  onClick={() => void chooseFolder()}
                  icon={<FolderOpen className="size-4" strokeWidth={2} aria-hidden />}
                >
                  Выбрать папку…
                </Button>
              ) : null}
            </div>
            {shown ? (
              <p role="alert" className="mt-1.5 text-sm text-danger">
                {shown}
              </p>
            ) : (
              <p className="mt-1.5 text-sm text-ink-muted">
                Папку создадим, если её ещё нет. Путь можно поменять позже в настройках.
              </p>
            )}

            <Button type="submit" variant="primary" fullWidth disabled={disabled} className="mt-5">
              {pending ? 'Создаём…' : 'Создать библиотеку'}
            </Button>
          </form>

          <div className="mt-9 border-t border-line pt-5">
            <p className="label-section">Как наполнять</p>
            <ul className="mt-3 space-y-2.5">
              {HINTS.map((hint, index) => (
                <li key={index} className="flex items-center gap-3">
                  <span className="flex size-4 shrink-0 items-center justify-center text-ink-faint">
                    {hint.icon}
                  </span>
                  <span className="text-base text-ink-muted">{hint.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
