/**
 * Временное хранилище файлов, отложенных как 'needs_confirmation' (IMP-01, синхронный путь).
 * Байты лежат во временной папке ОС, метаданные — в памяти, TTL 10 минут.
 * В библиотеку файл попадает только после POST /api/import/confirm.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FileExt, SourceType } from '../../shared/api.js';

export const PENDING_TTL_MS = 10 * 60 * 1000;

export interface PendingMeta {
  filename: string;
  ext: FileExt;
  sha256: string;
  phash: string | null;
  sourceType: SourceType;
  sourceUrl: string | null;
  similarToFileId: number | null;
  /** Папка из исходного запроса импорта: после подтверждения файл ложится именно в неё. */
  folderId: number | null;
}

interface PendingEntry extends PendingMeta {
  token: string;
  tmpPath: string;
  expiresAt: number;
}

export class PendingStore {
  private readonly entries = new Map<string, PendingEntry>();
  private readonly dir: string;
  private readonly timer: NodeJS.Timeout;

  constructor() {
    this.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kopirka-pending-'));
    this.timer = setInterval(() => this.sweep(), 60_000);
    this.timer.unref();
  }

  put(buffer: Buffer, meta: PendingMeta): string {
    this.sweep();
    const token = crypto.randomBytes(24).toString('hex');
    const tmpPath = path.join(this.dir, `${token}.${meta.ext}`);
    fs.writeFileSync(tmpPath, buffer);
    this.entries.set(token, { ...meta, token, tmpPath, expiresAt: Date.now() + PENDING_TTL_MS });
    return token;
  }

  take(token: string): { meta: PendingMeta; buffer: Buffer } | null {
    this.sweep();
    const entry = this.entries.get(token);
    if (!entry) return null;
    this.entries.delete(token);
    let buffer: Buffer;
    try {
      buffer = fs.readFileSync(entry.tmpPath);
    } catch {
      return null;
    }
    fs.rmSync(entry.tmpPath, { force: true });
    const { token: _t, tmpPath: _p, expiresAt: _e, ...meta } = entry;
    return { meta, buffer };
  }

  sweep(): void {
    const now = Date.now();
    for (const [token, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(token);
        fs.rmSync(entry.tmpPath, { force: true });
      }
    }
  }

  dispose(): void {
    clearInterval(this.timer);
    this.entries.clear();
    fs.rmSync(this.dir, { recursive: true, force: true });
  }
}
