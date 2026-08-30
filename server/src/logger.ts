/** SVC-04 — ошибки пишутся в файл, путь отдаётся в GET /api/settings. */
import fs from 'node:fs';
import path from 'node:path';
import { appPaths } from './config.js';

const MAX_LOG_BYTES = 2 * 1024 * 1024;

function write(level: 'info' | 'warn' | 'error', message: string, detail?: unknown): void {
  const { supportDir, logPath } = appPaths();
  const line = `${new Date().toISOString()} [${level}] ${message}${detail === undefined ? '' : ` :: ${format(detail)}`}\n`;
  try {
    fs.mkdirSync(supportDir, { recursive: true });
    // Простая ротация: лог не должен расти бесконечно.
    if (fs.existsSync(logPath) && fs.statSync(logPath).size > MAX_LOG_BYTES) {
      fs.renameSync(logPath, path.join(supportDir, 'kopirka.log.1'));
    }
    fs.appendFileSync(logPath, line, 'utf8');
  } catch {
    // Логирование не имеет права ронять приложение.
  }
  if (level === 'error') process.stderr.write(line);
  else if (!process.env.KOPIRKA_QUIET) process.stdout.write(line);
}

function format(detail: unknown): string {
  if (detail instanceof Error) return `${detail.name}: ${detail.message}${detail.stack ? `\n${detail.stack}` : ''}`;
  if (typeof detail === 'string') return detail;
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

export const log = {
  info: (message: string, detail?: unknown) => write('info', message, detail),
  warn: (message: string, detail?: unknown) => write('warn', message, detail),
  error: (message: string, detail?: unknown) => write('error', message, detail),
  path: () => appPaths().logPath,
};
