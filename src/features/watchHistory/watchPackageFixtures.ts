import { createDefaultEngineSettings } from "@/src/engine";
import { createDefaultTlrOptions } from "@/src/features/tlrOptions/tlrOptions";
import {
  WATCH_PACKAGE_MANIFEST_SCHEMA_VERSION,
  buildWatchPackageId,
  sha256Hex,
  withWatchPackageManifestHash,
  type WatchPackageManifestV3,
  type WatchRuntimePlanV3,
} from "@/src/native/watchRuntime";
import { buildWatchRuntimePlan } from "@/src/native/watchRuntime/buildWatchRuntimePlan";

import {
  WATCH_PACKAGE_COMMIT_FILE,
  WATCH_PACKAGE_CUE_EVENTS_FILE,
  WATCH_PACKAGE_EPOCHS_FILE,
  WATCH_PACKAGE_EVENTS_FILE,
  WATCH_PACKAGE_MOVEMENT_EVENTS_FILE,
  WATCH_PACKAGE_PLAN_FILE,
  WATCH_PACKAGE_RUNTIME_SUMMARY_FILE,
  type WatchCuePackageRecordV3,
  type WatchEpochPackageRecordV3,
  type WatchMovementPackageRecordV3,
  type WatchPackageFilePayloadV3,
  type WatchRuntimeEventPackageRecordV3,
  type WatchSealedPackageV3,
  type WatchSessionCommitPackageRecordV3,
} from "./watchPackageImportTypes";
import {
  buildWatchPackageFileEntry,
  encodeWatchPackageJson,
  encodeWatchPackageJsonl,
} from "./validateWatchPackageManifest";

const FIXTURE_START = "2026-06-07T04:00:00.000Z";
const FIXTURE_IMPORTED_AT = "2026-06-07T12:15:00.000Z";

function addSeconds(iso: string, seconds: number): string {
  return new Date(Date.parse(iso) + seconds * 1000).toISOString();
}

function eventBuilder(sessionId: string) {
  let previousRecordHash = "watch-runtime-v3-fixture-genesis";
  let sequenceNumber = 1;

  return (
    eventType: string,
    timestamp: string,
    payload: Record<string, unknown> = {},
  ): WatchRuntimeEventPackageRecordV3 => {
    const recordHash = sha256Hex(
      `${previousRecordHash}|${sequenceNumber}|${eventType}|${timestamp}`,
    );
    const event: WatchRuntimeEventPackageRecordV3 = {
      sessionId,
      sequenceNumber,
      eventId: `watch-event-v3-${sessionId}-${sequenceNumber}`,
      timestamp,
      monotonicOffsetSeconds: sequenceNumber * 30,
      eventType,
      payload,
      previousRecordHash,
      recordHash,
    };

    previousRecordHash = recordHash;
    sequenceNumber += 1;

    return event;
  };
}

function packagePlan(sessionType: "tlr" | "sleep_log"): WatchRuntimePlanV3 {
  return buildWatchRuntimePlan({
    sessionId:
      sessionType === "tlr"
        ? "watch-import-fixture-tlr"
        : "watch-import-fixture-sleep-log",
    participantId: "participant-watch-import-fixture",
    sessionType,
    createdAt: FIXTURE_START,
    selectedCueId: "harp-flourish",
    tlrOptions: createDefaultTlrOptions(),
    engineSettings: createDefaultEngineSettings(),
  });
}

function epochRecord(input: {
  event: WatchRuntimeEventPackageRecordV3;
  epochSequenceNumber: number;
  remLabel: WatchEpochPackageRecordV3["remLabel"];
  cueDecisionReason: string;
}): WatchEpochPackageRecordV3 {
  const epochStart = addSeconds(FIXTURE_START, (input.epochSequenceNumber - 1) * 30);
  const epochEnd = addSeconds(epochStart, 30);

  return {
    schemaVersion: "watch-epoch-record-v3",
    sessionId: input.event.sessionId,
    sequenceNumber: input.event.sequenceNumber,
    eventId: input.event.eventId,
    timestamp: input.event.timestamp,
    monotonicOffsetSeconds: input.event.monotonicOffsetSeconds,
    epochSequenceNumber: input.epochSequenceNumber,
    epochStart,
    epochEnd,
    elapsedSessionSeconds: input.epochSequenceNumber * 30,
    heartRateSampleCount: 14,
    motionSampleCount: 30,
    heartRateSummary: 62 + input.epochSequenceNumber,
    motionSummary: 0.08,
    sensorQuality: "good",
    remProbability: input.remLabel === "likely_rem" ? 0.78 : 0.31,
    sleepProbability: 0.87,
    remLabel: input.remLabel,
    classifierVersion: "lucidtlr-rem-probability-v3-contract",
    modelVersion: "lucidtlr-watch-rem-informed-v3-contract-2026-06-07",
    movementState: "stable_low_movement",
    stableLowMovementSeconds: input.epochSequenceNumber * 30,
    roughMovementIntensity: 0.1,
    cueDecisionReason: input.cueDecisionReason,
    batteryLevel: 0.82,
    previousRecordHash: input.event.previousRecordHash,
    recordHash: sha256Hex(`epoch|${input.event.recordHash}`),
  };
}

