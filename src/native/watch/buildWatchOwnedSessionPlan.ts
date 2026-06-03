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
  const selectedCue = getBuiltInCue(
    session.selectedCueId ?? tlrOptions.selectedCueId,
  );

  if (session.sessionType !== "tlr") {
    throw new Error("Watch-owned Mode can only prepare a TLR session.");
  }

  if (session.mode !== "watch") {
    throw new Error("Watch-owned Mode requires a watch session.");
  }

  if (!session.trainingEndedAt) {
    throw new Error("Watch-owned Mode requires completed presleep training.");
  }

  return {
    protocol: WATCH_OWNED_SESSION_PLAN_PROTOCOL,
    sessionId: session.id,
    createdAt: input.createdAt ?? new Date().toISOString(),
    validAfter: session.trainingEndedAt,
    expiresAt: sleepTiming.expectedWakeAt,
    trainingCompletedAt: session.trainingEndedAt,
    estimatedSleepStartAt: sleepTiming.estimatedSleepOnsetAt,
    earliestCueAt: sleepTiming.likelyPhoneCueWindowStart,
    stopAt: sleepTiming.expectedWakeAt,
    runtimeOwner: "watch",
    cueMode: watchCueModeFromTlrOptions(tlrOptions),
    cueBudget: settings.maxCuesPerNight,
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
    cueAssetManifest: {
      cueAssetId: selectedCue.id,
      fileName: `${selectedCue.nativeResourceName}.${selectedCue.nativeResourceExtension}`,
      durationMs: Math.round(selectedCue.durationSeconds * 1000),
      volumeHint: settings.volumeStartLevel,
    },
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
