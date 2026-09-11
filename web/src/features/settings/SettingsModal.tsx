/**
 * Настройки — SET-01, SET-02, SET-03, SET-05 и служебный блок SVC-04.
 *
 * Редизайн 02.09.2026, артборд R10: не диалог на 640, а панель на всё окно
 * поверх оболочки — поле `--shell-pad` по краям, радиус `--radius-panel`, фон
 * `--color-panel`. Оболочка при этом остаётся смонтированной: панель — слой
 * (`Modal size="panel"`), а не подмена экрана. Так окно продолжает тянуться
 * (зона перетаскивания переехала в шапку панели), а закрытие возвращает ровно
 * то, что было под ней.
 *
 * Колонка контента — 720 по центру, разделы разделены зазором 32. Внутри
 * раздела заголовок и тело стоят на 12, поле и подпись — на 8 (узлы R10).
 *
 * Состоянием формы владеет панель, данными — вызывающая сторона: `settings`
 * приходит сверху, изменения уходят в `onSave`. Ошибки валидации показываются
 * у поля, тостами не дублируются (требование раздела «Настройки» задания).
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight, Folder, RefreshCw, RotateCcw, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { AppConfig, SettingsResponse } from '@shared/api';
import { DEFAULT_CAPTURE_SHORTCUT, DEFAULT_PORT } from '@shared/api';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Modal, ModalContent } from '@/components/ui/Modal';
import { Switch } from '@/components/ui/Switch';
import { layerMotion } from '@/components/ui/motion-presets';
import { cn } from '@/lib/cn';
import { Icon } from '@/lib/icons';
import { isWindowsShell, platformStrings } from '@/lib/platform';
import {
  modifierLabel,
  recordFromEvent,
  shortcutKeycaps,
  shortcutLabel,
  systemConflict,
  type Modifier,
} from '@/lib/shortcut';
import { isTauri, pickDirectory } from '@/lib/tauri';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { fetchSettings } from './api';
import { formatBytes, truncateMiddle } from './format';

/** Границы порта: ниже 1024 — привилегированные, выше 65535 не существует. */
const PORT_MIN = 1024;
const PORT_MAX = 65535;

/**
 * FDB-10 — как долго ждём отчёт оболочки о регистрации хоткея. Её поллер ходит за
 * конфигом раз в две секунды, так что первый ответ приходит за 2–3 с; восемь —
 * с запасом на медленный диск и на то, что тик только что прошёл.
 */
const STATUS_POLL_MS = 700;
const STATUS_TIMEOUT_MS = 8000;

/** Метка «ждём отчёт про выключённый хоткей»: `null` уже занят под «не ждём». */
const OFF = '\u0000off';

/** Что вернул сервер после сохранения. Нужен только флаг перезапуска. */
export interface SettingsSaveResult {
  restartRequired?: boolean;
}

export interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null — данные ещё не пришли. */
  settings: SettingsResponse | null;
  /** Уходит только изменённое. Ошибку бросать исключением — панель её покажет. */
  onSave: (patch: Partial<AppConfig>) => Promise<SettingsSaveResult | void>;
  className?: string;
}

/*
  Путь на диске в R10 набран мельче тела — 12/16 вместо 14/18 примитива:
  строка длинная, и на 14 она в колонку 720 не помещается. Держим здесь, а не
  в `Input`: во всех остальных полях редизайна (тег, порт) размер примитивный.
*/
const PATH_INPUT = 'text-sm leading-4';

// ── Раскладка ────────────────────────────────────────────────────────────────

/** Раздел колонки: заголовок 10/12 · 500 · uppercase и тело под ним (R10). */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="label-section">{title}</h3>
      {children}
    </section>
  );
}

