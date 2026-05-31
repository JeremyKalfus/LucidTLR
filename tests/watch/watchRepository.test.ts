import { describe, expect, it } from "vitest";

import type { LocalDb } from "@/src/data/local/localDb";
import {
  loadLatestWatchEpoch,
  loadWatchEpochsForSession,
  saveWatchEpochs,
  summarizeWatchSession,
} from "@/src/data/local/repositories";
import type { WatchEpochRecordDraft } from "@/src/native/watch";

class FakeWatchDb implements LocalDb {
  readonly rows = new Map<string, Record<string, unknown>>();

  async execute(_sql: string, params: unknown[] = []): Promise<void> {
    const [
      id,
      sessionId,
      epochStart,
      epochEnd,
      heartRateSummary,
      motionSummary,
      sensorQuality,
      sleepProbability,
      elapsedSessionSeconds,
      remProbability,
      remLabel,
      classifierVersion,
      epochFeaturesJson,
      watchBatteryLevel,
      watchConnectivityState,
      sampleCountsJson,
      stageProbabilitiesJson,
      stageLabel,
      epochReceivedAt,
      processedAt,
      heartRateSampleCount,
      motionSampleCount,
      hrFeature,
      motionFeature,
      motionEma,
      timeFeature,
      rawEpochAvailable,
      stableLowMovementSeconds,
      roughMovementIntensity,
      cueDecisionReason,
    ] = params;

    this.rows.set(String(id), {
      id,
      session_id: sessionId,
      epoch_start: epochStart,
      epoch_end: epochEnd,
      heart_rate_summary: heartRateSummary,
      motion_summary: motionSummary,
      sensor_quality: sensorQuality,
      sleep_probability: sleepProbability,
      elapsed_session_seconds: elapsedSessionSeconds,
      rem_probability: remProbability,
      rem_label: remLabel,
      classifier_version: classifierVersion,
      epoch_features_json: epochFeaturesJson,
      watch_battery_level: watchBatteryLevel,
      watch_connectivity_state: watchConnectivityState,
      sample_counts_json: sampleCountsJson,
      stage_probabilities_json: stageProbabilitiesJson,
      stage_label: stageLabel,
      epoch_received_at: epochReceivedAt,
      processed_at: processedAt,
      heart_rate_sample_count: heartRateSampleCount,
      motion_sample_count: motionSampleCount,
      hr_feature: hrFeature,
      motion_feature: motionFeature,
      motion_ema: motionEma,
      time_feature: timeFeature,
      raw_epoch_available: rawEpochAvailable,
      stable_low_movement_seconds: stableLowMovementSeconds,
      rough_movement_intensity: roughMovementIntensity,
      cue_decision_reason: cueDecisionReason,
    });
  }

  async query<T>(_sql: string, params: unknown[] = []): Promise<T[]> {
    const sessionId = String(params[0]);

    return [...this.rows.values()]
      .filter((row) => row.session_id === sessionId)
      .sort((left, right) =>
        String(left.epoch_start).localeCompare(String(right.epoch_start)),
      ) as T[];
  }

  async queryOne<T>(_sql: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.query<T>("", params);

    return rows.at(-1) ?? null;
  }
}

function epoch(overrides: Partial<WatchEpochRecordDraft> = {}): WatchEpochRecordDraft {
  return {
    id: "epoch-1",
    sessionId: "session-1",
    epochStart: "2026-01-01T05:00:00.000Z",
    epochEnd: "2026-01-01T05:00:30.000Z",
    elapsedSessionSeconds: 30,
    heartRateSummary: 61,
    motionSummary: 12,
    sensorQuality: "good",
    sleepProbability: 0.8,
    remProbability: 0.3,
    remLabel: "likely_rem",
    classifierVersion: "lucidcue-watch-rem-v1",
    stableLowMovementSeconds: 60,
    roughMovementIntensity: "light",
    cueDecisionReason: "watch_likely_rem",
    watchConnectivityState: "connected",
    rawEpochAvailable: false,
    ...overrides,
  };
}

describe("watch epoch repository helpers", () => {
  it("saves, loads, and summarizes local watch epochs", async () => {
    const db = new FakeWatchDb();

    await saveWatchEpochs({
      db,
      records: [
        epoch(),
        epoch({
          id: "epoch-2",
          epochStart: "2026-01-01T05:00:30.000Z",
          epochEnd: "2026-01-01T05:01:00.000Z",
          remLabel: "not_likely_rem",
          sensorQuality: "degraded",
          watchConnectivityState: "delayed",
        }),
      ],
    });

    await expect(
      loadWatchEpochsForSession({ db, sessionId: "session-1" }),
    ).resolves.toHaveLength(2);
    await expect(
      loadLatestWatchEpoch({ db, sessionId: "session-1" }),
    ).resolves.toMatchObject({
      id: "epoch-2",
      stableLowMovementSeconds: 60,
      roughMovementIntensity: "light",
      cueDecisionReason: "watch_likely_rem",
    });
    await expect(
      summarizeWatchSession({ db, sessionId: "session-1" }),
    ).resolves.toEqual({
      epochsReceived: 2,
      usableEpochs: 2,
      likelyRemEpochs: 1,
      connectivityGaps: 1,
      classifierVersions: ["lucidcue-watch-rem-v1"],
    });
  });
});
