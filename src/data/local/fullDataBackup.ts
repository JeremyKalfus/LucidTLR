import type { NativePhoneRuntimeEvent } from "@/src/native/phoneRuntime";

import type { LocalDb } from "./localDb";
import { LOCAL_TABLES, type LocalTableName } from "./schema";
import {
  clearAllLocalData,
  getAppSetting,
  setAppSetting,
} from "./repositories";

export const FULL_LOCAL_DATA_EXPORT_SCHEMA = "lucidtlr-full-local-data-v1";
export const LEGACY_FULL_LOCAL_DATA_EXPORT_SCHEMA =
  "lucidcue-full-local-data-v1";
export const NATIVE_PHONE_RUNTIME_LOG_ARCHIVE_SETTING =
  "native_phone_runtime_log_archive_v1";

type LocalDataRow = Record<string, string | number | null>;

export type FullLocalDataExport = {
  exportSchema:
    | typeof FULL_LOCAL_DATA_EXPORT_SCHEMA
    | typeof LEGACY_FULL_LOCAL_DATA_EXPORT_SCHEMA;
  exportedAt: string;
  tables: Record<LocalTableName, LocalDataRow[]>;
  nativePhoneRuntimeLogs: Record<string, NativePhoneRuntimeEvent[]>;
};

function emptyTableExport(): Record<LocalTableName, LocalDataRow[]> {
  return LOCAL_TABLES.reduce(
    (tables, table) => ({
      ...tables,
      [table]: [],
    }),
    {} as Record<LocalTableName, LocalDataRow[]>,
  );
}

function quoteIdentifier(value: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`Invalid local data identifier: ${value}`);
  }

  return `"${value}"`;
}

function assertFullLocalDataExport(value: unknown): FullLocalDataExport {
  const exportSchema = (value as { exportSchema?: unknown } | null)?.exportSchema;
  const validSchema =
    exportSchema === FULL_LOCAL_DATA_EXPORT_SCHEMA ||
    exportSchema === LEGACY_FULL_LOCAL_DATA_EXPORT_SCHEMA;

  if (
    !value ||
    typeof value !== "object" ||
    !validSchema ||
    typeof (value as { exportedAt?: unknown }).exportedAt !== "string" ||
    !((value as { tables?: unknown }).tables) ||
    typeof (value as { tables?: unknown }).tables !== "object"
  ) {
    throw new Error("Selected file is not a LucidTLR full data export.");
  }

  const parsed = value as FullLocalDataExport;

  for (const table of LOCAL_TABLES) {
    if (!Array.isArray(parsed.tables[table])) {
      throw new Error(`LucidTLR export is missing table ${table}.`);
    }
  }

  return {
    ...parsed,
    nativePhoneRuntimeLogs: parsed.nativePhoneRuntimeLogs ?? {},
  };
}

export async function loadArchivedPhoneRuntimeLogs(
  db: LocalDb,
): Promise<Record<string, NativePhoneRuntimeEvent[]>> {
  return (
    (await getAppSetting<Record<string, NativePhoneRuntimeEvent[]>>(
      db,
      NATIVE_PHONE_RUNTIME_LOG_ARCHIVE_SETTING,
    )) ?? {}
  );
}

export async function saveArchivedPhoneRuntimeLogs(input: {
  db: LocalDb;
  logs: Record<string, NativePhoneRuntimeEvent[]>;
  updatedAt: string;
}): Promise<void> {
  await setAppSetting(
    input.db,
    NATIVE_PHONE_RUNTIME_LOG_ARCHIVE_SETTING,
    input.logs,
    input.updatedAt,
  );
}

export async function exportFullLocalData(input: {
  db: LocalDb;
  nativePhoneRuntimeLogs?: Record<string, NativePhoneRuntimeEvent[]>;
  exportedAt?: string;
}): Promise<FullLocalDataExport> {
  const tables = emptyTableExport();

  for (const table of LOCAL_TABLES) {
    tables[table] = await input.db.query<LocalDataRow>(
      `select * from ${quoteIdentifier(table)}`,
    );
  }

  return {
    exportSchema: FULL_LOCAL_DATA_EXPORT_SCHEMA,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    tables,
    nativePhoneRuntimeLogs: input.nativePhoneRuntimeLogs ?? {},
  };
}

export function parseFullLocalDataExport(json: string): FullLocalDataExport {
  return assertFullLocalDataExport(JSON.parse(json));
}

export async function replaceFullLocalData(input: {
  db: LocalDb;
  snapshot: FullLocalDataExport;
}): Promise<void> {
  await clearAllLocalData(input.db);

  for (const table of LOCAL_TABLES) {
    for (const row of input.snapshot.tables[table]) {
      const columns = Object.keys(row);

      if (columns.length === 0) {
        continue;
      }

      const placeholders = columns.map(() => "?").join(", ");

      await input.db.execute(
        `insert into ${quoteIdentifier(table)} (${columns
          .map(quoteIdentifier)
          .join(", ")}) values (${placeholders})`,
        columns.map((column) => row[column]),
      );
    }
  }

  await saveArchivedPhoneRuntimeLogs({
    db: input.db,
    logs: input.snapshot.nativePhoneRuntimeLogs,
    updatedAt: input.snapshot.exportedAt,
  });
}