function cueRecord(
  event: WatchRuntimeEventPackageRecordV3,
  cueId: string,
): WatchCuePackageRecordV3 {
  return {
    schemaVersion: "watch-cue-record-v3",
    sessionId: event.sessionId,
    sequenceNumber: event.sequenceNumber,
    eventId: event.eventId,
    timestamp: event.timestamp,
    monotonicOffsetSeconds: event.monotonicOffsetSeconds,
    cueId,
    outputChannel: "haptic",
    decisionReason: "rem_persistence_passed",
    attempted: true,
    delivered: true,
    failureReason: null,
    previousRecordHash: event.previousRecordHash,
    recordHash: sha256Hex(`cue|${event.recordHash}`),
  };
}

function movementRecord(
  event: WatchRuntimeEventPackageRecordV3,
): WatchMovementPackageRecordV3 {
  return {
    schemaVersion: "watch-movement-record-v3",
    sessionId: event.sessionId,
    sequenceNumber: event.sequenceNumber,
    eventId: event.eventId,
    timestamp: event.timestamp,
    monotonicOffsetSeconds: event.monotonicOffsetSeconds,
    intensity: 2.4,
    movementState: "cue_associated_movement_pause",
    largeMovement: true,
    cueAssociated: true,
    pauseStartedAt: event.timestamp,
    pauseEndedAt: addSeconds(event.timestamp, 300),
    previousRecordHash: event.previousRecordHash,
    recordHash: sha256Hex(`movement|${event.recordHash}`),
  };
}

function buildPackage(input: {
  plan: WatchRuntimePlanV3;
  events: WatchRuntimeEventPackageRecordV3[];
  epochs: WatchEpochPackageRecordV3[];
  cueEvents: WatchCuePackageRecordV3[];
  movementEvents: WatchMovementPackageRecordV3[];
}): WatchSealedPackageV3 {
  const runtimeSummary = {
    startedAt: FIXTURE_START,
    endedAt: addSeconds(FIXTURE_START, 600),
    durationSeconds: 600,
    sealReason: "completed" as const,
    batteryStart: 0.86,
    batteryEnd: 0.81,
    missingEpochCount: 0,
    sensorQualitySummary: "good" as const,
    cuesAttempted: input.cueEvents.filter((cue) => cue.attempted).length,
    cuesDelivered: input.cueEvents.filter((cue) => cue.delivered).length,
    cueFailures: input.cueEvents.filter(
      (cue) => cue.attempted && !cue.delivered,
    ).length,
    movementPauses: input.movementEvents.length,
  };
  const commit: WatchSessionCommitPackageRecordV3 = {
    schemaVersion: "watch-session-commit-v3",
    sessionId: input.plan.sessionId,
    planHash: input.plan.planHash,
    committedAt: input.plan.createdAt,
    commitId: `watch-commit-v3-${sha256Hex(input.plan.planHash).slice(0, 24)}`,
  };
  const files: WatchPackageFilePayloadV3[] = [
    {
      relativePath: WATCH_PACKAGE_PLAN_FILE,
      contents: encodeWatchPackageJson(input.plan),
    },
    {
      relativePath: WATCH_PACKAGE_COMMIT_FILE,
      contents: encodeWatchPackageJson(commit),
    },
    {
      relativePath: WATCH_PACKAGE_EVENTS_FILE,
      contents: encodeWatchPackageJsonl(input.events),
    },
    {
      relativePath: WATCH_PACKAGE_EPOCHS_FILE,
      contents: encodeWatchPackageJsonl(input.epochs),
    },
    {
      relativePath: WATCH_PACKAGE_CUE_EVENTS_FILE,
      contents: encodeWatchPackageJsonl(input.cueEvents),
    },
    {
      relativePath: WATCH_PACKAGE_MOVEMENT_EVENTS_FILE,
      contents: encodeWatchPackageJsonl(input.movementEvents),
    },
    {
      relativePath: WATCH_PACKAGE_RUNTIME_SUMMARY_FILE,
      contents: encodeWatchPackageJson(runtimeSummary),
    },
  ];
  const firstSequenceNumber = input.events[0]?.sequenceNumber ?? 1;
  const lastSequenceNumber =
    input.events.at(-1)?.sequenceNumber ?? firstSequenceNumber;
  const manifestBase = {
    schemaVersion: WATCH_PACKAGE_MANIFEST_SCHEMA_VERSION,
    packageId: buildWatchPackageId({
      sessionId: input.plan.sessionId,
      planHash: input.plan.planHash,
      firstSequenceNumber,
      lastSequenceNumber,
    }),
    sessionId: input.plan.sessionId,
    planHash: input.plan.planHash,
    sealedAt: runtimeSummary.endedAt,
    sealReason: runtimeSummary.sealReason,
    startReceiptId: `synthetic-start-receipt-${input.plan.sessionId}`,
    firstSequenceNumber,
    lastSequenceNumber,
    eventCount: input.events.length,
    epochCount: input.epochs.length,
    cueEventCount: input.cueEvents.length,
    movementEventCount: input.movementEvents.length,
    files: files.map(buildWatchPackageFileEntry),
    runtimeSummary,
    importStatus: "sealed_waiting_for_phone" as const,
  } satisfies Omit<WatchPackageManifestV3, "packageHash">;

  return {
    manifest: withWatchPackageManifestHash(manifestBase),
    files,
  };
}

