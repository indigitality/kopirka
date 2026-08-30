/**
 * Схема БД (PRD §7.5) и система миграций (SVC-01).
 * Миграции применяются по порядку, достигнутая версия лежит в settings.schema_version.
 */
import Database from 'better-sqlite3';
import { SCHEMA_VERSION } from '../../shared/api.js';
import { log } from './logger.js';

export type Db = Database.Database;

interface Migration {
  version: number;
  name: string;
  up: (db: Db) => void;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial',
    up: (db) => {
      db.exec(`
        CREATE TABLE settings (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE folders (
          id               INTEGER PRIMARY KEY AUTOINCREMENT,
          name             TEXT NOT NULL,
          parent_folder_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
          sort_order       INTEGER NOT NULL DEFAULT 0,
          created_at       TEXT NOT NULL
        );
        CREATE INDEX idx_folders_parent ON folders(parent_folder_id, sort_order, name);

        CREATE TABLE tags (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          name       TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL
        );

        CREATE TABLE files (
          id                 INTEGER PRIMARY KEY AUTOINCREMENT,
          sha256             TEXT NOT NULL UNIQUE,
          phash              TEXT,
          similar_to_file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
          original_filename  TEXT NOT NULL,
          storage_relpath    TEXT NOT NULL UNIQUE,
          preview_relpath    TEXT,
          ext                TEXT NOT NULL,
          size_bytes         INTEGER NOT NULL,
          width              INTEGER,
          height             INTEGER,
          folder_id          INTEGER REFERENCES folders(id) ON DELETE SET NULL,
          source_type        TEXT NOT NULL,
          source_url         TEXT,
          is_broken          INTEGER NOT NULL DEFAULT 0,
          added_at           TEXT NOT NULL,
          deleted_at         TEXT
        );

        -- Индексы под запросы списка: срез (библиотека/корзина), папка, сортировки, фильтры.
        CREATE INDEX idx_files_active_added   ON files(deleted_at, added_at DESC, id DESC);
        CREATE INDEX idx_files_active_name    ON files(deleted_at, original_filename COLLATE NOCASE, id);
        CREATE INDEX idx_files_folder         ON files(folder_id, deleted_at);
        CREATE INDEX idx_files_ext            ON files(ext, deleted_at);
        CREATE INDEX idx_files_deleted_at     ON files(deleted_at);
        CREATE INDEX idx_files_added_at       ON files(added_at);
        CREATE INDEX idx_files_similar        ON files(similar_to_file_id);
        CREATE INDEX idx_files_phash          ON files(phash);

        CREATE TABLE file_tags (
          file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
          tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
          PRIMARY KEY (file_id, tag_id)
        );
        CREATE INDEX idx_file_tags_tag ON file_tags(tag_id, file_id);
      `);
    },
  },
];

function readVersion(db: Db): number {
  const hasSettings = db
    .prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'settings'`)
    .get() as { ok: number } | undefined;
  if (!hasSettings) return 0;
  const row = db.prepare(`SELECT value FROM settings WHERE key = 'schema_version'`).get() as
    | { value: string }
    | undefined;
  return row ? Number(row.value) : 0;
}

function writeVersion(db: Db, version: number): void {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('schema_version', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(String(version));
}

export function migrate(db: Db): number {
  let current = readVersion(db);
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    db.transaction(() => {
      migration.up(db);
      writeVersion(db, migration.version);
    })();
    current = migration.version;
    log.info(`migration applied: ${migration.version} ${migration.name}`);
  }
  if (current > SCHEMA_VERSION) {
    throw new Error(
      `Библиотека собрана более новой версией Копирки (схема ${current}, поддерживается ${SCHEMA_VERSION}).`,
    );
  }
  return current;
}

export function openDatabase(dbPath: string): Db {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  // SQLite lower() не знает кириллицу — своя функция нужна для поиска по имени без учёта регистра.
  db.function('kp_lower', { deterministic: true }, (value: unknown) =>
    typeof value === 'string' ? value.toLowerCase() : (value as string | null),
  );
  migrate(db);
  return db;
}

export function schemaVersion(db: Db): number {
  return readVersion(db);
}
