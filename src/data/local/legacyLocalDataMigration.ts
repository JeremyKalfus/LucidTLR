import { LOCAL_DATABASE_NAME, LOCAL_TABLES } from "./schema";

type SQLiteModule = typeof import("expo-sqlite");

export const LEGACY_LOCAL_DATABASE_NAME = "lucidcue.db";
export const LEGACY_LOCAL_DATABASE_MIGRATION_SETTING =
  "legacy_lucidcue_db_migrated_at";
export const LEGACY_FULL_LOCAL_DATA_EXPORT_SCHEMA =
  "lucidcue-full-local-data-v1";

type DatabasePresence = {
  activeExists: boolean;
  legacyExists: boolean;
  activeHasUserData: boolean;
  legacyHasUserData: boolean;
};

export type LegacyLocalDatabaseMigrationAction =
  | "not_needed"
  | "copy_legacy_to_active"
  | "backup_empty_active_and_copy_legacy"
  | "use_active_legacy_collision";

export type LegacyLocalDatabaseMigrationResult = {
  action: LegacyLocalDatabaseMigrationAction;
  migratedAt?: string;
  backupUri?: string;
};

type FileInfo = {
  exists: boolean;
};

type LegacyLocalDatabaseMigrationDependencies = {
  databaseDirectory: string | null;
  getInfoAsync(uri: string): Promise<FileInfo>;
  copyAsync(options: { from: string; to: string }): Promise<void>;
  deleteAsync(uri: string, options?: { idempotent?: boolean }): Promise<void>;
  databaseHasUserData(databaseName: string): Promise<boolean>;
  now(): string;
};

function quoteIdentifier(value: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`Invalid local data identifier: ${value}`);
  }

  return `"${value}"`;
}

function toFileUri(path: string): string {
  return path.startsWith("file://") ? path : `file://${path}`;
}

function databaseUri(directory: string, databaseName: string): string {
  return toFileUri(`${directory.replace(/\/*$/, "")}/${databaseName}`);
}

function migrationTimestampSuffix(value: string): string {
  return value.replace(/[^0-9A-Za-z]+/g, "-").replace(/^-|-$/g, "");
}

export function resolveLegacyLocalDatabaseMigration(
  input: DatabasePresence,
): LegacyLocalDatabaseMigrationAction {
  if (!input.legacyExists) {
    return "not_needed";
  }

  if (!input.activeExists) {
    return "copy_legacy_to_active";
  }

  if (input.activeHasUserData) {
    return input.legacyHasUserData
      ? "use_active_legacy_collision"
      : "not_needed";
  }

  return input.legacyHasUserData
    ? "backup_empty_active_and_copy_legacy"
    : "not_needed";
}

async function defaultDatabaseHasUserData(
  sqlite: SQLiteModule,
  databaseName: string,
): Promise<boolean> {
  const db = await sqlite.openDatabaseAsync(
    databaseName,
    { useNewConnection: true },
  );

  try {
    for (const table of LOCAL_TABLES) {
      const tableRow = await db.getFirstAsync<{ name: string }>(
        "select name from sqlite_master where type = 'table' and name = ? limit 1",
        [table],
      );

      if (!tableRow) {
        continue;
      }

      const countRow = await db.getFirstAsync<{ count: number }>(
        `select count(*) as count from ${quoteIdentifier(table)}`,
      );

      if ((countRow?.count ?? 0) > 0) {
        return true;
      }
    }

    return false;
  } finally {
    await db.closeAsync();
  }
}

async function defaultDependencies(): Promise<LegacyLocalDatabaseMigrationDependencies> {
  const [fileSystem, sqlite] = await Promise.all([
    import("expo-file-system/legacy"),
    import("expo-sqlite"),
  ]);
  const databaseDirectory = sqlite.defaultDatabaseDirectory;

  return {
    databaseDirectory:
      databaseDirectory && databaseDirectory !== "." ? databaseDirectory : null,
    getInfoAsync: fileSystem.getInfoAsync,
    copyAsync: fileSystem.copyAsync,
    deleteAsync: fileSystem.deleteAsync,
    databaseHasUserData: (databaseName) =>
      defaultDatabaseHasUserData(sqlite, databaseName),
    now: () => new Date().toISOString(),
  };
}

export async function migrateLegacyLocalDatabaseIfNeeded(
  dependencies?: LegacyLocalDatabaseMigrationDependencies,
): Promise<LegacyLocalDatabaseMigrationResult> {
  const resolvedDependencies = dependencies ?? (await defaultDependencies());

  if (!resolvedDependencies.databaseDirectory) {
    return { action: "not_needed" };
  }

  const activeUri = databaseUri(
    resolvedDependencies.databaseDirectory,
    LOCAL_DATABASE_NAME,
  );
  const legacyUri = databaseUri(
    resolvedDependencies.databaseDirectory,
    LEGACY_LOCAL_DATABASE_NAME,
  );
  const [activeInfo, legacyInfo] = await Promise.all([
    resolvedDependencies.getInfoAsync(activeUri),
    resolvedDependencies.getInfoAsync(legacyUri),
  ]);
  const [activeHasUserData, legacyHasUserData] = await Promise.all([
    activeInfo.exists
      ? resolvedDependencies.databaseHasUserData(LOCAL_DATABASE_NAME)
      : Promise.resolve(false),
    legacyInfo.exists
      ? resolvedDependencies.databaseHasUserData(LEGACY_LOCAL_DATABASE_NAME)
      : Promise.resolve(false),
  ]);
  const action = resolveLegacyLocalDatabaseMigration({
    activeExists: activeInfo.exists,
    legacyExists: legacyInfo.exists,
    activeHasUserData,
    legacyHasUserData,
  });

  if (action === "copy_legacy_to_active") {
    await resolvedDependencies.copyAsync({ from: legacyUri, to: activeUri });

    return {
      action,
      migratedAt: resolvedDependencies.now(),
    };
  }

  if (action === "backup_empty_active_and_copy_legacy") {
    const migratedAt = resolvedDependencies.now();
    const backupUri = `${activeUri}.empty-before-legacy-copy-${migrationTimestampSuffix(
      migratedAt,
    )}.bak`;

    await resolvedDependencies.copyAsync({ from: activeUri, to: backupUri });
    await resolvedDependencies.deleteAsync(activeUri, { idempotent: true });
    await resolvedDependencies.copyAsync({ from: legacyUri, to: activeUri });

    return {
      action,
      backupUri,
      migratedAt,
    };
  }

  if (action === "use_active_legacy_collision") {
    console.warn(
      "LucidTLR found both active and legacy local databases with user data; using lucidtlr.db and leaving the legacy database untouched.",
    );
  }

  return { action };
}
