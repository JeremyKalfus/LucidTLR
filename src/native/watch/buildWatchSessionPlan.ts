import { getBuiltInCue } from "@/src/audio/cueCatalog";
import type { NightSession, TlrOptions } from "@/src/domain/types";
import type { CueDecisionSettings, SleepTimingPrior } from "@/src/engine";
import { watchCueing } from "@/src/protocol/tlrProtocol";
import { normalizeTlrOptions } from "@/src/features/tlrOptions/tlrOptions";
import {
  LUCIDCUE_WATCH_REM_CLASSIFIER_VERSION,
  MALLELA_REM_THRESHOLD,
} from "@/src/engine/watchRem";
import {
  DEFAULT_PHONE_AUDIO_BED_ASSET_ID,
  phoneAudioBedAssetIdForBackgroundNoise,
} from "@/src/native/phoneRuntime/NativePhoneSessionPlan";

import type { NativeWatchSessionPlan } from "./WatchModeTypes";

export const NATIVE_WATCH_POLICY_VERSION = "iphone-watch-runtime-2026-001";

export type BuildNativeWatchSessionPlanInput = {
  session: NightSession;
  sleepTiming: SleepTimingPrior;
  settings: CueDecisionSettings;
  tlrOptions?: TlrOptions;
  classifierModelAvailable?: boolean;
  classifierVersion?: string;
};

export function buildNativeWatchSessionPlan(
  input: BuildNativeWatchSessionPlanInput,
): NativeWatchSessionPlan {
  const { session, settings } = input;
  const tlrOptions = normalizeTlrOptions(
    input.tlrOptions,
    settings.typicalWakeTime,
  );
  const selectedCue = getBuiltInCue(
    session.selectedCueId ?? tlrOptions.selectedCueId,
  );

  if (session.sessionType !== "tlr") {
    throw new Error("Native Watch Mode can only start a TLR session.");
  }

  if (session.mode !== "watch") {
    throw new Error("Native Watch Mode requires a watch session.");
  }

  if (!session.trainingStartedAt || !session.trainingEndedAt) {
    throw new Error("Native Watch Mode requires completed presleep training.");
  }

  const modelAvailable = input.classifierModelAvailable ?? true;

  return {
    sessionId: session.id,
    protocolVersion: session.protocolVersion,
    nativePolicyVersion: NATIVE_WATCH_POLICY_VERSION,
    mode: "watch",
    startedAt: session.startedAt,
    trainingStartedAt: session.trainingStartedAt,
    trainingEndedAt: session.trainingEndedAt,
    iPhoneAudio: {
      audioBedRequired: true,
      audioBedAssetId:
        phoneAudioBedAssetIdForBackgroundNoise(tlrOptions.backgroundNoise) ??
        DEFAULT_PHONE_AUDIO_BED_ASSET_ID,
      audioBedVolume: settings.phoneAudioBedVolume,
      cueAssetId: selectedCue.id,
      cueId: selectedCue.id,
      cueResourceName: selectedCue.nativeResourceName,
      cueResourceExtension: selectedCue.nativeResourceExtension,
      cueDurationSeconds: selectedCue.durationSeconds,
      startVolume: settings.volumeStartLevel,
      rampPerCue: settings.volumeRampPerCue,
      capVolume: settings.volumeCap,
    },
    watch: {
      epochSeconds: watchCueing.epochSeconds,
      requireHeartRate: true,
      requireMotion: true,
      motionTargetHz: 30,
      enableWaterLock: true,
    },
    classifier: {
      classifierVersion:
        input.classifierVersion ?? LUCIDCUE_WATCH_REM_CLASSIFIER_VERSION,
      modelAvailable,
      remThreshold: settings.remThreshold || MALLELA_REM_THRESHOLD,
      minimumSleepProbability: settings.minimumWatchSleepProbability,
      suppressAfterConsecutiveLikelyRemEpochs:
        settings.watchLikelyRemSuppressionEpochs,
    },
    cuePolicy: {
      minimumSecondsSinceLastCue: settings.minimumSecondsSinceLastCue,
      stableLowMovementRequiredSeconds:
        settings.stableLowMovementRequiredSeconds,
      cueAssociatedMovementWindowSeconds:
        settings.cueAssociatedMovementWindowSeconds,
      cueAssociatedMovementPauseSeconds:
        settings.cueAssociatedMovementPauseSeconds,
      maxCuesTonight: settings.maxCuesPerNight,
      maxCuesPerBlock: settings.maxPhoneCuesPerBlock,
      maxBlockDurationMinutes: settings.maxPhoneBlockDurationMinutes,
      minRestBetweenBlocksMinutes: settings.minRestBetweenCueBlocksMinutes,
    },
    safety: {
      expectedWakeAt: input.sleepTiming.expectedWakeAt,
      stopAt: input.sleepTiming.expectedWakeAt,
      requireIPhoneAudioBed: true,
      stopIfWatchDisconnectedMinutes: 20,
      requireWatchBatteryAbovePercentAtStart: 60,
    },
  };
}
