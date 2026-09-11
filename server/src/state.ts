/**
 * Состояние приложения: конфиг + открытая библиотека.
 * Смена libraryPath (SET-02) не переносит файлы — просто переоткрывает БД по новому пути.
 */
import type { AppConfig, ShortcutStatus } from '../../shared/api.js';
import { saveConfig } from './config.js';
import { openDatabase, schemaVersion, type Db } from './db.js';
import { EventLog } from './events.js';
import { dbPath, ensureLibraryLayout } from './paths.js';
import { PendingStore } from './pending.js';

export class AppState {
  config: AppConfig;
  libraryPath: string;
  db: Db;
  readonly pending = new PendingStore();
  /** Лента успешных импортов для оболочки и окна. Смену библиотеки переживает: это
      журнал сессии приложения, а не содержимое конкретной библиотеки. */
  readonly events = new EventLog();
  /** Порт, на котором сервер реально слушает: он важнее конфига при проверке origin. */
  boundPort: number | null = null;
  /**
   * FDB-10 — последний отчёт оболочки о регистрации глобального хоткея. Живёт в
   * памяти, как лента событий: это «что случилось при последней попытке», а не
   * настройка. После перезапуска сервера оболочка отчитается заново — её поллер
   * ходит сюда каждые две секунды.
   */
  captureShortcutStatus: ShortcutStatus | null = null;

  constructor(config: AppConfig) {
    this.config = config;
    this.libraryPath = config.libraryPath;
    ensureLibraryLayout(this.libraryPath);
    this.db = openDatabase(dbPath(this.libraryPath));
  }

  get schemaVersion(): number {
    return schemaVersion(this.db);
  }

  useLibrary(newPath: string): void {
    if (newPath === this.libraryPath) return;
    this.db.close();
    ensureLibraryLayout(newPath);
    this.libraryPath = newPath;
    this.config = { ...this.config, libraryPath: newPath };
    this.db = openDatabase(dbPath(newPath));
    saveConfig(this.config);
  }

  patchConfig(patch: Partial<AppConfig>): void {
    if (patch.libraryPath !== undefined && patch.libraryPath !== this.libraryPath) {
      this.useLibrary(patch.libraryPath);
    }
    const next: AppConfig = { ...this.config, ...patch, libraryPath: this.libraryPath };
    this.config = next;
    saveConfig(next);
  }

  close(): void {
    this.pending.dispose();
    try {
      this.db.close();
    } catch {
      // Закрытие при завершении процесса не должно шуметь.
    }
  }
}
