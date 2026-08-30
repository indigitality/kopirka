/**
 * Экран настроек — SET-01, SET-02, SET-03, SET-05 и служебный блок SVC-04.
 *
 * Состоянием формы владеет экран, данными — вызывающая сторона: `settings` приходит
 * сверху, изменения уходят в `onSave`. Ошибки валидации показываются у поля,
 * тостами не дублируются (требование раздела «Настройки» задания).
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import type { AppConfig, SettingsResponse } from '@shared/api';
import { DEFAULT_PORT } from '@shared/api';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/cn';
import { formatBytes, truncateMiddle } from './format';

/** Границы порта: ниже 1024 — привилегированные, выше 65535 не существует. */
const PORT_MIN = 1024;
const PORT_MAX = 65535;

/** Что вернул сервер после сохранения. Нужен только флаг перезапуска. */
export interface SettingsSaveResult {
  restartRequired?: boolean;
}

export interface SettingsScreenProps {
  /** null — данные ещё не пришли. */
  settings: SettingsResponse | null;
  /** Уходит только изменённое. Ошибку бросать исключением — экран её покажет. */
  onSave: (patch: Partial<AppConfig>) => Promise<SettingsSaveResult | void>;
  /** Крестик в шапке; без обработчика не рисуется. */
  onClose?: () => void;
  className?: string;
}

