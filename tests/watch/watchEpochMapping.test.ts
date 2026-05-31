import { describe, expect, it } from "vitest";

import {
  mapWatchEpochMessageToRecord,
  parseWatchEpochMessage,
} from "@/src/native/watch/watchEpochMapping";

describe("watchEpochMapping", () => {
  it("validates and maps watch epoch messages into local records", () => {
    const message = parseWatchEpochMessage({
      schemaVersion: "watch-epoch-v1",
      sessionId: "session-1",
      watchSessionId: "watch-session-1",
      epochIndex: 3,
      epochStart: "2026-01-01T05:00:00.000Z",
      epochEnd: "2026-01-01T05:00:30.000Z",
      elapsedSessionSeconds: 90,
      heartRate: { sampleCount: 6, meanBpm: 61, hrFeature: 226.981 },
      motion: {
        sampleCount: 900,
        activityCountMagnitudeSum: 12,
        motionFeature: 0.001,
        motionEma: 1_000_000,
      },
      modelFeatures: {
        hrFeature: 226.981,
        motionFeature: 0.001,
        timeFeatureHours: 0.025,
      },
      battery: { level: 0.88, state: "unplugged", lowPowerMode: false },
      sensorQuality: "good",
      connectivityState: "connected",
    });
    const record = mapWatchEpochMessageToRecord(
      message,
      "2026-01-01T05:00:31.000Z",
    );

    expect(record).toMatchObject({
      id: "session-1:watch-session-1:3",
      sessionId: "session-1",
      heartRateSummary: 61,
      motionSummary: 12,
      sensorQuality: "good",
      classifierVersion: "mallela-feature-pipeline-no-model",
      watchBatteryLevel: 0.88,
      watchConnectivityState: "connected",
      heartRateSampleCount: 6,
      motionSampleCount: 900,
      hrFeature: 226.981,
      motionFeature: 0.001,
      motionEma: 1_000_000,
      timeFeature: 0.025,
      rawEpochAvailable: false,
    });
    expect(JSON.parse(record.sampleCountsJson ?? "{}")).toEqual({
      heartRate: 6,
      motion: 900,
    });
  });
});
