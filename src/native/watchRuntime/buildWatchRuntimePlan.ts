import { getBuiltInCue } from "@/src/audio/cueCatalog";
import {
  FINAL_LUCID_TRAINING_ASSET_ID,
  FINAL_LUCID_TRAINING_DURATION_SECONDS,
  FINAL_LUCID_TRAINING_NATIVE_RESOURCE_EXTENSION,
  FINAL_LUCID_TRAINING_NATIVE_RESOURCE_NAME,
  buildTrainingCueSchedule,
} from "@/src/audio/trainingAudio";
import type { NightSession, SessionType, TlrOptions } from "@/src/domain/types";
import type { CueDecisionSettings } from "@/src/engine";
import {
  TLR_PROTOCOL_VERSION,
  phoneCueing,
  watchCueing,
} from "@/src/protocol/tlrProtocol";

import {
  WATCH_POLICY_VERSION,
  WATCH_REM_CLASSIFIER_VERSION,
  WATCH_REM_MODEL_ID,
  WATCH_REM_MODEL_VERSION,
  WATCH_RUNTIME_PLAN_SCHEMA_VERSION,
  type WatchRuntimeAssetV3,
  type WatchRuntimePlanV3,
} from "./WatchRuntimePlan";
import {
  assertValidWatchRuntimePlan,
  withWatchRuntimePlanHash,
} from "./validateWatchRuntimePlan";

const CUE_ASSET_METADATA: Record<
  string,
  { sha256: string; byteLength: number }
> = {
  "clear-bell-chime": {
    sha256: "f996f645dd64c58df6e093ba482e38b75cba30d2cefeebe3e3e5ee9481728af5",
    byteLength: 63572,
  },
  "dx-harp-c5": {
    sha256: "0a72e17e6a040af83219a8a943bc7b164d09b162310003474e449746960d7c39",
    byteLength: 14018,
  },
  "harp-flourish": {
    sha256: "a4e2932b7e4e76a837b2c4d011dcba508c5f6d7d496698180bfa109a5c6749be",
    byteLength: 20588,
  },
  "sci-fi-confirmation": {
    sha256: "546fbe87d4aad178decc54e2ad501a37238057d922ec8ac7ad8f96ad543b0a01",
    byteLength: 154394,
  },
  "ui-success-chime": {
    sha256: "a1471d5517fe3a22cf154c1579e8ea2e59a43359c6a64d4f67b04124f41dd242",
    byteLength: 10701,
  },
};

const TRAINING_ASSET_METADATA = {
  sha256: "bd61ac279294513a2751f0836fee2240181f71ed407f1fdfa7af9992bf7af3f6",
  byteLength: 10068223,
} as const;

export interface BuildWatchRuntimePlanInput {
  sessionId: string;
  participantId: string;
  sessionType: SessionType;
  createdAt: string;
  selectedCueId: string;
  tlrOptions: Pick<
    TlrOptions,
    "watchAudioCueEnabled" | "skipGuidedTraining"
  >;
  engineSettings: Pick<
    CueDecisionSettings,
    | "cueStartDelayHoursAfterTraining"
    | "minimumSecondsSinceLastCue"
    | "userInteractionSuppressionSeconds"
    | "stableLowMovementRequiredSeconds"
    | "cueAssociatedMovementWindowSeconds"
    | "cueAssociatedMovementPauseSeconds"
    | "remThreshold"
    | "minimumWatchSleepProbability"
    | "maxCuesPerNight"
    | "typicalSleepDurationHours"
  >;
  protocolVersion?: string;
  allowExperimentalAudio?: boolean;
}

export interface BuildWatchRuntimePlanFromSessionInput
  extends Omit<
    BuildWatchRuntimePlanInput,
    "sessionId" | "participantId" | "sessionType" | "createdAt" | "selectedCueId"
  > {
  session: Pick<
    NightSession,
    "id" | "participantId" | "sessionType" | "startedAt" | "selectedCueId"
  >;
}

function addSeconds(iso: string, seconds: number): string {
  return new Date(Date.parse(iso) + seconds * 1000).toISOString();
}

function cueAsset(cueId: string): WatchRuntimeAssetV3 {
  const cue = getBuiltInCue(cueId);
  const metadata = CUE_ASSET_METADATA[cue.id];

  if (!metadata) {
    throw new Error(`Missing Watch runtime asset metadata for cue ${cue.id}.`);
  }

  return {
    id: cue.id,
    kind: "cue",
    owner: "watch",
    fileName: cue.sourceFileName,
    resourceName: cue.nativeResourceName,
    resourceExtension: cue.nativeResourceExtension,
    sha256: metadata.sha256,
    byteLength: metadata.byteLength,
  };
}

function trainingAsset(): WatchRuntimeAssetV3 {
  return {
    id: FINAL_LUCID_TRAINING_ASSET_ID,
    kind: "training",
    owner: "phone",
    fileName: "final-lucid-training.mp3",
    resourceName: FINAL_LUCID_TRAINING_NATIVE_RESOURCE_NAME,
    resourceExtension: FINAL_LUCID_TRAINING_NATIVE_RESOURCE_EXTENSION,
    sha256: TRAINING_ASSET_METADATA.sha256,
    byteLength: TRAINING_ASSET_METADATA.byteLength,
  };
}

