import { describe, expect, it } from "vitest";

import {
  LEGACY_FULL_LOCAL_DATA_EXPORT_SCHEMA,
  LEGACY_LOCAL_DATABASE_NAME,
  LEGACY_LOCAL_DATABASE_MIGRATION_SETTING,
  resolveLegacyLocalDatabaseMigration,
} from "@/src/data/local/legacyLocalDataMigration";
import { LOCAL_DATABASE_NAME } from "@/src/data/local/schema";

describe("legacy local data migration", () => {
  it("names only explicit legacy data compatibility aliases", () => {
    expect(LOCAL_DATABASE_NAME).toBe("lucidtlr.db");
    expect(LEGACY_LOCAL_DATABASE_NAME).toBe("lucidcue.db");
    expect(LEGACY_LOCAL_DATABASE_MIGRATION_SETTING).toBe(
      "legacy_lucidcue_db_migrated_at",
    );
    expect(LEGACY_FULL_LOCAL_DATA_EXPORT_SCHEMA).toBe(
      "lucidcue-full-local-data-v1",
    );
  });

  it("copies the legacy DB when no active DB exists", () => {
    expect(
      resolveLegacyLocalDatabaseMigration({
        activeExists: false,
        legacyExists: true,
        activeHasUserData: false,
        legacyHasUserData: true,
      }),
    ).toBe("copy_legacy_to_active");
  });

  it("keeps the active DB when it already has user data", () => {
    expect(
      resolveLegacyLocalDatabaseMigration({
        activeExists: true,
        legacyExists: true,
        activeHasUserData: true,
        legacyHasUserData: true,
      }),
    ).toBe("use_active_legacy_collision");
  });

  it("copies legacy data over an empty active DB after backup", () => {
    expect(
      resolveLegacyLocalDatabaseMigration({
        activeExists: true,
        legacyExists: true,
        activeHasUserData: false,
        legacyHasUserData: true,
      }),
    ).toBe("backup_empty_active_and_copy_legacy");
  });

  it("does nothing when only the active DB exists", () => {
    expect(
      resolveLegacyLocalDatabaseMigration({
        activeExists: true,
        legacyExists: false,
        activeHasUserData: true,
        legacyHasUserData: false,
      }),
    ).toBe("not_needed");
  });
});
