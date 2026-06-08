import { describe, expect, it } from "vitest";

import type { LocalDb } from "@/src/data/local/localDb";
import {
  deleteLocalSession,
  PHONE_NIGHT_CALIBRATION_NIGHTS_SETTING,
} from "@/src/data/local/repositories";

class FakeDeletionDb implements LocalDb {
  readonly calls: Array<{ sql: string; params: unknown[] }> = [];
  readonly settings = new Map<string, string>([
    [
      PHONE_NIGHT_CALIBRATION_NIGHTS_SETTING,
      JSON.stringify([
        { sessionId: "session-delete", endedAt: "2026-05-31T08:00:00.000Z" },
        { sessionId: "session-keep", endedAt: "2026-05-30T08:00:00.000Z" },
      ]),
    ],
  ]);

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    this.calls.push({ sql, params });

    if (sql.includes("insert into app_settings")) {
      this.settings.set(String(params[0]), String(params[1]));
    }
  }

  async query<T>(): Promise<T[]> {
    return [];
  }

  async queryOne<T>(_sql: string, params: unknown[] = []): Promise<T | null> {
    const valueJson = this.settings.get(String(params[0]));

    return valueJson ? ({ value_json: valueJson } as T) : null;
  }
}

describe("deleteLocalSession", () => {
  it("deletes session-scoped local data and calibration history", async () => {
    const db = new FakeDeletionDb();

    await deleteLocalSession({
      db,
      sessionId: "session-delete",
      updatedAt: "2026-05-31T12:00:00.000Z",
    });

    const deleteCalls = db.calls
      .filter((call) => call.sql.startsWith("delete from"))
      .map((call) => [call.sql, call.params]);

    expect(deleteCalls).toEqual([
      ["delete from cue_events where session_id = ?", ["session-delete"]],
      ["delete from movement_events where session_id = ?", ["session-delete"]],
      ["delete from watch_epochs where session_id = ?", ["session-delete"]],
      ["delete from watch_runtime_events where session_id = ?", ["session-delete"]],
      ["delete from watch_lab_debug_events where session_id = ?", ["session-delete"]],
      ["delete from watch_session_sync_states where session_id = ?", ["session-delete"]],
      ["delete from watch_sync_packages where session_id = ?", ["session-delete"]],
      ["delete from morning_reports where session_id = ?", ["session-delete"]],
      ["delete from dream_journals where session_id = ?", ["session-delete"]],
      [
        "delete from questionnaire_responses where session_id = ?",
        ["session-delete"],
      ],
      ["delete from upload_queue where entity_id = ?", ["session-delete"]],
      ["delete from sessions where id = ?", ["session-delete"]],
    ]);
    expect(
      JSON.parse(db.settings.get(PHONE_NIGHT_CALIBRATION_NIGHTS_SETTING) ?? "[]"),
    ).toEqual([
      { sessionId: "session-keep", endedAt: "2026-05-30T08:00:00.000Z" },
    ]);
  });
});
