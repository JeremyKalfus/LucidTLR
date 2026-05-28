import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  NativeModules: {},
  Platform: { OS: "ios" },
}));

import type { LocalDb } from "@/src/data/local/localDb";
import { SLEEP_HISTORY_PERMISSION_STATUS_SETTING } from "@/src/data/local/repositories";
import { importSleepHistory } from "@/src/features/sleepHistory/importSleepHistory";
import type { HealthHistoryAdapter } from "@/src/native/health/HealthHistoryAdapter";

class FakeDb implements LocalDb {
  readonly settings = new Map<string, string>();

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    if (sql.includes("app_settings")) {
      const [key, value] = params;

      this.settings.set(String(key), String(value));
    }
  }

  async query<T>(): Promise<T[]> {
    return [];
  }

  async queryOne<T>(sql: string, params: unknown[] = []): Promise<T | null> {
    if (sql.includes("app_settings")) {
      const key = String(params[0]);
      const value = this.settings.get(key);

      return value ? ({ value_json: value } as T) : null;
    }

    if (sql.includes("count(*)")) {
      return { count: 0 } as T;
    }

    return null;
  }
}

describe("importSleepHistory", () => {
  it("handles denied permission without importing or throwing", async () => {
    const db = new FakeDb();
    let importCalled = false;
    const adapter: HealthHistoryAdapter = {
      async isAvailable() {
        return true;
      },
      async requestPermission() {
        return "denied";
      },
      async importSleepHistory() {
        importCalled = true;
        return { sessions: [], stageSegments: [] };
      },
      async getLastImportStatus() {
        return { available: true, permission: "denied" };
      },
    };

    const result = await importSleepHistory({
      db,
      participantId: "participant-1",
      adapter,
      source: "apple_health",
      now: "2026-01-01T12:00:00.000Z",
    });

    expect(result.enabled).toBe(false);
    expect(result.permissionStatus).toBe("denied");
    expect(result.importedSessionCount).toBe(0);
    expect(importCalled).toBe(false);
    expect(JSON.parse(db.settings.get(SLEEP_HISTORY_PERMISSION_STATUS_SETTING) ?? "null")).toBe(
      "denied",
    );
  });

  it("handles unavailable native health APIs without fake records", async () => {
    const db = new FakeDb();
    const adapter: HealthHistoryAdapter = {
      async isAvailable() {
        return false;
      },
      async requestPermission() {
        return "unavailable";
      },
      async importSleepHistory() {
        throw new Error("should not import");
      },
      async getLastImportStatus() {
        return { available: false, permission: "unavailable" };
      },
    };

    const result = await importSleepHistory({
      db,
      participantId: "participant-1",
      adapter,
      source: "health_connect",
      now: "2026-01-01T12:00:00.000Z",
    });

    expect(result.enabled).toBe(false);
    expect(result.permissionStatus).toBe("unavailable");
    expect(result.nightsImported).toBe(0);
    expect(result.prior).toBeNull();
  });
});
