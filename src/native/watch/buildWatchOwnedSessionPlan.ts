import { getBuiltInCue } from "@/src/audio/cueCatalog";
import type { NightSession, TlrOptions } from "@/src/domain/types";
import type { CueDecisionSettings, SleepTimingPrior } from "@/src/engine";
import {
  FINAL_LUCID_TRAINING_ASSET_ID,
  FINAL_LUCID_TRAINING_DURATION_SECONDS,
  FINAL_LUCID_TRAINING_NATIVE_RESOURCE_EXTENSION,
  FINAL_LUCID_TRAINING_NATIVE_RESOURCE_NAME,
  buildTrainingCueSchedule,
} from "@/src/audio/trainingAudio";
import {
  LUCIDCUE_WATCH_REM_CLASSIFIER_VERSION,
  MALLELA_APPROX_FEATURE_VERSION,
  MALLELA_REM_THRESHOLD,
} from "@/src/engine/watchRem";
import { normalizeTlrOptions } from "@/src/features/tlrOptions/tlrOptions";
import { watchCueing } from "@/src/protocol/tlrProtocol";

import {
  DEFAULT_WATCH_BATTERY_POLICY,
  type WatchCueMode,
  type WatchOwnedSessionPlanV2,
  type WatchTrainingManifest,
} from "./WatchOwnedTypes";

export const WATCH_OWNED_SESSION_PLAN_PROTOCOL = "watch-session-plan-v2";
export const WATCH_OWNED_MODEL_ID = "mallela_rf_v1";
export const WATCH_OWNED_MODEL_FILE_NAME = "mallela_rf_v1.json";

export type BuildWatchOwnedSessionPlanInput = {
  session: NightSession;
  sleepTiming: SleepTimingPrior;
  settings: CueDecisionSettings;
  tlrOptions?: TlrOptions;
  createdAt?: string;
  classifierVersion?: string;
  modelChecksum?: string;
};

export function watchCueModeFromTlrOptions(options: TlrOptions): WatchCueMode {
  if (options.watchAudioCueEnabled && options.watchHapticCueEnabled) {
    return "audio_haptic";
  }

  if (options.watchAudioCueEnabled) {
    return "audio_only";
  }

  return "haptic_only";
}

function addSeconds(iso: string, seconds: number): string {
  return new Date(Date.parse(iso) + seconds * 1000).toISOString();
}

export function watchTrainingEnabledForSession(input: {
  session: NightSession;
  settings: CueDecisionSettings;
  tlrOptions?: TlrOptions;
}): boolean {
  const tlrOptions = normalizeTlrOptions(
    input.tlrOptions,
    input.settings.typicalWakeTime,
  );

  return input.session.sessionType === "tlr" && !tlrOptions.skipGuidedTraining;
}

export function projectedWatchTrainingCompletedAt(input: {
  session: NightSession;
  settings: CueDecisionSettings;
  tlrOptions?: TlrOptions;
}): string {
  if (!watchTrainingEnabledForSession(input)) {
    return input.session.trainingEndedAt ?? input.session.startedAt;
  }

  return (
    input.session.trainingEndedAt ??
    addSeconds(input.session.startedAt, FINAL_LUCID_TRAINING_DURATION_SECONDS)
  );
}

function buildWatchTrainingManifest(input: {
  session: NightSession;
  settings: CueDecisionSettings;
  tlrOptions?: TlrOptions;
  selectedCue: ReturnType<typeof getBuiltInCue> | null;
}): WatchTrainingManifest {
  const enabled = watchTrainingEnabledForSession(input);
  const expectedStartedAt = input.session.trainingStartedAt ?? input.session.startedAt;
  const expectedCompletedAt = enabled
    ? projectedWatchTrainingCompletedAt(input)
    : input.session.trainingEndedAt;

  return {
    enabled,
    skipped: input.session.sessionType !== "tlr" || !enabled,
    trainingAssetId: enabled ? FINAL_LUCID_TRAINING_ASSET_ID : undefined,
    resourceName: enabled ? FINAL_LUCID_TRAINING_NATIVE_RESOURCE_NAME : undefined,
    resourceExtension: enabled
      ? FINAL_LUCID_TRAINING_NATIVE_RESOURCE_EXTENSION
      : undefined,
    durationSec: enabled ? FINAL_LUCID_TRAINING_DURATION_SECONDS : undefined,
    expectedStartedAt: enabled ? expectedStartedAt : undefined,
    expectedCompletedAt,
    cueSchedule:
      enabled && input.selectedCue
        ? buildTrainingCueSchedule(input.selectedCue).map((entry) => ({
            markerIndex: entry.markerIndex,
            markerMidpointSec: entry.markerMidpointSeconds,
            cueStartSec: entry.cueStartSeconds,
          }))
        : [],
  };
}

