/**
 * App-конфиг лежит ВНЕ библиотеки (PRD §7.3): путь и порт нужны раньше, чем откроется library.db.
 * macOS:   ~/Library/Application Support/Kopirka/config.json
 * Windows: %APPDATA%\Kopirka\config.json (Roaming) — ровно эту папку читает Rust-оболочка,
 *          поэтому менять её нельзя без согласования с desktop/.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_CAPTURE_SHORTCUT, DEFAULT_PORT, type AppConfig } from '../../shared/api.js';

export interface AppPaths {
  supportDir: string;
  configPath: string;
  logPath: string;
}

/** Реализация path под нужную платформу — нужна, чтобы проверять windows-раскладку на macOS. */
function pathFor(platform: NodeJS.Platform): path.PlatformPath {
  return platform === 'win32' ? path.win32 : path.posix;
}

/**
 * Папка конфига и лога. Чистая функция: платформа, окружение и домашняя папка приходят
 * параметрами — так windows-раскладка проверяется прогоном на macOS (см. smoke.ts),
 * без подмены process.platform в рабочем коде.
 *
 * KOPIRKA_CONFIG_DIR нужен для тестов и запуска нескольких изолированных инстансов.
 */
export function supportDirFor(
  platform: NodeJS.Platform,
  env: Record<string, string | undefined>,
  home: string,
  p: path.PlatformPath = pathFor(platform),
): string {
  const override = env['KOPIRKA_CONFIG_DIR'];
  if (override !== undefined && override !== '') return override;
  if (platform === 'win32') {
    // %APPDATA% — это Roaming; в живом сеансе она задана всегда. Если нет (служба,
    // урезанное окружение) — собираем тот же путь от профиля, лишь бы не упасть на старте.
    const appData = env['APPDATA'];
    const base = appData !== undefined && appData !== '' ? appData : p.join(home, 'AppData', 'Roaming');
    return p.join(base, 'Kopirka');
  }
  return p.join(home, 'Library', 'Application Support', 'Kopirka');
}

export function appPaths(): AppPaths {
  const supportDir = supportDirFor(process.platform, process.env, os.homedir());
  return {
    supportDir,
    configPath: path.join(supportDir, 'config.json'),
    logPath: path.join(supportDir, 'kopirka.log'),
  };
}

/**
 * Библиотека по умолчанию: macOS — ~/Pictures/Копирка, Windows — %USERPROFILE%\Pictures\Копирка.
 * Ветка по платформе не нужна: os.homedir() на Windows и есть %USERPROFILE%, а path.join
 * ставит нужный разделитель. Функция вынесена отдельно ради проверки обеих раскладок.
 */
export function defaultLibraryPathFor(home: string, p: path.PlatformPath = path): string {
  return p.join(home, 'Pictures', 'Копирка');
}

export function defaultLibraryPath(): string {
  return defaultLibraryPathFor(os.homedir());
}

/**
 * FDB-10 — сочетание в нотации tauri-plugin-global-shortcut: 1–3 модификатора из
 * Alt / Control / Shift / Super и ровно одна обычная клавиша, всё через `+`.
 * Регистр модификаторов приводим к каноническому, саму клавишу оставляем как есть —
 * плагин разбирает её кодом (`KeyC`, `F5`, `Digit4`), а не буквой.
 *
 * Проверка одна на сервер и на его схемы (`schemas.ts`) — расходиться им нельзя:
 * конфиг пишет одна сторона, а регистрирует другая.
 */
export function normalizeShortcut(raw: string): string | null {
  const parts = raw
    .split('+')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  if (parts.length < 2 || parts.length > 4) return null;

  const canonical: Record<string, string> = {
    alt: 'Alt',
    option: 'Alt',
    control: 'Control',
    ctrl: 'Control',
    shift: 'Shift',
    super: 'Super',
    meta: 'Super',
    command: 'Super',
    cmd: 'Super',
  };

  const modifiers: string[] = [];
  for (const part of parts.slice(0, -1)) {
    const name = canonical[part.toLowerCase()];
    // Модификатор либо известен, либо это не модификатор — второй клавиши не бывает.
    if (name === undefined || modifiers.includes(name)) return null;
    modifiers.push(name);
  }

  const key = parts[parts.length - 1] as string;
  // Клавиша не может быть модификатором и не может быть пустой или с пробелами.
  if (canonical[key.toLowerCase()] !== undefined) return null;
  if (!/^[A-Za-z0-9]+$/.test(key)) return null;

  // Порядок канонический: с ним сравнение «изменилось ли сочетание» честное.
  const order = ['Control', 'Alt', 'Shift', 'Super'];
  modifiers.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return [...modifiers, key].join('+');
}

