/**
 * App-конфиг лежит ВНЕ библиотеки (PRD §7.3): путь и порт нужны раньше, чем откроется library.db.
 * macOS: ~/Library/Application Support/Kopirka/config.json
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_PORT, type AppConfig } from '../../shared/api.js';

export interface AppPaths {
  supportDir: string;
  configPath: string;
  logPath: string;
}

export function appPaths(): AppPaths {
  // KOPIRKA_CONFIG_DIR нужен для тестов и запуска нескольких изолированных инстансов.
  const supportDir =
    process.env.KOPIRKA_CONFIG_DIR ?? path.join(os.homedir(), 'Library', 'Application Support', 'Kopirka');
  return {
    supportDir,
    configPath: path.join(supportDir, 'config.json'),
    logPath: path.join(supportDir, 'kopirka.log'),
  };
}

export function defaultLibraryPath(): string {
  return path.join(os.homedir(), 'Pictures', 'Копирка');
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
  return {
    libraryPath: expandHome(libraryPath),
    serverPort,
    firstRunCompleted: obj['firstRunCompleted'] === true,
  };
}

export function expandHome(p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return path.resolve(p);
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

export function saveConfig(config: AppConfig): void {
  const { supportDir, configPath } = appPaths();
  fs.mkdirSync(supportDir, { recursive: true });
  const tmp = `${configPath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, configPath);
}