export function buildSyntheticTlrWatchPackageFixture(): WatchSealedPackageV3 {
  const plan = packagePlan("tlr");
  const nextEvent = eventBuilder(plan.sessionId);
  const events = [
    nextEvent("runtime_plan_committed", FIXTURE_START),
    nextEvent("runtime_started", addSeconds(FIXTURE_START, 5)),
    nextEvent("training_started", addSeconds(FIXTURE_START, 10)),
    nextEvent("training_completed", addSeconds(FIXTURE_START, 70)),
    nextEvent("tlr_interval_started", addSeconds(FIXTURE_START, 300)),
    nextEvent("epoch_processed", addSeconds(FIXTURE_START, 330)),
    nextEvent("epoch_processed", addSeconds(FIXTURE_START, 360)),
    nextEvent("cue_decision", addSeconds(FIXTURE_START, 365), {
      reason: "rem_persistence_passed",
    }),
    nextEvent("cue_play_attempted", addSeconds(FIXTURE_START, 366)),
    nextEvent("cue_played", addSeconds(FIXTURE_START, 367)),
    nextEvent("cue_associated_movement_pause_started", addSeconds(FIXTURE_START, 370)),
    nextEvent("runtime_stopped", addSeconds(FIXTURE_START, 600), {
      reason: "completed",
    }),
  ];

  return buildPackage({
    plan,
    events,
    epochs: [
      epochRecord({
        event: events[5],
        epochSequenceNumber: 1,
        remLabel: "not_likely_rem",
        cueDecisionReason: "rem_persistence_not_met",
      }),
      epochRecord({
        event: events[6],
        epochSequenceNumber: 2,
        remLabel: "likely_rem",
        cueDecisionReason: "rem_persistence_passed",
      }),
    ],
    cueEvents: [cueRecord(events[9], plan.selectedCueId)],
    movementEvents: [movementRecord(events[10])],
  });
}

export function buildSyntheticSleepLogWatchPackageFixture(): WatchSealedPackageV3 {
  const plan = packagePlan("sleep_log");
  const nextEvent = eventBuilder(plan.sessionId);
  const events = [
    nextEvent("runtime_plan_committed", FIXTURE_START),
    nextEvent("runtime_started", addSeconds(FIXTURE_START, 5)),
    nextEvent("log_only_started", addSeconds(FIXTURE_START, 10)),
    nextEvent("epoch_processed", addSeconds(FIXTURE_START, 30)),
    nextEvent("epoch_processed", addSeconds(FIXTURE_START, 60)),
    nextEvent("runtime_stopped", addSeconds(FIXTURE_START, 600), {
      reason: "completed",
    }),
  ];

  return buildPackage({
    plan,
    events,
    epochs: [
      epochRecord({
        event: events[3],
        epochSequenceNumber: 1,
        remLabel: "unknown",
        cueDecisionReason: "sleep_log_cueing_disabled",
      }),
      epochRecord({
        event: events[4],
        epochSequenceNumber: 2,
        remLabel: "unknown",
        cueDecisionReason: "sleep_log_cueing_disabled",
      }),
    ],
    cueEvents: [],
    movementEvents: [],
  });
}

export const WATCH_PACKAGE_FIXTURE_IMPORTED_AT = FIXTURE_IMPORTED_AT;
