import { describe, expect, it } from "vitest";

import { graphPointsForWatchData } from "@/src/components/sleep/watchSleepGraphData";
import type { WatchEpoch } from "@/src/domain/types";
import type { WatchRuntimeEvent } from "@/src/features/watchHistory/watchHistoryTypes";

const epoch = (overrides: Partial<WatchEpoch>): WatchEpoch => ({
  id: `epoch-${overrides.epochEnd ?? "1"}`,
  sessionId: "session-1",
  epochStart: "2026-01-01T05:00:00.000Z",
  epochEnd: "2026-01-01T05:00:30.000Z",
  elapsedSessionSeconds: 30,
  ...overrides,
});

const event = (
  overrides: Partial<WatchRuntimeEvent>,
): WatchRuntimeEvent => ({
  id: `event-${overrides.eventType ?? "watch_cue_played"}`,
  sessionId: "session-1",
  timestamp: "2026-01-01T05:01:00.000Z",
  eventType: "watch_cue_played",
  payload: {},
  ...overrides,
});

describe("graphPointsForWatchData", () => {
  it("maps watch sleep, REM, heart rate, movement, quality, battery, and cues", () => {
    const points = graphPointsForWatchData({
      epochs: [
        epoch({
          epochEnd: "2026-01-01T05:00:30.000Z",
          sleepProbability: 0.82,
          remProbability: 0.4,
          heartRateSummary: 80,
          roughMovementIntensity: "still",
          sensorQuality: "good",
          watchBatteryLevel: 0.72,
        }),
        epoch({
          epochEnd: "2026-01-01T05:01:00.000Z",
          sleepProbability: 1.2,
          remProbability: -0.1,
          heartRateSummary: 140,
          roughMovementIntensity: "large",
          sensorQuality: "bad",
          watchBatteryLevel: 0.7,
        }),
      ],
      runtimeEvents: [
        event({
          timestamp: "2026-01-01T05:01:10.000Z",
          payload: { volume: 0.35 },
        }),
        event({
          eventType: "watch_cue_failed",
          timestamp: "2026-01-01T05:01:20.000Z",
        }),
      ],
    });

    expect(points.sleep.map((point) => point.value)).toEqual([0.82, 1]);
    expect(points.rem.map((point) => point.value)).toEqual([0.4, 0]);
    expect(points.heartRate.map((point) => point.value)).toEqual([0.4, 1]);
    expect(points.movement.map((point) => point.value)).toEqual([0.05, 1]);
    expect(points.sensorQuality.map((point) => point.value)).toEqual([1, 0.25]);
    expect(points.battery.map((point) => point.value)).toEqual([0.72, 0.7]);
    expect(points.cues.map((point) => point.value)).toEqual([0.35, 1]);
  });

  it("normalizes motion summaries when rough movement is unavailable", () => {
    const points = graphPointsForWatchData({
      epochs: [
        epoch({
          epochEnd: "2026-01-01T05:00:30.000Z",
          motionSummary: 4,
        }),
        epoch({
          epochEnd: "2026-01-01T05:01:00.000Z",
          motionSummary: 8,
        }),
      ],
      runtimeEvents: [],
    });

    expect(points.movement.map((point) => point.value)).toEqual([0.5, 1]);
  });
});
