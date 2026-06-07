import type { LocalTableName } from "./schema";

export interface LocalDb {
  execute(sql: string, params?: unknown[]): Promise<void>;
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  queryOne<T>(sql: string, params?: unknown[]): Promise<T | null>;
  withTransaction?<T>(work: (tx: LocalDb) => Promise<T>): Promise<T>;
}

export interface LocalRecord {
  id: string;
}

export async function insertLocalRecord<T extends LocalRecord>(
  db: LocalDb,
  table: LocalTableName,
  record: T,
): Promise<void> {
  const columns = Object.keys(record);
  const placeholders = columns.map(() => "?").join(", ");
  const values = columns.map((column) => record[column as keyof T]);

  await db.execute(
    `insert into ${table} (${columns.join(", ")}) values (${placeholders})`,
    values,
  );
}

export async function getLocalRecordById<T extends LocalRecord>(
  db: LocalDb,
  table: LocalTableName,
  id: string,
): Promise<T | null> {
  return db.queryOne<T>(`select * from ${table} where id = ? limit 1`, [id]);
}