// ── Раскладка ────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-9 first:mt-0">
      <div className="mb-4 flex items-center gap-3">
        <span className="label-section shrink-0">{title}</span>
        <span className="h-px flex-1 bg-line" aria-hidden />
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-base text-ink">
        {label}
      </label>
      <div className="mt-2">{children}</div>
      {error ? (
        <p role="alert" className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-sm text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}

function InfoRow({ label, value, title, mono }: { label: string; value: string; title?: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-4 border-b border-line py-2.5 last:border-b-0">
      <span className="w-[164px] shrink-0 text-base text-ink-muted">{label}</span>
      <span
        title={title ?? value}
        className={cn('min-w-0 flex-1 text-ink', mono ? 'font-mono text-xs' : 'text-base')}
      >
        {value}
      </span>
    </div>
  );
}

// ── Экран ────────────────────────────────────────────────────────────────────

export function SettingsScreen({ settings, onSave, onClose, className }: SettingsScreenProps) {
  const [libraryPath, setLibraryPath] = useState('');
  const [serverPort, setServerPort] = useState(String(DEFAULT_PORT));
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ field: 'libraryPath' | 'serverPort'; message: string } | null>(null);
  /** Порт уже записан в конфиг, но слушатель до перезапуска остаётся на старом. */
  const [restartFrom, setRestartFrom] = useState<number | null>(null);

  // Пришли новые данные с сервера — черновик начинается заново.
  useEffect(() => {
    if (!settings) return;
    setLibraryPath(settings.libraryPath);
    setServerPort(String(settings.serverPort));
    setSubmitted(false);
    setFieldError(null);
    setFormError(null);
  }, [settings]);

  const pathError = useMemo(() => {
    if (libraryPath.trim()) return null;
    return 'Укажите путь к папке библиотеки';
  }, [libraryPath]);

  const portError = useMemo(() => {
    const raw = serverPort.trim();
    if (!/^\d+$/.test(raw)) return 'Порт — целое число';
    const value = Number(raw);
    if (value < PORT_MIN || value > PORT_MAX) return `Порт должен быть от ${PORT_MIN} до ${PORT_MAX}`;
    return null;
  }, [serverPort]);

  if (!settings) {
    return (
      <div className={cn('flex h-full items-center justify-center bg-bg', className)}>
        <p className="text-technical">Загружаем настройки…</p>
      </div>
    );
  }

  const dirty = libraryPath !== settings.libraryPath || serverPort !== String(settings.serverPort);
  const invalid = Boolean(pathError || portError);
  // До первой попытки сохранения поля не краснеют — правим по ходу, не мешая.
  const showPathError = submitted ? (fieldError?.field === 'libraryPath' ? fieldError.message : pathError) : null;
  const showPortError = submitted ? (fieldError?.field === 'serverPort' ? fieldError.message : portError) : null;

  const reset = () => {
    setLibraryPath(settings.libraryPath);
    setServerPort(String(settings.serverPort));
    setSubmitted(false);
    setFieldError(null);
    setFormError(null);
  };

  const save = async () => {
    setSubmitted(true);
    setFieldError(null);
    setFormError(null);
    if (invalid) return;

    const patch: Partial<AppConfig> = {};
    if (libraryPath !== settings.libraryPath) patch.libraryPath = libraryPath.trim();
    const port = Number(serverPort);
    if (port !== settings.serverPort) patch.serverPort = port;
    if (Object.keys(patch).length === 0) return;

    setSaving(true);
    try {
      const result = await onSave(patch);
      setSavedAt(Date.now());
      if (result?.restartRequired) setRestartFrom(settings.serverPort);
    } catch (error) {
      const code = (error as { code?: string }).code;
      const message = error instanceof Error ? error.message : 'Не удалось сохранить';
      if (code === 'invalid_library_path') setFieldError({ field: 'libraryPath', message });
      else if (code === 'invalid_port') setFieldError({ field: 'serverPort', message });
      else setFormError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn('flex h-full min-h-0 flex-col bg-bg', className)}>
      <header className="flex h-[var(--size-topbar)] shrink-0 items-center gap-3 px-[var(--grid-pad)]">
        <div className="mx-auto flex w-full max-w-[560px] items-center gap-3">
          <h1 className="text-xl font-medium tracking-tight text-ink">Настройки</h1>
          <div className="flex-1" />
          {onClose ? (
            <IconButton label="Закрыть настройки" onClick={onClose} className="-mr-2">
              <X className="size-4" strokeWidth={2} aria-hidden />
            </IconButton>
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-[var(--grid-pad)] pt-1 pb-10">
        <div className="mx-auto w-full max-w-[560px]">
          {/* SET-01, SET-02 */}
          <Section title="Библиотека">
            <Field
              label="Путь библиотеки"
              htmlFor="settings-library-path"
              error={showPathError}
              hint="По умолчанию ~/Pictures/Копирка. Внутри — library.db, originals и previews."
            >
              <Input
                id="settings-library-path"
                value={libraryPath}
                spellCheck={false}
                autoComplete="off"
                aria-invalid={Boolean(showPathError)}
                onChange={(event) => setLibraryPath(event.target.value)}
                className={cn('font-mono text-xs', showPathError && 'border-danger')}
              />
            </Field>

            {/* PRD §7.2 — формулировка намеренно прямая, без смягчения. */}
            <div className="mt-3 flex gap-2.5 rounded-md bg-warning-soft px-3 py-2.5">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" strokeWidth={2} aria-hidden />
              <p className="text-sm text-ink-muted">
                <span className="text-ink">Смена пути не переносит файлы.</span> Приложение просто начнёт
                работать с новой директорией — пустой или ранее существовавшей. Перенести библиотеку нужно
                вручную в Finder при закрытом приложении.
              </p>
            </div>
          </Section>

          {/* SET-03 */}
          <Section title="Сервер">
            <Field
              label="Порт"
              htmlFor="settings-port"
              error={showPortError}
              hint={`По умолчанию ${DEFAULT_PORT}. Порт фиксированный: расширение Chrome должно знать адрес заранее.`}
            >
              <Input
                id="settings-port"
                value={serverPort}
                inputMode="numeric"
                autoComplete="off"
                aria-invalid={Boolean(showPortError)}
                onChange={(event) => setServerPort(event.target.value.replace(/[^\d]/g, ''))}
                className={cn('w-[140px] font-mono text-xs', showPortError && 'border-danger')}
              />
            </Field>

            {restartFrom !== null ? (
              <div className="mt-3 flex gap-2.5 rounded-md bg-accent-soft px-3 py-2.5">
                <RefreshCw className="mt-0.5 size-3.5 shrink-0 text-accent" strokeWidth={2} aria-hidden />
                <p className="text-sm text-ink-muted">
                  <span className="text-ink">Порт изменится после перезапуска.</span> Пока приложение
                  не перезапущено, сервер продолжает слушать{' '}
                  <span className="font-mono text-xs text-ink">{restartFrom}</span>. Не забудьте поменять
                  адрес в настройках расширения.
                </p>
              </div>
            ) : null}
          </Section>

          {/* SET-05 — правило действует, но в MVP не настраивается. */}
          <Section title="«Не разобрано»">
            <p className="text-base text-ink-muted">
              Файл попадает в раздел, если выполнено <span className="text-ink">хотя бы одно</span> условие:
            </p>
            <ul className="mt-3 space-y-2">
              {['у файла нет папки', 'у файла нет ни одного тега'].map((rule, index) => (
                <li key={rule} className="flex items-center gap-3">
                  <span className="flex w-8 shrink-0 justify-center">
                    {index === 0 ? (
                      <span className="size-1.5 rounded-pill bg-ink-faint" aria-hidden />
                    ) : (
                      <span className="font-mono text-2xs tracking-label text-ink-faint uppercase">или</span>
                    )}
                  </span>
                  <span className="text-base text-ink">{rule}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-ink-faint">
              Файл с папкой, но без тегов — попадает. С тегами, но без папки — тоже. Файлы из корзины
              в разделе не показываются. Правило в этой версии не настраивается.
            </p>
          </Section>

          <Section title="О программе">
            <div className="rounded-md bg-surface-raised px-3 py-1">
              <InfoRow label="Версия приложения" value={settings.appVersion} mono />
              <InfoRow label="Версия схемы БД" value={String(settings.schemaVersion)} mono />
              <InfoRow label="Размер библиотеки" value={formatBytes(settings.librarySizeBytes)} mono />
              <InfoRow
                label="Файл лога"
                value={truncateMiddle(settings.logPath)}
                title={settings.logPath}
                mono
              />
            </div>
          </Section>
        </div>
      </div>

      <footer className="shrink-0 border-t border-line bg-surface px-[var(--grid-pad)] py-3">
        <div className="mx-auto flex w-full max-w-[560px] items-center gap-3">
          <p
            className={cn(
              'min-w-0 flex-1 truncate text-sm',
              formError ? 'text-danger' : 'text-ink-faint',
            )}
          >
            {formError ?? (dirty ? 'Есть несохранённые изменения' : savedAt ? 'Сохранено' : '')}
          </p>
          <Button variant="ghost" disabled={!dirty || saving} onClick={reset}>
            Отменить
          </Button>
          <Button variant="primary" disabled={!dirty || saving} onClick={save}>
            {saving ? 'Сохраняем…' : 'Сохранить'}
          </Button>
        </div>
      </footer>
    </div>
  );
}