/**
 * Свёрнутый блок — D16. Порт нужен раз в жизни и только когда 43117 занят,
 * а на экране настроек он стоял вторым сверху и читался как обязательное поле.
 * Состояние живёт в памяти экрана: запоминать раскрытость между сеансами незачем.
 *
 * В R10 строка собрана как шеврон 14 + заголовок раздела + линия до правого
 * края: заголовок и разделитель разделов — один и тот же элемент.
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
    <section className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="group flex w-full items-center gap-2 text-left"
      >
        <Icon
          icon={ChevronRight}
          size={14}
          className={cn(
            'shrink-0 text-ink-muted transition-transform duration-[var(--dur-fast)] ease-out',
            open && 'rotate-90',
          )}
          aria-hidden
        />
        <span className="label-section shrink-0 transition-colors group-hover:text-ink">{title}</span>
        <span className="h-px flex-1 bg-line-strong" aria-hidden />
      </button>
      {open ? children : null}
    </section>
  );
}

/** Поле с подписью: метка 14/18 · 500, контрол, подсказка или ошибка 12/18. */
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
    <div className="flex flex-col gap-2">
      <label htmlFor={htmlFor} className="text-md leading-[18px] font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-sm leading-[18px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm leading-[18px] text-ink-faint">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Полоса-предупреждение: заливка тинтом, иконка того же цвета, что и первая
 * строка. R10 — «Смена пути не переносит файлы», далее теми же средствами
 * собраны служебные сообщения о перезапуске.
 */
const NOTICE_TONE = {
  warning: { box: 'bg-warning-tint', ink: 'text-warning' },
  brand: { box: 'bg-brand-tint', ink: 'text-brand' },
  danger: { box: 'bg-danger-tint', ink: 'text-danger' },
} as const;

