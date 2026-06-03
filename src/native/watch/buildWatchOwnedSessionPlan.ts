import { getBuiltInCue } from "@/src/audio/cueCatalog";
import type { NightSession, TlrOptions } from "@/src/domain/types";
import type { CueDecisionSettings, SleepTimingPrior } from "@/src/engine";
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

  if (session.mode !== "watch") {
    throw new Error("Watch-owned Mode requires a watch session.");
  }

  const watchModeAnchorAt = session.trainingEndedAt ?? session.startedAt;

  return {
    protocol: WATCH_OWNED_SESSION_PLAN_PROTOCOL,
    sessionId: session.id,
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
