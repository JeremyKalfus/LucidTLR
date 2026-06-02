import { describe, expect, it, vi } from "vitest";

import type { LocalDb } from "@/src/data/local/localDb";
import type {
  WatchEpochRecordDraft,
  WatchRuntimeEvent,
  WatchRuntimeStatus,
} from "@/src/native/watch";
import {
  collectWatchRuntimeDataForLocalSessions,
  reconcileStoppedWatchRuntime,
  type WatchRuntimeStatusSource,
} from "@/src/native/watch/watchRuntimePersistence";

class FakeWatchRuntimeDb implements LocalDb {
  readonly epochRows: unknown[][] = [];
  readonly eventRows: unknown[][] = [];

  constructor(private readonly sessions: { id: string }[] = []) {}

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    if (sql.includes("insert into watch_epochs")) {
      this.epochRows.push(params);
    }

    if (sql.includes("insert into watch_runtime_events")) {
      this.eventRows.push(params);
    }
  }

  async query<T>(sql: string): Promise<T[]> {
    if (sql.includes("from sessions")) {
      return this.sessions as T[];
    }

    return [];
  }

  async queryOne<T>(): Promise<T | null> {
    return null;
  }
}

function status(
  overrides: Partial<WatchRuntimeStatus> = {},
): WatchRuntimeStatus {
  return {
    available: true,
    running: false,
    watchSessionRunning: false,
    watchReachable: true,
    watchAppInstalled: true,
    audioBedRunning: false,
    cueCount: 0,
    consecutiveLikelyRemEpochs: 0,
    classifierVersion: "lucidcue-watch-rem-v1",
    modelAvailable: true,
    connectivityState: "connected",
    watchHealthAuthorizationStatus: "authorized",
    ...overrides,
  };
}

function epoch(sessionId: string): WatchEpochRecordDraft {
  return {
    id: `${sessionId}:watch:1`,
    sessionId,
    epochStart: "2026-01-01T05:00:00.000Z",
    epochEnd: "2026-01-01T05:00:30.000Z",
    elapsedSessionSeconds: 30,
    sensorQuality: "good",
    remLabel: "not_likely_rem",
  };
}

function stoppedEvent(sessionId: string): WatchRuntimeEvent {
  return {
    id: `${sessionId}:stop`,
    sessionId,
    timestamp: "2026-01-01T06:00:00.000Z",
    eventType: "watch_runtime_stopped",
    payload: {
      reason: "completed",
      stoppedAt: "2026-01-01T06:00:05.000Z",
    },
  };
}

function runtime(
  overrides: Partial<WatchRuntimeStatusSource> = {},
): WatchRuntimeStatusSource {
  return {
    getWatchRuntimeStatus: vi.fn(() => Promise.resolve(status())),
    getWatchEpochs: vi.fn((sessionId: string) => Promise.resolve([epoch(sessionId)])),
    getWatchRuntimeLogs: vi.fn((sessionId: string) =>
      Promise.resolve([stoppedEvent(sessionId)]),
    ),
    ...overrides,
  };
}

describe("watch runtime persistence helpers", () => {
  it("imports terminal native Watch data and returns the native stop timestamp", async () => {
    const db = new FakeWatchRuntimeDb();
    const nativeRuntime = runtime();

    const result = await reconcileStoppedWatchRuntime({
      db,
      sessionId: "session-1",
      runtime: nativeRuntime,
    });

    expect(result.shouldEndSession).toBe(true);
    expect(result.stopTimestamp).toBe("2026-01-01T06:00:05.000Z");
    expect(db.epochRows).toHaveLength(1);
    expect(db.eventRows).toHaveLength(1);
    expect(nativeRuntime.getWatchEpochs).toHaveBeenCalledWith("session-1");
    expect(nativeRuntime.getWatchRuntimeLogs).toHaveBeenCalledWith("session-1");
  });

  it("does not fetch native Watch data while the runtime is still running", async () => {
    const db = new FakeWatchRuntimeDb();
    const nativeRuntime = runtime({
      getWatchRuntimeStatus: vi.fn(() =>
        Promise.resolve(status({ running: true, watchSessionRunning: true })),
      ),
    });

    const result = await reconcileStoppedWatchRuntime({
      db,
      sessionId: "session-1",
      runtime: nativeRuntime,
    });

    expect(result.shouldEndSession).toBe(false);
    expect(db.epochRows).toHaveLength(0);
    expect(db.eventRows).toHaveLength(0);
    expect(nativeRuntime.getWatchEpochs).not.toHaveBeenCalled();
  });

  it("collects Watch data for export and continues after a per-session native failure", async () => {
    const db = new FakeWatchRuntimeDb([
      { id: "session-fails" },
      { id: "session-imports" },
    ]);
    const nativeRuntime = runtime({
      getWatchEpochs: vi.fn((sessionId: string) => {
        if (sessionId === "session-fails") {
          return Promise.reject(new Error("native fetch failed"));
        }

        return Promise.resolve([epoch(sessionId)]);
      }),
    });

    const result = await collectWatchRuntimeDataForLocalSessions({
      db,
      runtime: nativeRuntime,
    });

    expect(result).toEqual({
      attemptedSessionCount: 2,
      importedSessionCount: 1,
      failedSessionCount: 1,
    });
    expect(db.epochRows).toHaveLength(1);
    expect(db.eventRows).toHaveLength(1);
  });
});