function Notice({
  tone,
  icon,
  title,
  children,
}: {
  tone: keyof typeof NOTICE_TONE;
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  const style = NOTICE_TONE[tone];

  return (
    <div className={cn('flex gap-2.5 rounded-card p-3.5', style.box)}>
      {/* Пиксель сверху ставит иконку на оптическую линию первой строки. */}
      <span className="shrink-0 pt-px">
        <Icon icon={icon} className={style.ink} aria-hidden />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className={cn('text-md leading-[18px] font-medium', style.ink)}>{title}</p>
        <p className="text-base leading-[19px] text-ink-muted">{children}</p>
      </div>
    </div>
  );
}

// ── Горячие клавиши — FDB-10, артборды D26–D29 ───────────────────────────────

/**
 * Кейкап: `--color-control`, радиус 6, высота 24, минимальная ширина 24,
 * 12 / 16 · 500 с табличными цифрами — чтобы `⌥⌘4` и `⌥⌘1` были одной ширины.
 */
function Keycap({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-sm bg-control px-1.5 text-sm leading-4 font-medium tabular-nums text-ink">
      {children}
    </span>
  );
}

/** Мигающая палочка на месте недостающей клавиши — D27. */
function Caret() {
  return <span className="h-4 w-0.5 shrink-0 rounded-pill bg-brand" aria-hidden />;
}

interface RecorderProps {
  /** Сочетание в нотации плагина. */
  value: string;
  recording: boolean;
  /** Уже нажатые модификаторы во время записи. */
  pending: Modifier[];
  invalid: boolean;
  windows: boolean;
  onStart: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  onCancel: () => void;
}

/**
 * Поле-рекордер. Это кнопка, а не `<input>`: вводить сюда нечего, а фокус нужен —
 * `keydown` слушается на самом элементе, иначе запись перехватывала бы клавиши
 * у всей панели (в ней есть ещё два поля).
 */
function ShortcutRecorder({
  value,
  recording,
  pending,
  invalid,
  windows,
  onStart,
  onKeyDown,
  onCancel,
}: RecorderProps) {
  const caps = recording
    ? pending.map((modifier) => modifierLabel(modifier, windows))
    : shortcutKeycaps(value, windows);

  return (
    <button
      type="button"
      onClick={onStart}
      onKeyDown={onKeyDown}
      onBlur={() => {
        if (recording) onCancel();
      }}
      aria-label={recording ? 'Нажмите сочетание' : `Сочетание ${shortcutLabel(value, windows)}`}
      className={cn(
        'flex h-[34px] w-[220px] shrink-0 items-center justify-center gap-1 rounded-md bg-control px-2.5',
        'outline-none transition-shadow duration-[var(--dur-fast)] ease-out',
        recording && !invalid && 'shadow-[inset_0_0_0_1px_var(--color-brand)]',
        invalid && 'shadow-[inset_0_0_0_1px_var(--color-danger)]',
        !recording && !invalid && 'focus-visible:shadow-[inset_0_0_0_1px_var(--color-brand)]',
      )}
    >
      {recording && caps.length === 0 ? (
        <>
          <Caret />
          <span className="text-md leading-[18px] font-medium text-ink-muted">
            Нажмите сочетание…
          </span>
        </>
      ) : (
        <>
          {caps.map((cap, index) => (
            <Keycap key={`${cap}-${index}`}>{cap}</Keycap>
          ))}
          {recording ? <Caret /> : null}
        </>
      )}
    </button>
  );
}

/** Строка таблицы «О программе»: 40 в высоту, метка на 200, разделитель `line`. */
function InfoRow({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="flex h-10 items-center border-b border-line px-3.5 last:border-b-0">
      <span className="w-[200px] shrink-0 text-base leading-4 text-ink-muted">{label}</span>
      <span title={title ?? value} className="min-w-0 flex-1 truncate text-sm leading-4 text-ink">
        {value}
      </span>
    </div>
  );
}

// ── Панель ───────────────────────────────────────────────────────────────────

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

  /*
    FDB-10. Сочетание в черновике: `null` — тогл выключен. Последнее включённое
    значение помним отдельно — иначе выключить и включить обратно значило бы
    потерять свой хоткей и получить ⌥⌘C.
  */
  const [captureShortcut, setCaptureShortcut] = useState<string | null>(DEFAULT_CAPTURE_SHORTCUT);
  const lastShortcut = useRef(DEFAULT_CAPTURE_SHORTCUT);
  const [recording, setRecording] = useState(false);
  const [pendingModifiers, setPendingModifiers] = useState<Modifier[]>([]);
  /** Отказ на вводе: «занято системой», «нужен модификатор». Показывается danger. */
  const [shortcutError, setShortcutError] = useState<string | null>(null);
  /** Ответ оболочки после сохранения: «Сочетание сохранено» либо отказ. */
  const [shortcutNote, setShortcutNote] = useState<{ tone: 'success' | 'danger'; text: string } | null>(
    null,
  );
  /** Ждём отчёта оболочки о регистрации. Пока ждём — поле и тогл не трогаем. */
  const [awaitingStatus, setAwaitingStatus] = useState<string | null>(null);

  // Кнопка выбора папки есть только в приложении: в браузере JS абсолютный путь не отдаёт.
  const inTauri = isTauri();
  const platform = platformStrings();
  const windowsShell = isWindowsShell();
  const reduced = useReducedMotion();

  /*
    Черновик начинается заново, когда пришли новые данные с сервера и когда
    панель открыли: закрытие по Esc, скриму или крестику правки не сохраняет —
    ровно как кнопка «Отменить». Компонент при этом остаётся смонтированным,
    поэтому состояние приходится сбрасывать руками.
  */
  useEffect(() => {
    if (!settings || !open) return;
    setLibraryPath(settings.libraryPath);
    setServerPort(String(settings.serverPort));
    setCaptureShortcut(settings.captureShortcut);
    if (settings.captureShortcut !== null) lastShortcut.current = settings.captureShortcut;
    setRecording(false);
    setPendingModifiers([]);
    setShortcutError(null);
    setSubmitted(false);
    setFieldError(null);
    setFormError(null);
    setPickError(null);
  }, [settings, open]);

  /*
    FDB-10 — ответ приходит не от сервера, а от оболочки: она пытается повесить
    сочетание и кладёт итог в `POST /api/system/shortcut-status`, откуда его и
    забирает `GET /api/settings`. Поэтому после сохранения опрашиваем настройки,
    пока не увидим отчёт про наше сочетание.

    В браузере оболочки нет вовсе — там ждать нечего, и опроса не будет.
  */
  useEffect(() => {
    if (awaitingStatus === null) return;
    if (!inTauri) {
      setAwaitingStatus(null);
      return;
    }
    let stopped = false;
    const deadline = Date.now() + STATUS_TIMEOUT_MS;

    const tick = async () => {
      if (stopped) return;
      try {
        const fresh = await fetchSettings();
        const status = fresh.captureShortcutStatus;
        if (!stopped && status && status.shortcut === (awaitingStatus === OFF ? null : awaitingStatus)) {
          setAwaitingStatus(null);
          setShortcutNote(
            status.ok
              ? { tone: 'success', text: 'Сочетание сохранено' }
              : {
                  tone: 'danger',
                  text: `${shortcutLabel(status.shortcut ?? '', windowsShell)} занято другой программой`,
                },
          );
          return;
        }
      } catch {
        // Сервер моргнул — попробуем на следующем тике, молча.
      }
      if (stopped) return;
      // Оболочка могла и не ответить (Windows-сборка, старая версия) — не ждём вечно.
      if (Date.now() > deadline) setAwaitingStatus(null);
      else timer = window.setTimeout(() => void tick(), STATUS_POLL_MS);
    };

    let timer = window.setTimeout(() => void tick(), STATUS_POLL_MS);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [awaitingStatus, inTauri, windowsShell]);

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
        <ModalContent title="Настройки" size="panel" className={className}>
          <p className="pt-10 text-center text-technical">Загружаем настройки…</p>
        </ModalContent>
      </Modal>
    );
  }

  const dirty =
    libraryPath !== settings.libraryPath ||
    serverPort !== String(settings.serverPort) ||
    captureShortcut !== settings.captureShortcut;
  const invalid = Boolean(pathError || portError);
  // До первой попытки сохранения поля не краснеют — правим по ходу, не мешая.
  const showPathError =
    pickError ?? (submitted ? (fieldError?.field === 'libraryPath' ? fieldError.message : pathError) : null);
  const showPortError = submitted ? (fieldError?.field === 'serverPort' ? fieldError.message : portError) : null;

  const reset = () => {
    setLibraryPath(settings.libraryPath);
    setServerPort(String(settings.serverPort));
    setCaptureShortcut(settings.captureShortcut);
    setRecording(false);
    setPendingModifiers([]);
    setShortcutError(null);
    setShortcutNote(null);
    setSubmitted(false);
    setFieldError(null);
    setFormError(null);
    setPickError(null);
  };

  // ── FDB-10: запись сочетания ───────────────────────────────────────────────

  const startRecording = () => {
    setRecording(true);
    setPendingModifiers([]);
    setShortcutError(null);
    setShortcutNote(null);
  };

  const stopRecording = () => {
    setRecording(false);
    setPendingModifiers([]);
  };

  /**
   * Клавиши ловим на самом поле, а не на документе: в панели есть ещё два поля,
   * и запись не должна отбирать ввод у них. Всплытие гасим — иначе Esc закрыл бы
   * всю панель настроек вместо того, чтобы отменить запись (Radix слушает
   * `keydown` на документе).
   */
  const handleRecorderKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!recording) {
      // Пробел и Enter на кнопке — это «начать запись», штатное поведение.
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    if (event.key === 'Escape') {
      stopRecording();
      return;
    }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      setPendingModifiers([]);
      setShortcutError(null);
      return;
    }

    const result = recordFromEvent({
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      metaKey: event.metaKey,
      code: event.code,
      key: event.key,
    });

    if (result.kind === 'pending') {
      setPendingModifiers(result.modifiers);
      setShortcutError(null);
      return;
    }
    if (result.kind === 'no-modifier') {
      setShortcutError('Нужен хотя бы один модификатор: ⌃, ⌥, ⇧ или ⌘');
      return;
    }

    // Системные сочетания отбиваем сразу: их не отдаст ни одной программе macOS.
    const taken = systemConflict(result.spec);
    if (taken !== null) {
      setPendingModifiers([]);
      setShortcutError(`${shortcutLabel(result.spec, windowsShell)} занято системой (${taken})`);
      return;
    }

    setCaptureShortcut(result.spec);
    lastShortcut.current = result.spec;
    setShortcutError(null);
    stopRecording();
  };

  /** Тогл. Выключаем — запоминаем сочетание, включаем — возвращаем его же. */
  const toggleShortcut = (enabled: boolean) => {
    setShortcutError(null);
    setShortcutNote(null);
    stopRecording();
    setCaptureShortcut(enabled ? lastShortcut.current : null);
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
    const shortcutChanged = captureShortcut !== settings.captureShortcut;
    if (shortcutChanged) patch.captureShortcut = captureShortcut;
    if (Object.keys(patch).length === 0) return;

    setSaving(true);
    try {
      const result = await onSave(patch);
      setSavedAt(Date.now());
      if (result?.restartRequired) setRestartFrom(settings.serverPort);
      /*
        Сохранить сочетание — ещё не значит его занять: вешает его оболочка, и
        только она знает, свободно ли оно. До её ответа не пишем ничего — иначе
        «сохранено» появилось бы там, где через секунду встанет «занято».
      */
      if (shortcutChanged) {
        setShortcutNote(null);
        setAwaitingStatus(captureShortcut ?? OFF);
      }
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
        size="panel"
        className={className}
        /* Тело центрирует колонку 720 по горизонтали; вертикально — от верха. */
        bodyClassName="flex flex-col items-center"
        footer={
          <>
            <p
              className={cn(
                'min-w-0 flex-1 truncate text-base leading-4',
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
        <div className="flex w-full max-w-[720px] shrink-0 flex-col gap-8">
          {/* SET-01, SET-02 */}
          <Section title="Библиотека">
            <Field
              label="Путь библиотеки"
              htmlFor="settings-library-path"
              error={showPathError}
              hint={`По умолчанию ${platform.defaultLibraryPath}. Внутри — library.db, originals и previews.`}
            >
              <div className="flex items-center gap-2">
                <Input
                  id="settings-library-path"
                  value={libraryPath}
                  spellCheck={false}
                  autoComplete="off"
                  aria-invalid={Boolean(showPathError)}
                  onChange={(event) => setLibraryPath(event.target.value)}
                  className={cn(
                    'min-w-0 flex-1',
                    PATH_INPUT,
                    showPathError && 'shadow-[inset_0_0_0_1px_var(--color-danger)]',
                  )}
                />
                {/* В браузере кнопки нет: JS не отдаёт абсолютный путь, а поле — отдаёт. */}
                {inTauri ? (
                  <Button
                    variant="secondary"
                    disabled={picking || saving}
                    onClick={() => void chooseFolder()}
                    icon={<Icon icon={Folder} aria-hidden />}
                  >
                    Выбрать папку…
                  </Button>
                ) : null}
              </div>
            </Field>
          </Section>

          {/* PRD §7.2 — формулировка намеренно прямая, без смягчения. */}
          <Notice tone="warning" icon={TriangleAlert} title="Смена пути не переносит файлы.">
            Приложение просто начнёт работать с новой директорией — пустой или ранее
            существовавшей. Перенести библиотеку нужно вручную {platform.inFileManager} при
            закрытом приложении.
          </Notice>

          {/* FDB-10 — D26…D29 с правками Сергея от 11.09: тогл вместо чекбокса и
              в самом правом краю строки; поле и сброс появляются только когда
              включено. Зазор внутри группы 8, от группы до тогла 24. */}
          <Section title="Горячие клавиши">
            <div className="flex items-start gap-6">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="text-md leading-[18px] font-medium text-ink">Снимок области экрана</p>
                <p className="text-sm leading-[18px] text-ink-faint">
                  {captureShortcut === null
                    ? 'Снимок области доступен из строки меню и трея'
                    : 'Работает из любого приложения, пока Копирка запущена'}
                </p>
              </div>

              <AnimatePresence initial={false}>
                {captureShortcut !== null ? (
                  <motion.div
                    key="recorder"
                    className="flex shrink-0 flex-col items-start gap-2"
                    {...layerMotion({ y: -4, enter: 0.16, reduced })}
                  >
                    {/* Ряд 40 — та же высота, что у блока названия: контролы на одной оси. */}
                    <div className="flex h-10 items-center gap-2">
                      <ShortcutRecorder
                        value={captureShortcut}
                        recording={recording}
                        pending={pendingModifiers}
                        invalid={shortcutError !== null}
                        windows={windowsShell}
                        onStart={startRecording}
                        onKeyDown={handleRecorderKey}
                        onCancel={stopRecording}
                      />
                      <IconButton
                        variant="secondary"
                        label={`Сбросить на ${shortcutLabel(DEFAULT_CAPTURE_SHORTCUT, windowsShell)}`}
                        disabled={captureShortcut === DEFAULT_CAPTURE_SHORTCUT && !recording}
                        onClick={() => {
                          stopRecording();
                          setShortcutError(null);
                          setShortcutNote(null);
                          setCaptureShortcut(DEFAULT_CAPTURE_SHORTCUT);
                          lastShortcut.current = DEFAULT_CAPTURE_SHORTCUT;
                        }}
                      >
                        <Icon icon={RotateCcw} aria-hidden />
                      </IconButton>
                    </div>

                    {shortcutError !== null ? (
                      <div className="flex w-[220px] flex-col items-start gap-1.5">
                        <p role="alert" className="text-sm leading-4 text-danger">
                          {shortcutError}
                        </p>
                        <Button variant="secondary" onClick={startRecording}>
                          Попробовать другое
                        </Button>
                      </div>
                    ) : recording ? (
                      <p className="text-sm leading-4 text-ink-faint">
                        Esc — отмена, Backspace — очистить
                      </p>
                    ) : awaitingStatus !== null ? (
                      <p className="text-sm leading-4 text-ink-faint">Проверяем сочетание…</p>
                    ) : shortcutNote !== null ? (
                      <div className="flex w-[220px] flex-col items-start gap-1.5">
                        <p
                          className={cn(
                            'text-sm leading-4',
                            shortcutNote.tone === 'success' ? 'text-success' : 'text-danger',
                          )}
                        >
                          {shortcutNote.text}
                        </p>
                        {shortcutNote.tone === 'danger' ? (
                          <Button variant="secondary" onClick={startRecording}>
                            Попробовать другое
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </motion.div>
                ) : null}
              </AnimatePresence>

              {/* Тогл — в самом правом краю строки, на оси с полем (ряд 40). */}
              <div className="flex h-10 shrink-0 items-center">
                <Switch
                  label="Снимок области экрана по горячей клавише"
                  checked={captureShortcut !== null}
                  onCheckedChange={toggleShortcut}
                />
              </div>
            </div>
          </Section>

          {/* SET-03, спрятан в «Дополнительно» — D16. */}
          <Disclosure
            title="Дополнительно"
            open={advancedOpen}
            onToggle={() => setAdvancedOpen((value) => !value)}
          >
            <div className="flex flex-col gap-3">
              <p className="text-base leading-[19px] text-ink-muted">
                Адрес, по которому приложение слушает расширение Chrome. Менять нужно, только если
                порт <span className="text-ink tabular-nums">{DEFAULT_PORT}</span> занят другой
                программой. После смены поменяйте адрес в расширении и перезапустите приложение.
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
                  className={cn(
                    'w-[140px] tabular-nums',
                    showPortError && 'shadow-[inset_0_0_0_1px_var(--color-danger)]',
                  )}
                />
              </Field>

              {restartFrom !== null ? (
                <Notice tone="brand" icon={RefreshCw} title="Порт изменится после перезапуска.">
                  Пока приложение не перезапущено, сервер продолжает слушать{' '}
                  <span className="text-ink tabular-nums">{restartFrom}</span>. Не забудьте поменять
                  адрес в настройках расширения.
                </Notice>
              ) : null}
            </div>
          </Disclosure>

          {/* SET-05 в редакции 02.09.2026 (решение Сергея D1): «не разобрано» = нет папки. */}
          <Section title="Не разобрано">
            <div className="flex flex-col gap-1.5">
              <p className="text-md leading-[18px] font-medium text-ink">
                Сюда попадают файлы без папки.
              </p>
              <p className="text-base leading-[19px] text-ink-muted">
                Положил в папку — файл ушёл из раздела. Теги на это не влияют.
              </p>
              <p className="text-base leading-[19px] text-ink-faint">
                Файлы из корзины в разделе не показываются. Правило в этой версии не настраивается.
              </p>
            </div>
          </Section>

          <Section title="О программе">
            <div className="overflow-hidden rounded-card bg-control">
              <InfoRow label="Версия приложения" value={settings.appVersion} />
              <InfoRow label="Версия схемы БД" value={String(settings.schemaVersion)} />
              <InfoRow label="Размер библиотеки" value={formatBytes(settings.librarySizeBytes)} />
              <InfoRow
                label="Файл лога"
                value={truncateMiddle(settings.logPath)}
                title={settings.logPath}
              />
            </div>
          </Section>
        </div>
      </ModalContent>
    </Modal>
  );
}
