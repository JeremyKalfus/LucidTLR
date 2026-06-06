import { describe, expect, it } from "vitest";

import {
  exportFullLocalData,
  FULL_LOCAL_DATA_EXPORT_SCHEMA,
  parseFullLocalDataExport,
} from "@/src/data/local/fullDataBackup";
import type { LocalDb } from "@/src/data/local/localDb";
import { LOCAL_TABLES, type LocalTableName } from "@/src/data/local/schema";

class EmptyExportDb implements LocalDb {
  async execute(): Promise<void> {}

  async query<T>(): Promise<T[]> {
    return [];
  }

  async queryOne<T>(): Promise<T | null> {
    return null;
  }
}

function emptyTables(): Record<LocalTableName, []> {
  return LOCAL_TABLES.reduce(
    (tables, table) => ({
      ...tables,
      [table]: [],
    }),
    {} as Record<LocalTableName, []>,
  );
}

describe("full local data backup compatibility", () => {
  it("writes new LucidTLR export schema labels", async () => {
    await expect(
      exportFullLocalData({
        db: new EmptyExportDb(),
        exportedAt: "2026-06-05T20:00:00.000Z",
      }),
    ).resolves.toMatchObject({
      exportSchema: FULL_LOCAL_DATA_EXPORT_SCHEMA,
      exportedAt: "2026-06-05T20:00:00.000Z",
    });
  });

  it("still accepts pre-rename full export files", () => {
    expect(
      parseFullLocalDataExport(
        JSON.stringify({
          exportSchema: "lucidcue-full-local-data-v1",
          exportedAt: "2026-06-05T20:00:00.000Z",
          tables: {
            ...emptyTables(),
            watch_epochs: [
              {
                id: "watch-epoch-1",
                session_id: "watch-session-1",
                epoch_start: "2026-06-05T04:00:00.000Z",
                epoch_end: "2026-06-05T04:00:30.000Z",
              },
            ],
            watch_runtime_events: [
              {
                id: "watch-runtime-event-1",
                session_id: "watch-session-1",
                timestamp: "2026-06-05T04:00:00.000Z",
                event_type: "runtime_completed",
                payload_json: "{}",
              },
            ],
          },
          nativePhoneRuntimeLogs: {},
        }),
      ),
    ).toMatchObject({
      exportSchema: "lucidcue-full-local-data-v1",
      tables: {
        watch_epochs: [{ id: "watch-epoch-1" }],
        watch_runtime_events: [{ id: "watch-runtime-event-1" }],
      },
    });
  });
});