export function buildWatchRuntimePlan(
  input: BuildWatchRuntimePlanInput,
): WatchRuntimePlanV3 {
  const cue = getBuiltInCue(input.selectedCueId);
  const cueAssetEntry = cueAsset(cue.id);
  const isTlr = input.sessionType === "tlr";
  const trainingEnabled = isTlr && !input.tlrOptions.skipGuidedTraining;
  const assets = trainingEnabled
    ? [cueAssetEntry, trainingAsset()]
    : [cueAssetEntry];
  const earliestCueAt = isTlr
    ? addSeconds(
        input.createdAt,
        Math.round(input.engineSettings.cueStartDelayHoursAfterTraining * 3600),
      )
    : input.createdAt;
  const latestCueAt = isTlr
    ? addSeconds(
        input.createdAt,
        Math.round(input.engineSettings.typicalSleepDurationHours * 3600),
      )
    : input.createdAt;
  const audioEnabled =
    isTlr &&
    input.allowExperimentalAudio === true &&
    input.tlrOptions.watchAudioCueEnabled === true;

  const plan = withWatchRuntimePlanHash({
    schemaVersion: WATCH_RUNTIME_PLAN_SCHEMA_VERSION,
    sessionId: input.sessionId,
    participantId: input.participantId,
    sessionType: input.sessionType,
    mode: "watch",
    createdAt: input.createdAt,
    protocolVersion: input.protocolVersion ?? TLR_PROTOCOL_VERSION,
    watchPolicyVersion: WATCH_POLICY_VERSION,
    remModelVersion: WATCH_REM_MODEL_VERSION,
    selectedCueId: cue.id,
    cue: {
      cueId: cue.id,
      assetId: cueAssetEntry.id,
      resourceName: cue.nativeResourceName,
      resourceExtension: cue.nativeResourceExtension,
      durationSeconds: cue.durationSeconds,
      sha256: cueAssetEntry.sha256,
    },
    cueOutput: {
      hapticEnabled: isTlr,
      audioEnabled,
      audioRequiresPreflight: true,
      preflightRequired: isTlr,
      defaultOutput: "haptic",
    },
    training: {
      enabled: trainingEnabled,
      skipped: isTlr ? input.tlrOptions.skipGuidedTraining : true,
      audioResourceName: trainingEnabled
        ? FINAL_LUCID_TRAINING_NATIVE_RESOURCE_NAME
        : "",
      audioResourceExtension: FINAL_LUCID_TRAINING_NATIVE_RESOURCE_EXTENSION,
      durationSeconds: trainingEnabled ? FINAL_LUCID_TRAINING_DURATION_SECONDS : 0,
      cueSchedule: trainingEnabled ? buildTrainingCueSchedule(cue) : [],
      sha256: trainingEnabled ? TRAINING_ASSET_METADATA.sha256 : "",
    },
    tlrInterval: {
      enabled: isTlr,
      earliestCueAt,
      latestCueAt,
      derivedFrom: isTlr
        ? "watch_training_completed_at_plus_protocol_delay"
        : "cue_delivery_disabled_sleep_log",
    },
    epoching: {
      epochSeconds: 30,
      motionSampleHz: 1,
      rawMotionPersistence: false,
    },
    remPolicy: {
      classifierVersion: WATCH_REM_CLASSIFIER_VERSION,
      threshold: input.engineSettings.remThreshold,
      persistenceRule: "2_of_last_3",
      minimumSleepProbability: input.engineSettings.minimumWatchSleepProbability,
      sensorQualityRequired: "good",
    },
    movement: {
      stableLowMovementRequiredSeconds:
        input.engineSettings.stableLowMovementRequiredSeconds,
      largeMovementThreshold: phoneCueing.largeMovementThreshold,
      cueAssociatedMovementWindowSeconds:
        input.engineSettings.cueAssociatedMovementWindowSeconds,
      cueAssociatedMovementPauseSeconds:
        input.engineSettings.cueAssociatedMovementPauseSeconds,
      userInteractionSuppressionSeconds:
        input.engineSettings.userInteractionSuppressionSeconds,
    },
    budget: {
      maxCuesTonight: input.engineSettings.maxCuesPerNight,
      minimumSecondsSinceLastCue:
        input.engineSettings.minimumSecondsSinceLastCue ||
        watchCueing.minimumSecondsSinceLastCue,
    },
    safety: {
      requireWorkoutSession: true,
      requireHealthKitAuthorization: true,
      requireMotion: true,
      requireLowPowerModeOff: true,
      minimumStartBatteryLevel: 0.35,
      lowBatteryWarningLevel: 0.5,
      safeSealBatteryLevel: 0.18,
      emergencyStopBatteryLevel: 0.1,
    },
    assets,
    model: {
      modelId: WATCH_REM_MODEL_ID,
      modelVersion: WATCH_REM_MODEL_VERSION,
      evaluatorType: "deterministic-swift",
    },
    privacy: {
      noGps: true,
      noSensorKit: true,
      noLiveAppleSleepStages: true,
      noSpO2: true,
      noRespiratoryRate: true,
      noWristTemperature: true,
    },
  });

  assertValidWatchRuntimePlan(plan);

  return plan;
}

export function buildWatchRuntimePlanFromSession(
  input: BuildWatchRuntimePlanFromSessionInput,
): WatchRuntimePlanV3 {
  return buildWatchRuntimePlan({
    ...input,
    sessionId: input.session.id,
    participantId: input.session.participantId,
    sessionType: input.session.sessionType,
    createdAt: input.session.startedAt,
    selectedCueId: input.session.selectedCueId ?? "",
  });
}
