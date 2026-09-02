/**
 * Настройки — SET-01, SET-02, SET-03, SET-05 и служебный блок SVC-04.
 *
 * Модалка поверх оболочки, а не отдельный экран (замечание Сергея 02.09.2026):
 * подменяя оболочку целиком, настройки уносили с собой шапку с зоной
 * перетаскивания — и окно приложения переставало двигаться.
 *
 * Состоянием формы владеет модалка, данными — вызывающая сторона: `settings`
 * приходит сверху, изменения уходят в `onSave`. Ошибки валидации показываются
 * у поля, тостами не дублируются (требование раздела «Настройки» задания).
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, ChevronRight, FolderOpen, RefreshCw } from 'lucide-react';
import type { AppConfig, SettingsResponse } from '@shared/api';
import { DEFAULT_PORT } from '@shared/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal, ModalContent } from '@/components/ui/Modal';
import { cn } from '@/lib/cn';
import { isTauri, pickDirectory } from '@/lib/tauri';
import { formatBytes, truncateMiddle } from './format';

/** Границы порта: ниже 1024 — привилегированные, выше 65535 не существует. */
const PORT_MIN = 1024;
const PORT_MAX = 65535;

/** Что вернул сервер после сохранения. Нужен только флаг перезапуска. */
export interface SettingsSaveResult {
  restartRequired?: boolean;
}

export interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null — данные ещё не пришли. */
  settings: SettingsResponse | null;
  /** Уходит только изменённое. Ошибку бросать исключением — модалка её покажет. */
  onSave: (patch: Partial<AppConfig>) => Promise<SettingsSaveResult | void>;
  className?: string;
}

// ── Раскладка ────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-9 first:mt-0">
      <div className="mb-4 flex items-center gap-3">
        <span className="label-section shrink-0">{title}</span>
        <span className="h-px flex-1 bg-line-strong" aria-hidden />
      </div>
      {children}
    </section>
  );
}

/**
 * Свёрнутый блок — D16. Порт нужен раз в жизни и только когда 43117 занят,
 * а на экране настроек он стоял вторым сверху и читался как обязательное поле.
 * Состояние живёт в памяти экрана: запоминать раскрытость между сеансами незачем.
 */
