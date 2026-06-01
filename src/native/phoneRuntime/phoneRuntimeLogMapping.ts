import type {
  CueSuppressionReason,
  PhoneNightCalibrationNight,
} from "@/src/domain/types";

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

function firstEventTimestamp(
  events: NativePhoneRuntimeEvent[],
  eventType: NativePhoneRuntimeEvent["eventType"],
): string | null {
  return events.find((event) => event.eventType === eventType)?.timestamp ?? null;
}

function isQuietMotion(event: NativePhoneRuntimeEvent): boolean {
  const roughMovementIntensity = stringPayload(
    event.payload,
    "roughMovementIntensity",
  );

  return roughMovementIntensity === "still" || roughMovementIntensity === "light";
}

function isLargeMotion(event: NativePhoneRuntimeEvent): boolean {
  return stringPayload(event.payload, "roughMovementIntensity") === "large";
}

function stableQuietStart(input: {
  motionSummaries: NativePhoneRuntimeEvent[];
  trainingEndedAt: string;
  requiredConsecutiveSummaries: number;
}): string | null {
  let streakStart: string | null = null;
  let streakCount = 0;
  const trainingEndMs = Date.parse(input.trainingEndedAt);

  for (const event of input.motionSummaries) {
    if (Date.parse(event.timestamp) < trainingEndMs) {
      continue;
    }

    if (isQuietMotion(event)) {
      streakStart = streakStart ?? event.timestamp;
      streakCount += 1;

      if (streakCount >= input.requiredConsecutiveSummaries) {
        return streakStart;
      }
    } else {
      streakStart = null;
      streakCount = 0;
    }
  }

  return null;
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

const nonTerminalRuntimeStopReasons = new Set(["replaced_by_new_session"]);

const terminalRuntimeStopReasons = new Set([
  "completed",
  "user_stopped",
  "alarm_auto_shutoff",
  "app_terminated",
  "bridge_invalidated",
  "error",
]);

function runtimeStopReason(event: NativePhoneRuntimeEvent): string | undefined {
  return stringPayload(event.payload, "reason");
}

function isTerminalRuntimeStop(event: NativePhoneRuntimeEvent): boolean {
  if (event.eventType !== "runtime_stopped") {
    return false;
  }

  const reason = runtimeStopReason(event);

  if (!reason) {
    return true;
  }

  return (
    terminalRuntimeStopReasons.has(reason) ||
    !nonTerminalRuntimeStopReasons.has(reason)
  );
}

function latestTerminalRuntimeStopEvent(
  events: NativePhoneRuntimeEvent[],
): NativePhoneRuntimeEvent | null {
  let latestTerminalStop: NativePhoneRuntimeEvent | null = null;

  for (const event of events) {
    if (event.eventType === "runtime_started") {
      latestTerminalStop = null;
      continue;
    }

    if (event.eventType === "runtime_stopped") {
      latestTerminalStop = isTerminalRuntimeStop(event) ? event : null;
    }
  }

  return latestTerminalStop;
}

export function summarizePhoneRuntimeEvents(
  events: NativePhoneRuntimeEvent[],
): PhoneRuntimeLogSummary {
  const latestTerminalStop = latestTerminalRuntimeStopEvent(events);
  const latestTerminalStopReason = latestTerminalStop
    ? runtimeStopReason(latestTerminalStop)
    : undefined;

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
    stopped: latestTerminalStop !== null,
    completed: latestTerminalStopReason === "completed",
    errored: events.some(
      (event) =>
        event.eventType === "runtime_error" ||
        event.eventType === "audio_bed_failed" ||
        (event === latestTerminalStop && latestTerminalStopReason === "error"),
    ),
  };
}

export function latestPhoneRuntimeStopTimestamp(
  events: NativePhoneRuntimeEvent[],
): string | null {
  const stopEvent = latestTerminalRuntimeStopEvent(events);

  if (!stopEvent) {
    return null;
  }

  return stringPayload(stopEvent.payload, "stoppedAt") ?? stopEvent.timestamp;
}

export function latestPhoneTrainingCompletedTimestamp(
  events: NativePhoneRuntimeEvent[],
): string | null {
  const trainingCompletedEvent = [...events]
    .reverse()
    .find((event) => event.eventType === "training_completed");

  if (!trainingCompletedEvent) {
    return null;
  }

  return (
    stringPayload(trainingCompletedEvent.payload, "actualTrainingEndedAt") ??
    trainingCompletedEvent.timestamp
  );
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

export function buildPhoneNightCalibrationNightFromRuntimeLogs(
  events: NativePhoneRuntimeEvent[],
): PhoneNightCalibrationNight | null {
  if (events.length === 0) {
    return null;
  }

  const sessionId = events[0].sessionId;
  const trainingEndedAt = latestPhoneTrainingCompletedTimestamp(events);
  const runtimeStartedAt = firstEventTimestamp(events, "runtime_started");
  const runtimeStoppedAt = latestPhoneRuntimeStopTimestamp(events);

  if (!trainingEndedAt || !runtimeStoppedAt) {
    return null;
  }

  const trainingEndMs = Date.parse(trainingEndedAt);
  const runtimeStopMs = Date.parse(runtimeStoppedAt);

  if (!Number.isFinite(trainingEndMs) || runtimeStopMs <= trainingEndMs) {
    return null;
  }

  const motionSummaries = events.filter(
    (event) => event.eventType === "motion_summary",
  );
  const runtimeMotionSummaries = motionSummaries.filter(
    (event) => Date.parse(event.timestamp) >= trainingEndMs,
  );
  const quietMotionCount = runtimeMotionSummaries.filter(isQuietMotion).length;
  const quietStart = stableQuietStart({
    motionSummaries,
    trainingEndedAt,
    requiredConsecutiveSummaries: 12,
  });
  const summary = summarizePhoneRuntimeEvents(events);
  const cueCount = events.filter((event) => event.eventType === "cue_played").length;
  const cueBudgetExhausted = events.some(
    (event) =>
      event.eventType === "budget_exhausted" ||
      (event.eventType === "cue_suppressed" &&
        stringPayload(event.payload, "reason") === "cue_budget_exhausted"),
  );

  return {
    sessionId,
    generatedAt: new Date().toISOString(),
    trainingEndedAt,
    runtimeStartedAt: runtimeStartedAt ?? undefined,
    runtimeStoppedAt,
    runtimeDurationMinutes: (runtimeStopMs - trainingEndMs) / 60000,
    observedEndMinutesAfterTraining: (runtimeStopMs - trainingEndMs) / 60000,
    quietStartMinutesAfterTraining: quietStart
      ? (Date.parse(quietStart) - trainingEndMs) / 60000
      : undefined,
    quietRuntimeRatio:
      runtimeMotionSummaries.length > 0
        ? quietMotionCount / runtimeMotionSummaries.length
        : undefined,
    cueCount,
    cueFailures: summary.cueFailures,
    cueBudgetExhausted,
    movementPauseCount: summary.movementPauses,
    largeMovementCount: runtimeMotionSummaries.filter(isLargeMotion).length,
    interrupted: summary.interruptions > 0,
    errored: summary.errored,
  };
}