function sanitize(raw: unknown): AppConfig {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const libraryPath = typeof obj['libraryPath'] === 'string' && obj['libraryPath'].trim() !== ''
    ? String(obj['libraryPath'])
    : defaultLibraryPath();
  const portRaw = obj['serverPort'];
  const serverPort = typeof portRaw === 'number' && Number.isInteger(portRaw) && portRaw >= 0 && portRaw <= 65535
    ? portRaw
    : DEFAULT_PORT;
  /*
    Поля в конфиге может не быть вовсе (config.json от прежней версии) — тогда
    берём умолчание ⌥⌘C. Явный `null` — это «выключено», и его надо сохранить:
    иначе выключенный хоткей возвращался бы сам при каждом чтении конфига.
  */
  const shortcutRaw = obj['captureShortcut'];
  let captureShortcut: string | null = DEFAULT_CAPTURE_SHORTCUT;
  if (shortcutRaw === null) captureShortcut = null;
  // Битую строку не превращаем в «выключено» — это молча отняло бы хоткей;
  // ведём себя как с портом и путём: откатываемся на умолчание.
  else if (typeof shortcutRaw === 'string') {
    captureShortcut = normalizeShortcut(shortcutRaw) ?? DEFAULT_CAPTURE_SHORTCUT;
  }

  return {
    libraryPath: expandHome(libraryPath),
    serverPort,
    firstRunCompleted: obj['firstRunCompleted'] === true,
    captureShortcut,
  };
}

/**
 * `~` в начале пути → домашняя папка. На Windows человек напишет и `~\Pictures\…`
 * (обратный слэш), и `~/Pictures/…` — понимаем оба, иначе путь из конфига был бы
 * принят как относительный и библиотека уехала бы в рабочую папку процесса.
 */
export function expandHomeWith(
  raw: string,
  home: string,
  platform: NodeJS.Platform,
  p: path.PlatformPath = pathFor(platform),
): string {
  if (raw === '~') return home;
  const separated = raw.startsWith('~/') || (platform === 'win32' && raw.startsWith('~\\'));
  if (separated) return p.join(home, raw.slice(2));
  return p.resolve(raw);
}

export function expandHome(p: string): string {
  return expandHomeWith(p, os.homedir(), process.platform, path);
}

export function loadConfig(): AppConfig {
  const { supportDir, configPath } = appPaths();
  fs.mkdirSync(supportDir, { recursive: true });
  let parsed: unknown = {};
  if (fs.existsSync(configPath)) {
    try {
      parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch {
      // Битый конфиг не должен мешать запуску: откатываемся на значения по умолчанию.
      parsed = {};
    }
  }
  const config = sanitize(parsed);
  const envPort = process.env.KOPIRKA_PORT ? Number(process.env.KOPIRKA_PORT) : NaN;
  if (Number.isInteger(envPort) && envPort >= 0 && envPort <= 65535) config.serverPort = envPort;
  if (process.env.KOPIRKA_LIBRARY_PATH) config.libraryPath = expandHome(process.env.KOPIRKA_LIBRARY_PATH);
  if (!fs.existsSync(configPath)) saveConfig(config);
  return config;
}

const RENAME_ATTEMPTS = 6;
const RENAME_PAUSE_MS = 40;

/** Пауза без async: saveConfig синхронный и зовётся из синхронных путей. */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Конфиг пишем через временный файл и rename: полупустым его застать нельзя.
 * На Windows этот rename может отбиться EPERM/EBUSY/EACCES — файл в тот момент держит
 * антивирус или индексатор. Тогда пробуем ещё несколько раз, а в самом конце пишем
 * поверх напрямую: потерять настройки хуже, чем на миг лишиться атомарности.
 * На macOS путь ровно прежний — один renameSync без повторов.
 */
function replaceFile(tmp: string, target: string): void {
  if (process.platform !== 'win32') {
    fs.renameSync(tmp, target);
    return;
  }
  for (let attempt = 1; attempt <= RENAME_ATTEMPTS; attempt += 1) {
    try {
      fs.renameSync(tmp, target);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const transient = code === 'EPERM' || code === 'EBUSY' || code === 'EACCES';
      if (!transient || attempt === RENAME_ATTEMPTS) {
        if (!transient) throw error;
        break;
      }
      sleepSync(RENAME_PAUSE_MS);
    }
  }
  fs.copyFileSync(tmp, target);
  fs.rmSync(tmp, { force: true });
}

export function saveConfig(config: AppConfig): void {
  const { supportDir, configPath } = appPaths();
  fs.mkdirSync(supportDir, { recursive: true });
  const tmp = `${configPath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  replaceFile(tmp, configPath);
}
