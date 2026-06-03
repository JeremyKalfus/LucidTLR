import type {
  CueDecisionAction,
  CueDecisionReason,
  WatchConnectivityState,
} from "@/src/domain/types";

import type { WatchRemLabel } from "@/src/engine/watchRem";

export type WatchCueMode =
  | "none"
  | "haptic_only"
  | "audio_only"
  | "audio_haptic";

export type WatchCueDeliveryDevice = "phone" | "watch";

export type WatchSessionRuntimeOwner = "phone" | "watch";

export type WatchSessionPlanProtocol = "watch-session-plan-v2";

export type WatchSessionTerminalReason =
  | "completed_stop_at"
  | "manual_stop"
  | "battery_stop"
  | "sensor_failure"
  | "workout_failure"
  | "plan_expired"
  | "asset_missing"
  | "model_missing"
  | "app_lifecycle_failure"
  | "unknown_failure";

export type WatchPrivacyLoggingMode =
  | "summary_only"
  | "research_raw_opt_in";

export interface WatchBatteryPolicy {
  recommendedStartBatteryPct: number;
  allowStartBelowPct: number;
  requireOverrideBelowPct: number;
  disableCueingBelowPct: number;
  stopRuntimeBelowPct: number;
  hardStopBelowPct: number;
}

export interface WatchCueAssetManifest {
  cueAssetId: string;
  fileName: string;
  sha256?: string;
  durationMs?: number;
  volumeHint?: number;
}

export interface WatchRemModelManifest {
  modelId: string;
  version: string;
  checksum?: string;
  threshold: number;
  featureConfigVersion: string;
}

export interface WatchMovementGateConfigV2 {
  stableLowMovementRequiredSeconds: number;
  cueAssociatedMovementWindowSeconds: number;
  cueAssociatedMovementPauseSeconds: number;
}

export interface WatchOwnedSessionPlanV2 {
  protocol: WatchSessionPlanProtocol;
  sessionId: string;
  createdAt: string;
  validAfter?: string;
  expiresAt: string;
  trainingCompletedAt?: string;
  estimatedSleepStartAt?: string;
  earliestCueAt: string;
  stopAt: string;
  runtimeOwner: "watch";
  cueMode: WatchCueMode;
  cueBudget: number;
  minInterCueIntervalSec: number;
  suppressCueFromConsecutiveLikelyRemEpoch: number;
  epochDurationSec: number;
  accelerometerHz: number;
  movementGateConfig: WatchMovementGateConfigV2;
  batteryPolicy: WatchBatteryPolicy;
  lowPowerModePolicy: "warn_degraded" | "block" | "allow";
  cueAssetManifest?: WatchCueAssetManifest;
  remModelManifest: WatchRemModelManifest;
  privacyLoggingMode: WatchPrivacyLoggingMode;
}

export interface WatchEpochLogV2 {
  protocol: "watch-epoch-v2";
  sessionId: string;
  watchSessionId?: string;
  epochIndex: number;
  startedAt: string;
  endedAt: string;
  elapsedSec: number;
  heartRateMeanBpm?: number;
  heartRateMinBpm?: number;
  heartRateMaxBpm?: number;
  heartRateSampleCount: number;
  heartRateMissing: boolean;
  accelSampleCount: number;
  accelMissing: boolean;
  motionMean?: number;
  motionMax?: number;
  movementGateTriggered: boolean;
  batteryPct?: number;
  lowPowerModeEnabled?: boolean;
  remProbability?: number;
  modelVersion?: string;
  remLabel?: WatchRemLabel;
  likelyRem: boolean;
  consecutiveLikelyRemEpochs: number;
  cueDecisionAction: CueDecisionAction;
  cueDecisionReason: CueDecisionReason | "classifier_unavailable" | "battery_cue_disabled";
}

export interface WatchCueDeliveryLogV2 {
  protocol: "watch-cue-delivery-v2";
  id?: string;
  sessionId: string;
  epochIndex: number;
  requestedAt: string;
  cueMode: WatchCueMode;
  cueId?: string;
  deliveryDevice: "watch";
  hapticRequested: boolean;
  audioRequested: boolean;
  succeeded: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export interface WatchSessionSummaryLogV2 {
  protocol: "watch-session-summary-v2";
  sessionId: string;
  startedAt: string;
  stoppedAt?: string;
  stopReason?: WatchSessionTerminalReason;
  epochCount: number;
  validEpochCount: number;
  cueCount: number;
  batteryStartPct?: number;
  batteryEndPct?: number;
  modelVersion?: string;
  syncStatus: "local_only" | "queued" | "imported_on_phone" | "acked";
}

export interface WatchOwnedStatusV2 {
  protocol: "watch-owned-status-v2";
  available: boolean;
  preparedSessionId?: string;
  sessionId?: string;
  runtimeOwner: "watch";
  state:
    | "no_plan"
    | "start_sync_waiting"
    | "ready"
    | "starting"
    | "running"
    | "cue_window_pending"
    | "cueing_enabled"
    | "cueing_disabled_low_battery"
    | "waiting_for_phone_sync"
    | "sync_pending"
    | "completed"
    | "failed";
  reason?: string;
  watchReachable?: boolean;
  connectivityState?: WatchConnectivityState;
  batteryPct?: number;
  lowPowerModeEnabled?: boolean;
  healthAuthorizationStatus?: "unknown" | "authorized" | "denied" | "unavailable";
  isRunning?: boolean;
  modelAvailable?: boolean;
  classifierVersion?: string;
  stopAt?: string;
  cueMode?: WatchCueMode;
  latestEpochAt?: string;
  latestRemProbability?: number;
  syncPending?: boolean;
}

export interface WatchOwnedImportPayloadV2 {
  sessionId: string;
  epochs: WatchEpochLogV2[];
  cueDeliveries: WatchCueDeliveryLogV2[];
  summary?: WatchSessionSummaryLogV2;
}

export const DEFAULT_WATCH_BATTERY_POLICY: WatchBatteryPolicy = {
  recommendedStartBatteryPct: 90,
  allowStartBelowPct: 70,
  requireOverrideBelowPct: 60,
  disableCueingBelowPct: 25,
  stopRuntimeBelowPct: 20,
  hardStopBelowPct: 12,
};
