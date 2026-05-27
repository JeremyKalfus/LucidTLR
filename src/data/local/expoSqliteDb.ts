import * as SQLite from "expo-sqlite";
import type { SQLiteBindParams, SQLiteDatabase } from "expo-sqlite";

import type { LocalDb } from "./localDb";
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

export async function getLocalDb(): Promise<LocalDb> {
  if (!localDbPromise) {
    localDbPromise = SQLite.openDatabaseAsync(LOCAL_DATABASE_NAME).then(
      async (db) => {
        await runMigrations(db);
        return new ExpoSQLiteLocalDb(db);
      },
    );
  }

  return localDbPromise;
}
