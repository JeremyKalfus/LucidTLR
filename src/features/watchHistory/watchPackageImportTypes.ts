import type {
  CueSuppressionReason,
  NightSession,
  WatchSensorQuality,
} from "@/src/domain/types";
import type {
  WatchPackageManifestV3,
  WatchPackageRuntimeSummaryV3,
  WatchRuntimePlanV3,
} from "@/src/native/watchRuntime";

export const WATCH_PACKAGE_PLAN_FILE = "plan.json";
export const WATCH_PACKAGE_COMMIT_FILE = "commit.json";
export const WATCH_PACKAGE_EVENTS_FILE = "events.jsonl";
export const WATCH_PACKAGE_EPOCHS_FILE = "epochs.jsonl";
export const WATCH_PACKAGE_CUE_EVENTS_FILE = "cue_events.jsonl";
export const WATCH_PACKAGE_MOVEMENT_EVENTS_FILE = "movement_events.jsonl";
export const WATCH_PACKAGE_RUNTIME_SUMMARY_FILE = "runtime_summary.json";

export const REQUIRED_WATCH_PACKAGE_FILES = [
  WATCH_PACKAGE_PLAN_FILE,
  WATCH_PACKAGE_COMMIT_FILE,
  WATCH_PACKAGE_EVENTS_FILE,
  WATCH_PACKAGE_EPOCHS_FILE,
  WATCH_PACKAGE_CUE_EVENTS_FILE,
  WATCH_PACKAGE_MOVEMENT_EVENTS_FILE,
  WATCH_PACKAGE_RUNTIME_SUMMARY_FILE,
] as const;

export type WatchPackageRequiredFile =
  (typeof REQUIRED_WATCH_PACKAGE_FILES)[number];

export interface WatchPackageFilePayloadV3 {
  relativePath: string;
  contents: string;
}

export interface WatchSealedPackageV3 {
  manifest: WatchPackageManifestV3;
  files: WatchPackageFilePayloadV3[];
}

export interface WatchSessionCommitPackageRecordV3 {
  schemaVersion: "watch-session-commit-v3";
  sessionId: string;
  planHash: string;
  committedAt: string;
  commitId: string;
}

export interface WatchRuntimeEventPackageRecordV3 {
  sessionId: string;
  sequenceNumber: number;
  eventId: string;
  timestamp: string;
  monotonicOffsetSeconds?: number | null;
  eventType: string;
  payload: Record<string, unknown>;
  previousRecordHash: string;
  recordHash: string;
}

export interface WatchEpochPackageRecordV3 {
  schemaVersion: "watch-epoch-record-v3";
  sessionId: string;
  sequenceNumber: number;
  eventId: string;
  timestamp: string;
  monotonicOffsetSeconds?: number | null;
  epochSequenceNumber: number;
  epochStart: string;
  epochEnd: string;
  elapsedSessionSeconds: number;
  heartRateSampleCount: number;
  motionSampleCount: number;
  heartRateSummary?: number | null;
  motionSummary?: number | null;
  sensorQuality: WatchSensorQuality;
  remProbability?: number | null;
  sleepProbability?: number | null;
  remLabel: "likely_rem" | "unlikely_rem" | "not_likely_rem" | "unknown";
  classifierVersion: string;
  modelVersion: string;
  movementState: string;
  stableLowMovementSeconds: number;
  roughMovementIntensity: number;
  cueDecisionReason: string;
  batteryLevel?: number | null;
  previousRecordHash: string;
  recordHash: string;
}

export interface WatchCuePackageRecordV3 {
  schemaVersion: "watch-cue-record-v3";
  sessionId: string;
  sequenceNumber: number;
  eventId: string;
  timestamp: string;
  monotonicOffsetSeconds?: number | null;
  cueId: string;
  outputChannel: "haptic" | "audio" | "none";
  decisionReason: string;
  attempted: boolean;
  delivered: boolean;
  failureReason?: string | null;
  previousRecordHash: string;
  recordHash: string;
}

export interface WatchMovementPackageRecordV3 {
  schemaVersion: "watch-movement-record-v3";
  sessionId: string;
  sequenceNumber: number;
  eventId: string;
  timestamp: string;
  monotonicOffsetSeconds?: number | null;
  intensity: number;
  movementState: string;
  largeMovement: boolean;
  cueAssociated: boolean;
  pauseStartedAt?: string | null;
  pauseEndedAt?: string | null;
  previousRecordHash: string;
  recordHash: string;
}

export interface DecodedWatchPackageV3 {
  manifest: WatchPackageManifestV3;
  plan: WatchRuntimePlanV3;
  commit: WatchSessionCommitPackageRecordV3;
  runtimeSummary: WatchPackageRuntimeSummaryV3;
  events: WatchRuntimeEventPackageRecordV3[];
  epochs: WatchEpochPackageRecordV3[];
  cueEvents: WatchCuePackageRecordV3[];
  movementEvents: WatchMovementPackageRecordV3[];
}

export type WatchPackageImportResultStatus = "imported" | "already_imported";

export interface WatchPackageImportResult {
  status: WatchPackageImportResultStatus;
  packageId: string;
  sessionId: string;
  packageHash: string;
  importedAt: string;
  counts: {
    events: number;
    epochs: number;
    cueEvents: number;
    movementEvents: number;
  };
}

export interface WatchPackageImportInput {
  db: import("@/src/data/local/localDb").LocalDb;
  sealedPackage: WatchSealedPackageV3;
  importedAt: string;
}

export type WatchPackageCueSuppressionReason = CueSuppressionReason;
export type WatchPackageImportedSession = NightSession;