export function buildWatchOwnedSessionPlan(
  input: BuildWatchOwnedSessionPlanInput,
): WatchOwnedSessionPlanV2 {
  const { session, settings, sleepTiming } = input;
  const tlrOptions = normalizeTlrOptions(
    input.tlrOptions,
    settings.typicalWakeTime,
  );

  const isTlrSession = session.sessionType === "tlr";
  const selectedCue = isTlrSession
    ? getBuiltInCue(session.selectedCueId ?? tlrOptions.selectedCueId)
    : null;
  const training = buildWatchTrainingManifest({
    session,
    settings,
    tlrOptions,
    selectedCue,
  });
  const tlrIntervalStartsAt = isTlrSession
    ? training.expectedCompletedAt ?? session.trainingEndedAt ?? session.startedAt
    : session.startedAt;

  if (session.mode !== "watch") {
    throw new Error("Watch-owned Mode requires a watch session.");
  }

  const watchModeAnchorAt = session.trainingEndedAt ?? session.startedAt;

  return {
    protocol: WATCH_OWNED_SESSION_PLAN_PROTOCOL,
    sessionId: session.id,
    sessionType: session.sessionType,
    createdAt: input.createdAt ?? new Date().toISOString(),
    validAfter: watchModeAnchorAt,
    expiresAt: sleepTiming.expectedWakeAt,
    trainingCompletedAt: session.trainingEndedAt,
    estimatedSleepStartAt: sleepTiming.estimatedSleepOnsetAt,
    earliestCueAt: isTlrSession
      ? sleepTiming.likelyPhoneCueWindowStart
      : session.startedAt,
    stopAt: sleepTiming.expectedWakeAt,
    runtimeOwner: "watch",
    tlrEnabled: isTlrSession,
    training,
    tlrInterval: {
      enabled: isTlrSession,
      startsAt: tlrIntervalStartsAt,
      earliestCueAt: isTlrSession
        ? sleepTiming.likelyPhoneCueWindowStart
        : session.startedAt,
      stopAt: sleepTiming.expectedWakeAt,
      derivedFrom: training.enabled ? "watch_training_end" : "session_start",
      cueDelayAfterTrainingSec: training.enabled
        ? settings.cueStartDelayHoursAfterTraining * 3600
        : undefined,
    },
    cueMode: isTlrSession ? watchCueModeFromTlrOptions(tlrOptions) : "none",
    cueBudget: isTlrSession ? settings.maxCuesPerNight : 0,
    minInterCueIntervalSec: settings.minimumSecondsSinceLastCue,
    suppressCueFromConsecutiveLikelyRemEpoch:
      settings.watchLikelyRemSuppressionEpochs ||
      watchCueing.consecutiveLikelyRemSuppressionThreshold,
    epochDurationSec: watchCueing.epochSeconds,
    accelerometerHz: 30,
    movementGateConfig: {
      stableLowMovementRequiredSeconds:
        settings.stableLowMovementRequiredSeconds,
      cueAssociatedMovementWindowSeconds:
        settings.cueAssociatedMovementWindowSeconds,
      cueAssociatedMovementPauseSeconds:
        settings.cueAssociatedMovementPauseSeconds,
    },
    batteryPolicy: DEFAULT_WATCH_BATTERY_POLICY,
    lowPowerModePolicy: "warn_degraded",
    cueAssetManifest: selectedCue
      ? {
          cueAssetId: selectedCue.id,
          fileName: `${selectedCue.nativeResourceName}.${selectedCue.nativeResourceExtension}`,
          durationMs: Math.round(selectedCue.durationSeconds * 1000),
          volumeHint: settings.volumeStartLevel,
        }
      : undefined,
    remModelManifest: {
      modelId: WATCH_OWNED_MODEL_ID,
      version: input.classifierVersion ?? LUCIDCUE_WATCH_REM_CLASSIFIER_VERSION,
      checksum: input.modelChecksum,
      threshold: settings.remThreshold || MALLELA_REM_THRESHOLD,
      featureConfigVersion: MALLELA_APPROX_FEATURE_VERSION,
    },
    privacyLoggingMode: "summary_only",
  };
}
