import { describe, expect, it } from "vitest";

import type { LocalDb } from "@/src/data/local/localDb";
import {
  importWatchOwnedRuntimeDataToLocalRecords,
  loadImportedWatchOwnedRuntimeSummary,
} from "@/src/native/watch/watchRuntimePersistence";
import type { WatchOwnedImportPayloadV2 } from "@/src/native/watch/WatchOwnedTypes";

class FakeWatchRuntimeDb implements LocalDb {
  readonly epochRows: unknown[][] = [];
  readonly eventRows: unknown[][] = [];
  readonly cueRows: unknown[][] = [];
  private readonly epochIds = new Set<unknown>();
  private readonly eventIds = new Set<unknown>();
  private readonly cueIds = new Set<unknown>();

  constructor(
    private readonly sessions: { id: string }[] = [],
    private readonly storedWatchEpochRows: Record<string, unknown>[] = [],
    private readonly storedWatchRuntimeEventRows: Record<string, unknown>[] = [],
  ) {}

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    if (sql.includes("insert into watch_epochs")) {
      if (this.epochIds.has(params[0])) {
        return;
      }
      this.epochIds.add(params[0]);
      this.epochRows.push(params);
    }

    if (sql.includes("insert into watch_runtime_events")) {
      if (this.eventIds.has(params[0])) {
        return;
      }
      this.eventIds.add(params[0]);
      this.eventRows.push(params);
    }

    if (sql.includes("insert into cue_events")) {
      if (this.cueIds.has(params[0])) {
        return;
      }
      this.cueIds.add(params[0]);
      this.cueRows.push(params);
    }
  }

  async query<T>(sql: string): Promise<T[]> {
    if (sql.includes("from sessions")) {
      return this.sessions as T[];
    }

    if (sql.includes("from watch_epochs")) {
      return this.storedWatchEpochRows as T[];
    }

    if (sql.includes("from watch_runtime_events")) {
      return this.storedWatchRuntimeEventRows as T[];
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

    const payload: WatchOwnedImportPayloadV2 = {
        sessionId: "session-v2",
        runtimeEvents: [
          {
            protocol: "watch-runtime-event-v2" as const,
            id: "session-v2:watch_training_started:watch-local",
            sessionId: "session-v2",
            watchSessionId: "watch-local",
            timestamp: "2026-01-01T04:00:00.000Z",
            eventType: "watch_training_started" as const,
            payload: {
              trainingAssetId: "final_lucid_training",
              cueScheduleCount: 17,
            },
          },
          {
            protocol: "watch-runtime-event-v2" as const,
            id: "session-v2:watch_training_completed:watch-local",
            sessionId: "session-v2",
            watchSessionId: "watch-local",
            timestamp: "2026-01-01T04:22:20.928Z",
            eventType: "watch_training_completed" as const,
            payload: {
              actualTrainingCompletedAt: "2026-01-01T04:22:20.928Z",
            },
          },
        ],
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
      };
    const result = await importWatchOwnedRuntimeDataToLocalRecords({
      db,
      payload,
    });
    await importWatchOwnedRuntimeDataToLocalRecords({ db, payload });

    expect(result.epochs).toHaveLength(1);
    expect(result.logs).toHaveLength(5);
    expect(db.epochRows).toHaveLength(1);
    expect(db.cueRows).toHaveLength(1);
    expect(db.cueRows[0][5]).toBe("watch");
    expect(db.eventRows).toHaveLength(5);
    expect(db.eventRows[0][3]).toBe("watch_training_started");
    expect(db.eventRows[1][3]).toBe("watch_training_completed");
  });

  it("loads a terminal Watch-owned summary from already imported local records", async () => {
    const db = new FakeWatchRuntimeDb(
      [],
      [
        {
          id: "epoch-1",
          session_id: "session-v2",
          epoch_start: "2026-01-01T05:00:00.000Z",
          epoch_end: "2026-01-01T05:00:30.000Z",
          heart_rate_summary: 64,
          motion_summary: 0.02,
          sensor_quality: "good",
          sleep_probability: null,
          elapsed_session_seconds: 30,
          rem_probability: 0.82,
          rem_label: "likely_rem",
          classifier_version: "lucidcue-watch-rem-v1",
          epoch_features_json: null,
          watch_battery_level: 0.8,
          watch_connectivity_state: "delayed",
          sample_counts_json: null,
          stage_probabilities_json: null,
          stage_label: null,
          epoch_received_at: "2026-01-01T05:00:30.000Z",
          processed_at: "2026-01-01T05:00:30.000Z",
          heart_rate_sample_count: 1,
          motion_sample_count: 900,
          hr_feature: null,
          motion_feature: null,
          motion_ema: null,
          time_feature: null,
          raw_epoch_available: 0,
          stable_low_movement_seconds: null,
          rough_movement_intensity: null,
          cue_decision_reason: "watch_likely_rem",
        },
      ],
      [
        {
          id: "session-v2:watch_runtime_stopped:summary",
          session_id: "session-v2",
          timestamp: "2026-01-01T06:00:00.000Z",
          event_type: "watch_runtime_stopped",
          payload_json: JSON.stringify({
            reason: "completed",
            stoppedAt: "2026-01-01T06:00:00.000Z",
          }),
        },
      ],
    );

    const result = await loadImportedWatchOwnedRuntimeSummary({
      db,
      sessionId: "session-v2",
    });

    expect(result?.epochs).toHaveLength(1);
    expect(result?.logs).toHaveLength(1);
    expect(result?.summary.completed).toBe(true);
  });

  it("does not treat nonterminal local Watch records as a completed import", async () => {
    const db = new FakeWatchRuntimeDb([], [], []);

    await expect(
      loadImportedWatchOwnedRuntimeSummary({
        db,
        sessionId: "session-v2",
      }),
    ).resolves.toBeNull();
  });
});
