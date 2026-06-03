import { describe, expect, it } from "vitest";

import type { LocalDb } from "@/src/data/local/localDb";
import {
  importWatchOwnedRuntimeDataToLocalRecords,
} from "@/src/native/watch/watchRuntimePersistence";

class FakeWatchRuntimeDb implements LocalDb {
  readonly epochRows: unknown[][] = [];
  readonly eventRows: unknown[][] = [];
  readonly cueRows: unknown[][] = [];

  constructor(private readonly sessions: { id: string }[] = []) {}

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    if (sql.includes("insert into watch_epochs")) {
      this.epochRows.push(params);
    }

    if (sql.includes("insert into watch_runtime_events")) {
      this.eventRows.push(params);
    }

    if (sql.includes("insert into cue_events")) {
      this.cueRows.push(params);
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

describe("watch runtime persistence helpers", () => {
  it("imports Watch-owned v2 epochs, cue deliveries, and summary events idempotently", async () => {
    const db = new FakeWatchRuntimeDb();

    const result = await importWatchOwnedRuntimeDataToLocalRecords({
      db,
      payload: {
        sessionId: "session-v2",
        epochs: [
          {
            protocol: "watch-epoch-v2",
            sessionId: "session-v2",
            watchSessionId: "watch-local",
            epochIndex: 1,
            startedAt: "2026-01-01T05:00:00.000Z",
            endedAt: "2026-01-01T05:00:30.000Z",
            elapsedSec: 30,
            heartRateSampleCount: 0,
            heartRateMissing: true,
            accelSampleCount: 900,
            accelMissing: false,
            motionMean: 0.01,
            movementGateTriggered: false,
            batteryPct: 88,
            lowPowerModeEnabled: true,
            remProbability: 0.3,
            modelVersion: "lucidcue-watch-rem-v1",
            likelyRem: true,
            consecutiveLikelyRemEpochs: 1,
            cueDecisionAction: "play_cue",
            cueDecisionReason: "watch_likely_rem",
          },
        ],
        cueDeliveries: [
          {
            protocol: "watch-cue-delivery-v2",
            sessionId: "session-v2",
            epochIndex: 1,
            requestedAt: "2026-01-01T05:00:31.000Z",
            cueMode: "audio_haptic",
            cueId: "harp-flourish",
            deliveryDevice: "watch",
            hapticRequested: true,
            audioRequested: true,
            succeeded: true,
          },
        ],
        summary: {
          protocol: "watch-session-summary-v2",
          sessionId: "session-v2",
          startedAt: "2026-01-01T05:00:00.000Z",
          stoppedAt: "2026-01-01T06:00:00.000Z",
          stopReason: "completed_stop_at",
          epochCount: 120,
          validEpochCount: 119,
          cueCount: 1,
          syncStatus: "queued",
        },
      },
    });

    expect(result.epochs).toHaveLength(1);
    expect(result.logs).toHaveLength(3);
    expect(db.epochRows).toHaveLength(1);
    expect(db.cueRows).toHaveLength(1);
    expect(db.cueRows[0][5]).toBe("watch");
    expect(db.eventRows).toHaveLength(3);
  });
});
