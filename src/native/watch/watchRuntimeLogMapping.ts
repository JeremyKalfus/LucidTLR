import type { WatchRuntimeEvent } from "./WatchModeTypes";

export type WatchRuntimeLogSummary = {
  epochsReceived: number;
  likelyRemEpochs: number;
  cuesPlayed: number;
  cueFailures: number;
  cueSuppressions: number;
  movementPauses: number;
  classifierVersions: string[];
  stopped: boolean;
  completed: boolean;
  errored: boolean;
};

type WatchRuntimeSummaryEpoch = {
  classifierVersion?: string;
  remLabel?: string;
};

function stringPayload(
  payload: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = payload[key];

  return typeof value === "string" ? value : undefined;
}

export function summarizeWatchRuntime<Epoch extends WatchRuntimeSummaryEpoch>(
  events: WatchRuntimeEvent[],
  epochs: Epoch[] = [],
): WatchRuntimeLogSummary {
  const classifierVersions = new Set(
    [
      ...epochs.map((epoch) => epoch.classifierVersion),
      ...events.map((event) => stringPayload(event.payload, "classifierVersion")),
    ].filter((version): version is string => Boolean(version)),
  );

  return {
    epochsReceived:
      epochs.length ||
      events.filter(
        (event) =>
          event.eventType === "watch_epoch_received" ||
          event.eventType === "watch_epoch_delayed",
      ).length,
    likelyRemEpochs: epochs.filter((epoch) => epoch.remLabel === "likely_rem").length,
    cuesPlayed: events.filter((event) => event.eventType === "watch_cue_played").length,
    cueFailures: events.filter((event) => event.eventType === "watch_cue_failed").length,
    cueSuppressions: events.filter(
      (event) => event.eventType === "watch_cue_suppressed",
    ).length,
    movementPauses: events.filter(
      (event) => event.eventType === "watch_movement_pause_started",
    ).length,
    classifierVersions: [...classifierVersions],
    stopped: events.some((event) => event.eventType === "watch_runtime_stopped"),
    completed: events.some(
      (event) =>
        event.eventType === "watch_runtime_stopped" &&
        event.payload.reason === "completed",
    ),
    errored: events.some(
      (event) =>
        event.eventType === "watch_runtime_error" ||
        event.eventType === "watch_training_failed" ||
        event.eventType === "watch_audio_bed_failed" ||
        event.eventType === "watch_cue_failed" ||
        (event.eventType === "watch_runtime_stopped" &&
          event.payload.reason === "error"),
    ),
  };
}

export function latestWatchRuntimeStopTimestamp(
  events: WatchRuntimeEvent[],
): string | null {
  const stopEvent = [...events]
    .reverse()
    .find((event) => event.eventType === "watch_runtime_stopped");

  if (!stopEvent) {
    return null;
  }

  return stringPayload(stopEvent.payload, "stoppedAt") ?? stopEvent.timestamp;
}
