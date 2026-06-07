import * as SQLite from "expo-sqlite";
import type { SQLiteBindParams, SQLiteDatabase } from "expo-sqlite";

import type { LocalDb } from "./localDb";
import {
  LEGACY_LOCAL_DATABASE_MIGRATION_SETTING,
  migrateLegacyLocalDatabaseIfNeeded,
  type LegacyLocalDatabaseMigrationResult,
} from "./legacyLocalDataMigration";
import { LOCAL_DATABASE_NAME } from "./schema";
import { LOCAL_RUNTIME_MIGRATIONS } from "./runtimeMigrations";

class ExpoSQLiteLocalDb implements LocalDb {
  constructor(private readonly db: SQLiteDatabase) {}

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    if (params.length === 0) {
      await this.db.execAsync(sql);
      return;
    }

    await this.db.runAsync(sql, params as SQLiteBindParams);
  }

  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.db.getAllAsync<T>(sql, params as SQLiteBindParams);
  }

  async queryOne<T>(sql: string, params: unknown[] = []): Promise<T | null> {
    return this.db.getFirstAsync<T>(sql, params as SQLiteBindParams);
  }

  async withTransaction<T>(
    work: (tx: LocalDb) => Promise<T>,
  ): Promise<T> {
    let result: T | undefined;

    await this.db.withExclusiveTransactionAsync(async (tx) => {
      result = await work(new ExpoSQLiteLocalDb(tx));
    });

    return result as T;
  }
}

let localDbPromise: Promise<ExpoSQLiteLocalDb> | null = null;

async function runMigrations(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
create table if not exists local_migrations (
  id text primary key,
  applied_at text not null
);
`);

  for (const migration of LOCAL_RUNTIME_MIGRATIONS) {
    const applied = await db.getFirstAsync<{ id: string }>(
      "select id from local_migrations where id = ? limit 1",
      [migration.id],
    );

    if (applied) {
      continue;
    }

    await db.execAsync(migration.sql);
    await db.runAsync(
      "insert into local_migrations (id, applied_at) values (?, ?)",
      [migration.id, new Date().toISOString()],
    );
  }
}

async function recordLegacyLocalDatabaseMigration(
  db: SQLiteDatabase,
  migration: LegacyLocalDatabaseMigrationResult,
): Promise<void> {
  if (
    migration.action === "not_needed"
  ) {
    return;
  }

  const migratedAt = migration.migratedAt ?? new Date().toISOString();

  await db.runAsync(
    `insert into app_settings (key, value_json, updated_at)
values (?, ?, ?)
on conflict(key) do update set
  value_json = excluded.value_json,
  updated_at = excluded.updated_at`,
    [
      LEGACY_LOCAL_DATABASE_MIGRATION_SETTING,
      JSON.stringify({
        migratedAt,
        action: migration.action,
        backupUri: migration.backupUri ?? null,
      }),
      migratedAt,
    ],
  );
}

export async function getLocalDb(): Promise<LocalDb> {
  if (!localDbPromise) {
    localDbPromise = migrateLegacyLocalDatabaseIfNeeded().then(
      async (migration) =>
        SQLite.openDatabaseAsync(LOCAL_DATABASE_NAME).then(async (db) => {
          await runMigrations(db);
          await recordLegacyLocalDatabaseMigration(db, migration);
          return new ExpoSQLiteLocalDb(db);
        }),
    );
  }

  return localDbPromise;
}
