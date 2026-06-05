import type { WatchEpoch } from "@/src/domain/types";
import type { WatchRuntimeEvent } from "@/src/features/watchHistory/watchHistoryTypes";

export type WatchGraphPoint = {
  timestamp: string;
  value: number;
};

export type WatchSleepGraphPoints = {
  sleep: WatchGraphPoint[];
  rem: WatchGraphPoint[];
  heartRate: WatchGraphPoint[];
  movement: WatchGraphPoint[];
  sensorQuality: WatchGraphPoint[];
  battery: WatchGraphPoint[];
  cues: WatchGraphPoint[];
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function numberPayload(
  payload: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = payload[key];

  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function roughMovementIntensityValue(epoch: WatchEpoch): number | null {
  if (epoch.roughMovementIntensity === "large") {
    return 1;
  }

  if (epoch.roughMovementIntensity === "moderate") {
    return 0.66;
  }

  if (epoch.roughMovementIntensity === "light") {
    return 0.33;
  }

  if (epoch.roughMovementIntensity === "still") {
    return 0.05;
  }

  return null;
}

function normalizedMotionSummaries(epochs: WatchEpoch[]): number[] {
  const numericValues = epochs
    .map((epoch) => epoch.motionSummary)
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value),
    );
  const max = Math.max(...numericValues, 0);

  return epochs.map((epoch) =>
    typeof epoch.motionSummary === "number" &&
    Number.isFinite(epoch.motionSummary) &&
    max > 0
      ? clamp01(epoch.motionSummary / max)
      : 0,
  );
}

function movementValue(
  epoch: WatchEpoch,
  normalizedMotionSummary: number,
): number | null {
  const rough = roughMovementIntensityValue(epoch);

  if (rough !== null) {
    return rough;
  }

  return typeof epoch.motionSummary === "number"
    ? normalizedMotionSummary
    : null;
}

function sensorQualityValue(epoch: WatchEpoch): number | null {
  if (epoch.sensorQuality === "good") {
    return 1;
  }

  if (epoch.sensorQuality === "degraded") {
    return 0.55;
  }

  if (epoch.sensorQuality === "bad") {
    return 0.25;
  }

  if (epoch.sensorQuality === "missing") {
    return 0;
  }

  return null;
}

export function graphPointsForWatchData(input: {
  epochs: WatchEpoch[];
  runtimeEvents: WatchRuntimeEvent[];
}): WatchSleepGraphPoints {
  const normalizedMotion = normalizedMotionSummaries(input.epochs);

  return {
    sleep: input.epochs.flatMap((epoch) =>
      typeof epoch.sleepProbability === "number"
        ? [{ timestamp: epoch.epochEnd, value: clamp01(epoch.sleepProbability) }]
        : [],
    ),
    rem: input.epochs.flatMap((epoch) =>
      typeof epoch.remProbability === "number"
        ? [{ timestamp: epoch.epochEnd, value: clamp01(epoch.remProbability) }]
        : [],
    ),
    heartRate: input.epochs.flatMap((epoch) =>
      typeof epoch.heartRateSummary === "number"
        ? [
            {
              timestamp: epoch.epochEnd,
              value: clamp01((epoch.heartRateSummary - 40) / 100),
            },
          ]
        : [],
    ),
    movement: input.epochs.flatMap((epoch, index) => {
      const value = movementValue(epoch, normalizedMotion[index] ?? 0);

      return value === null ? [] : [{ timestamp: epoch.epochEnd, value }];
    }),
    sensorQuality: input.epochs.flatMap((epoch) => {
      const value = sensorQualityValue(epoch);

      return value === null ? [] : [{ timestamp: epoch.epochEnd, value }];
    }),
    battery: input.epochs.flatMap((epoch) =>
      typeof epoch.watchBatteryLevel === "number"
        ? [{ timestamp: epoch.epochEnd, value: clamp01(epoch.watchBatteryLevel) }]
        : [],
    ),
    cues: input.runtimeEvents
      .filter(
        (event) =>
          event.eventType === "watch_cue_played" ||
          event.eventType === "watch_cue_failed",
      )
      .map((event) => ({
        timestamp: event.timestamp,
        value: numberPayload(event.payload, "volume") ?? 1,
      })),
  };
}
