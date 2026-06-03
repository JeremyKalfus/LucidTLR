import type { CueDecisionReason, WatchSensorQuality } from "@/src/domain/types";

export const MALLELA_REM_THRESHOLD = 0.24;
export const MALLELA_MOTION_EMA_ALPHA = 0.9;
export const MALLELA_HR_EMA_ALPHA = 0.95;
export const MALLELA_RF_CLASSIFIER_VERSION = "mallela-rf-v1";
export const LUCIDCUE_WATCH_REM_CLASSIFIER_VERSION = "lucidcue-watch-rem-v1";
export const MALLELA_NO_MODEL_CLASSIFIER_VERSION =
  "mallela-feature-pipeline-no-model";
export const MALLELA_APPROX_FEATURE_VERSION = "mallela-approx-feature-dev";

export type WatchFeatureVersion =
  | "mallela-public-code-activity-counts"
  | typeof MALLELA_APPROX_FEATURE_VERSION;

export type WatchRemLabel = "likely_rem" | "not_likely_rem" | "unknown";

export type WatchStageProbabilities = {
  wake?: number;
  n1?: number;
  n2?: number;
  n3?: number;
  rem?: number;
  unknown?: number;
};

export type WatchMotionSample = {
  t: number;
  x: number;
  y: number;
  z: number;
};

export type MallelaFeatureState = {
  hrEma?: number;
  motionEma?: number;
};

export type MallelaFeatureExtractorInput = {
  heartRateSamples: number[];
  motionSamples: WatchMotionSample[];
  elapsedSessionSeconds: number;
  previousState?: MallelaFeatureState;
  hrEmaAlpha?: number;
  motionEmaAlpha?: number;
};

export type MallelaFeatureOutput = {
  avgHR?: number;
  hrSampleCount: number;
  hrEma?: number;
  hrFeature?: number;
  motionSampleCount: number;
  motionSummary?: number;
  motionFeature?: number;
  motionEma?: number;
  timeFeatureHours: number;
  elapsedSessionSeconds: number;
  sensorQuality: WatchSensorQuality;
  missingReasons: string[];
  featureVersion: WatchFeatureVersion;
  state: MallelaFeatureState;
};

export type WatchRemFeatureVector = {
  hrFeature?: number;
  motionFeature?: number;
  timeFeatureHours: number;
  featureVersion?: WatchFeatureVersion;
};

export type WatchRemPrediction = {
  classifierVersion: string;
  modelAvailable: boolean;
  epochStart: string;
  epochEnd: string;
  features: WatchRemFeatureVector;
  probabilities?: WatchStageProbabilities;
  remProbability?: number;
  sleepProbability?: number;
  remLabel: WatchRemLabel;
  threshold: number;
  reason: string;
};

export type WatchCuePolicyInput = {
  now: string;
  epochStart: string;
  epochEnd: string;
  prediction: WatchRemPrediction;
  sensorQuality: WatchSensorQuality;
  stableLowMovementSeconds: number;
  audioRuntimeActive: boolean;
  cueHistory: {
    lastCueAt?: string;
    cueCountTonight: number;
    cueAssociatedMovementPauseUntil?: string;
  };
  state: {
    consecutiveLikelyRemEpochs: number;
  };
  settings: {
    remThreshold: number;
    minimumSleepProbability?: number;
    stableLowMovementRequiredSeconds: number;
    minimumSecondsSinceLastCue: number;
    cueAssociatedMovementPauseSeconds: number;
    consecutiveLikelyRemSuppressionThreshold: number;
    maxCuesTonight: number;
    earliestCueAt?: string;
    stopAt?: string;
    batteryPct?: number;
    disableCueingBelowPct?: number;
  };
};

export type WatchCuePolicyDecision = {
  action: "play_cue" | "pause" | "suppress";
  reason: CueDecisionReason | "classifier_unavailable" | "audio_runtime_unavailable";
  shouldPlayCue: boolean;
  consecutiveLikelyRemEpochs: number;
  persistentRemSuppressionActive: boolean;
  nextCheckAt?: string;
};
