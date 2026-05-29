import type { CueSuppressionReason } from "@/src/domain/types";

import type {
  NativePhoneRuntimeEvent,
  PhoneRuntimeCueRecordDraft,
  PhoneRuntimeLogSummary,
  PhoneRuntimeMovementRecordDraft,
} from "./NativePhoneSessionPlan";

function numberPayload(
  payload: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = payload[key];

  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringPayload(
  payload: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = payload[key];

  return typeof value === "string" ? value : undefined;
}

function movementIntensityScore(value: string | undefined): number {
  if (value === "large") {
    return 1;
  }

  if (value === "moderate") {
    return 0.66;
  }

  if (value === "light") {
    return 0.33;
  }

  return 0;
}

function cueSuppressionReason(
  event: NativePhoneRuntimeEvent,
): CueSuppressionReason {
  if (event.eventType === "cue_failed") {
    return "none";
  }

  const reason = stringPayload(event.payload, "reason");

  if (
    reason === "movement" ||
    reason === "cue_associated_movement" ||
    reason === "outside_cue_window" ||
    reason === "session_not_active"
  ) {
    return reason;
  }

  return "none";
}

export function summarizePhoneRuntimeEvents(
  events: NativePhoneRuntimeEvent[],
): PhoneRuntimeLogSummary {
  return {
    cuesPlayed: events.filter((event) => event.eventType === "cue_played").length,
    cueFailures: events.filter((event) => event.eventType === "cue_failed").length,
    motionSummaries: events.filter(
      (event) => event.eventType === "motion_summary",
    ).length,
    movementPauses: events.filter(
      (event) => event.eventType === "movement_pause_started",
    ).length,
    interruptions: events.filter(
      (event) =>
        event.eventType === "interruption_started" ||
        event.eventType === "interruption_ended",
    ).length,
    stopped: events.some((event) => event.eventType === "runtime_stopped"),
    completed: events.some(
      (event) =>
        event.eventType === "runtime_stopped" &&
        event.payload.reason === "completed",
    ),
    errored: events.some(
      (event) =>
        event.eventType === "runtime_error" ||
        event.eventType === "audio_bed_failed" ||
        (event.eventType === "runtime_stopped" &&
          event.payload.reason === "error"),
    ),
  };
}

export function latestPhoneRuntimeStopTimestamp(
  events: NativePhoneRuntimeEvent[],
): string | null {
  const stopEvent = [...events]
    .reverse()
    .find((event) => event.eventType === "runtime_stopped");

  if (!stopEvent) {
    return null;
  }

  return stringPayload(stopEvent.payload, "stoppedAt") ?? stopEvent.timestamp;
}

export function mapPhoneRuntimeCueEvents(
  events: NativePhoneRuntimeEvent[],
): PhoneRuntimeCueRecordDraft[] {
  return events.flatMap((event) => {
    if (event.eventType !== "cue_played" && event.eventType !== "cue_failed") {
      return [];
    }

    return [
      {
        id: `native-${event.id}`,
        sessionId: event.sessionId,
        timestamp: event.timestamp,
        cueId:
          stringPayload(event.payload, "cueId") ??
          stringPayload(event.payload, "cueAsset") ??
          "unknown",
        volumeLevel: numberPayload(event.payload, "volume") ?? 0,
        played: event.eventType === "cue_played",
        suppressionReason: cueSuppressionReason(event),
      },
    ];
  });
}

export function mapPhoneRuntimeMovementEvents(
  events: NativePhoneRuntimeEvent[],
): PhoneRuntimeMovementRecordDraft[] {
  return events.flatMap((event) => {
    if (
      event.eventType !== "movement_pause_started" &&
      event.eventType !== "movement_pause_ended" &&
      event.eventType !== "cue_associated_movement"
    ) {
      return [];
    }

    const intensity =
      numberPayload(event.payload, "movementIntensity") ??
      movementIntensityScore(stringPayload(event.payload, "roughMovementIntensity"));
    const pauseStartedAt =
      event.eventType === "movement_pause_started" ? event.timestamp : undefined;
    const pauseEndedAt =
      event.eventType === "movement_pause_ended" ? event.timestamp : undefined;

    return [
      {
        id: `native-${event.id}`,
        sessionId: event.sessionId,
        timestamp: event.timestamp,
        intensity,
        wasCueAssociated: event.eventType === "cue_associated_movement",
        pauseStartedAt,
        pauseEndedAt,
      },
    ];
  });
}