function Disclosure({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="mt-9 first:mt-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="group flex w-full items-center gap-2 text-left"
      >
        <ChevronRight
          className={cn(
            'size-3.5 shrink-0 text-ink-faint transition-transform duration-[var(--dur-fast)] ease-out',
            open && 'rotate-90',
          )}
          strokeWidth={2}
          aria-hidden
        />
        <span className="label-section shrink-0 transition-colors group-hover:text-ink">{title}</span>
        <span className="h-px flex-1 bg-line-strong" aria-hidden />
      </button>
      {open ? <div className="mt-4">{children}</div> : null}
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
    <div className="flex items-baseline gap-4 border-b border-line-strong py-2.5 last:border-b-0">
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

// ── Модалка ──────────────────────────────────────────────────────────────────

export function SettingsModal({ open, onOpenChange, settings, onSave, className }: SettingsModalProps) {
  const [libraryPath, setLibraryPath] = useState('');
  const [serverPort, setServerPort] = useState(String(DEFAULT_PORT));
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ field: 'libraryPath' | 'serverPort'; message: string } | null>(null);
  /** Порт уже записан в конфиг, но слушатель до перезапуска остаётся на старом. */
  const [restartFrom, setRestartFrom] = useState<number | null>(null);
  /** D16 — блок «Дополнительно» закрыт по умолчанию, раскрывается сам на ошибке порта. */
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  /** Диалог выбора папки не открылся — говорим об этом под полем, не тостом. */
  const [pickError, setPickError] = useState<string | null>(null);

  // Кнопка выбора папки есть только в приложении: в браузере JS абсолютный путь не отдаёт.
  const inTauri = isTauri();

  /*
    Черновик начинается заново, когда пришли новые данные с сервера и когда
    модалку открыли: закрытие по Esc, скриму или крестику правки не сохраняет —
    ровно как кнопка «Отменить». Компонент при этом остаётся смонтированным,
    поэтому состояние приходится сбрасывать руками.
  */
  useEffect(() => {
    if (!settings || !open) return;
    setLibraryPath(settings.libraryPath);
    setServerPort(String(settings.serverPort));
    setSubmitted(false);
    setFieldError(null);
    setFormError(null);
    setPickError(null);
  }, [settings, open]);

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
      <Modal open={open} onOpenChange={onOpenChange}>
        <ModalContent title="Настройки" size="lg" className={cn('max-h-[85vh]', className)}>
          <p className="py-6 text-center text-technical">Загружаем настройки…</p>
        </ModalContent>
      </Modal>
    );
  }

  const dirty = libraryPath !== settings.libraryPath || serverPort !== String(settings.serverPort);
  const invalid = Boolean(pathError || portError);
  // До первой попытки сохранения поля не краснеют — правим по ходу, не мешая.
  const showPathError =
    pickError ?? (submitted ? (fieldError?.field === 'libraryPath' ? fieldError.message : pathError) : null);
  const showPortError = submitted ? (fieldError?.field === 'serverPort' ? fieldError.message : portError) : null;

  const reset = () => {
    setLibraryPath(settings.libraryPath);
    setServerPort(String(settings.serverPort));
    setSubmitted(false);
    setFieldError(null);
    setFormError(null);
    setPickError(null);
  };

  /** SET-02 — системный диалог вместо ручного набора пути. Дальше обычный поток сохранения. */
  const chooseFolder = async () => {
    setPickError(null);
    setPicking(true);
    try {
      const selected = await pickDirectory({
        defaultPath: libraryPath.trim() === '' ? settings.libraryPath : libraryPath.trim(),
        title: 'Папка библиотеки «Копирки»',
      });
      // Отмена — не ошибка: молча оставляем поле как было.
      if (selected === null) return;
      setLibraryPath(selected);
      setFieldError(null);
      setFormError(null);
    } catch (error) {
      setPickError(
        error instanceof Error
          ? `Диалог выбора папки не открылся: ${error.message}`
          : 'Диалог выбора папки не открылся',
      );
    } finally {
      setPicking(false);
    }
  };

  const save = async () => {
    setSubmitted(true);
    setFieldError(null);
    setFormError(null);
    setPickError(null);
    if (invalid) {
      // Ошибка внутри свёрнутого блока была бы невидимой — раскрываем его.
      if (portError) setAdvancedOpen(true);
      return;
    }

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
      // port_busy — сервер проверил порт до записи: показываем у поля, а не общей ошибкой.
      else if (code === 'invalid_port' || code === 'port_busy') {
        setFieldError({ field: 'serverPort', message });
        setAdvancedOpen(true);
      } else setFormError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        title="Настройки"
        size="lg"
        className={cn('max-h-[85vh]', className)}
        bodyClassName="pb-1"
        footer={
          <>
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
          </>
        }
      >
        <div>
          {/* SET-01, SET-02 */}
          <Section title="Библиотека">
            <Field
              label="Путь библиотеки"
              htmlFor="settings-library-path"
              error={showPathError}
              hint="По умолчанию ~/Pictures/Копирка. Внутри — library.db, originals и previews."
            >
              <div className="flex gap-2">
                <Input
                  id="settings-library-path"
                  value={libraryPath}
                  spellCheck={false}
                  autoComplete="off"
                  aria-invalid={Boolean(showPathError)}
                  onChange={(event) => setLibraryPath(event.target.value)}
                  className={cn('min-w-0 flex-1 font-mono text-xs', showPathError && 'border-danger')}
                />
                {/* В браузере кнопки нет: JS не отдаёт абсолютный путь, а поле — отдаёт. */}
                {inTauri ? (
                  <Button
                    variant="secondary"
                    disabled={picking || saving}
                    onClick={() => void chooseFolder()}
                    icon={<FolderOpen className="size-4" strokeWidth={2} aria-hidden />}
                  >
                    Выбрать папку…
                  </Button>
                ) : null}
              </div>
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

          {/* SET-03, спрятан в «Дополнительно» — D16. */}
          <Disclosure
            title="Дополнительно"
            open={advancedOpen}
            onToggle={() => setAdvancedOpen((open) => !open)}
          >
            <p className="mb-4 text-sm text-ink-muted">
              Адрес, по которому приложение слушает расширение Chrome. Менять нужно, только если порт{' '}
              <span className="font-mono text-xs text-ink">{DEFAULT_PORT}</span> занят другой программой.
              После смены поменяйте адрес в расширении и перезапустите приложение.
            </p>
            <Field
              label="Порт"
              htmlFor="settings-port"
              error={showPortError}
              hint={`По умолчанию ${DEFAULT_PORT}.`}
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
          </Disclosure>

          {/* SET-05 в редакции 02.09.2026 (решение Сергея D1): «не разобрано» = нет папки. */}
          <Section title="«Не разобрано»">
            <p className="text-base text-ink">Сюда попадают файлы без папки.</p>
            <p className="mt-2 text-base text-ink-muted">
              Положил в папку — файл ушёл из раздела. Теги на это не влияют.
            </p>
            <p className="mt-2 text-sm text-ink-faint">
              Файлы из корзины в разделе не показываются. Правило в этой версии не настраивается.
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
      </ModalContent>
    </Modal>
  );
}
