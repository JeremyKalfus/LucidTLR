import type { SessionType } from "@/src/domain/types";

export const WATCH_RUNTIME_PLAN_SCHEMA_VERSION = "watch-runtime-plan-v3";
export const WATCH_POLICY_VERSION =
  "watch-policy-v3-workout-backed-2026-06-07";
export const WATCH_REM_MODEL_ID = "lucidtlr-watch-rem-informed-v3";
export const WATCH_REM_MODEL_VERSION = "lucidtlr-rem-v0-2026-06";
export const WATCH_REM_CLASSIFIER_VERSION = "lucidtlr-rem-v0-2026-06";

export type WatchRuntimePlanSchemaVersion =
  typeof WATCH_RUNTIME_PLAN_SCHEMA_VERSION;
export type WatchRuntimeMode = "watch";
export type WatchRuntimeSessionType = Extract<SessionType, "tlr" | "sleep_log">;
export type WatchRuntimeAssetKind = "cue" | "training" | "model";
export type WatchRuntimeAssetOwner = "watch" | "phone";
export type WatchRuntimeResourceExtension = "mp3" | "wav" | "json";

export interface WatchRuntimeAssetV3 {
  id: string;
  kind: WatchRuntimeAssetKind;
  owner: WatchRuntimeAssetOwner;
  fileName: string;
  resourceName: string;
  resourceExtension: WatchRuntimeResourceExtension;
  sha256: string;
  byteLength: number;
}

export interface WatchRuntimeCueV3 {
  cueId: string;
  assetId: string;
  resourceName: string;
  resourceExtension: "mp3" | "wav";
  durationSeconds: number;
  sha256: string;
}

export interface WatchRuntimeCueOutputV3 {
  hapticEnabled: boolean;
  audioEnabled: boolean;
  audioRequiresPreflight: boolean;
  preflightRequired: boolean;
  defaultOutput: "haptic";
}

export interface WatchRuntimeTrainingCueScheduleEntryV3 {
  markerIndex: number;
  markerMidpointSeconds: number;
  cueStartSeconds: number;
}

export interface WatchRuntimeTrainingV3 {
  enabled: boolean;
  skipped: boolean;
  audioResourceName: string;
  audioResourceExtension: "mp3";
  durationSeconds: number;
  cueSchedule: WatchRuntimeTrainingCueScheduleEntryV3[];
  sha256: string;
}

export interface WatchRuntimeTlrIntervalV3 {
  enabled: boolean;
  earliestCueAt: string;
  latestCueAt: string;
  derivedFrom:
    | "watch_training_completed_at_plus_protocol_delay"
    | "cue_delivery_disabled_sleep_log";
}

export interface WatchRuntimeEpochingV3 {
  epochSeconds: 30;
  motionSampleHz: number;
  rawMotionPersistence: false;
}

export interface WatchRuntimeRemPolicyV3 {
  classifierVersion: string;
  threshold: number;
  persistenceRule: "2_of_last_3";
  minimumSleepProbability: number;
  sensorQualityRequired: "good";
}

export interface WatchRuntimeMovementV3 {
  stableLowMovementRequiredSeconds: number;
  largeMovementThreshold: number;
  cueAssociatedMovementWindowSeconds: number;
  cueAssociatedMovementPauseSeconds: number;
  userInteractionSuppressionSeconds: number;
}

export interface WatchRuntimeBudgetV3 {
  maxCuesTonight: number;
  minimumSecondsSinceLastCue: number;
}

export interface WatchRuntimeSafetyV3 {
  requireWorkoutSession: true;
  requireHealthKitAuthorization: true;
  requireMotion: true;
  requireLowPowerModeOff: true;
  minimumStartBatteryLevel: number;
  lowBatteryWarningLevel: number;
  safeSealBatteryLevel: number;
  emergencyStopBatteryLevel: number;
}

export interface WatchRuntimeModelV3 {
  modelId: string;
  modelVersion: string;
  sha256?: string;
  evaluatorType: "deterministic-swift";
}

export interface WatchRuntimePrivacyV3 {
  noGps: true;
  noSensorKit: true;
  noLiveAppleSleepStages: true;
  noSpO2: true;
  noRespiratoryRate: true;
  noWristTemperature: true;
}

export interface WatchRuntimePlanV3 {
  schemaVersion: WatchRuntimePlanSchemaVersion;
  sessionId: string;
  participantId: string;
  sessionType: WatchRuntimeSessionType;
  mode: WatchRuntimeMode;
  createdAt: string;
  protocolVersion: string;
  watchPolicyVersion: string;
  remModelVersion: string;
  planHash: string;
  selectedCueId: string;
  cue: WatchRuntimeCueV3;
  cueOutput: WatchRuntimeCueOutputV3;
  training: WatchRuntimeTrainingV3;
  tlrInterval: WatchRuntimeTlrIntervalV3;
  epoching: WatchRuntimeEpochingV3;
  remPolicy: WatchRuntimeRemPolicyV3;
  movement: WatchRuntimeMovementV3;
  budget: WatchRuntimeBudgetV3;
  safety: WatchRuntimeSafetyV3;
  assets: WatchRuntimeAssetV3[];
  model: WatchRuntimeModelV3;
  privacy: WatchRuntimePrivacyV3;
}
