import type {
  HistoricalSleepPrior,
  NightSession,
  TlrOptions,
} from "@/src/domain/types";
import type { CueDecisionSettings, SleepTimingPrior } from "@/src/engine";
import { buildCueId, buildSleepTimingPrior } from "@/src/engine";
import {
  BACKGROUND_AUDIO_VOLUME,
  BINAURAL_BEAT_FREQUENCY_HZ,
  BINAURAL_CARRIER_FREQUENCY_HZ,
  DEFAULT_ALARM_VOLUME,
  normalizeTlrOptions,
  resolveAlarmFireAt,
} from "@/src/features/tlrOptions/tlrOptions";
import { cueAudio, phoneCueing } from "@/src/protocol/tlrProtocol";

import {
  DEFAULT_PHONE_AUDIO_BED_ASSET_ID,
  DEFAULT_PHONE_CUE_ASSET_ID,
  NATIVE_PHONE_POLICY_VERSION,
  type NativePhoneSessionPlan,
  validateNativePhoneSessionPlan,
} from "./NativePhoneSessionPlan";

export type BuildNativePhoneSessionPlanInput = {
  session: NightSession;
  sleepTiming: SleepTimingPrior;
  settings: CueDecisionSettings;
  tlrOptions?: TlrOptions;
  audioBedAssetId?: string;
  cueAssetId?: string;
};

export type BuildNativePhoneSessionPlanFromCompletedSessionInput = Omit<
  BuildNativePhoneSessionPlanInput,
  "sleepTiming"
> & {
  historicalSleepPrior?: HistoricalSleepPrior;
};

function toMutableInterval(
  value: readonly [number, number],
): [number, number] {
  return [value[0], value[1]];
}

export function buildNativePhoneSessionPlan(
  input: BuildNativePhoneSessionPlanInput,
): NativePhoneSessionPlan {
  const { session, settings, sleepTiming } = input;
  const tlrOptions = normalizeTlrOptions(
    input.tlrOptions,
    settings.typicalWakeTime,
  );
  const alarmFireAt = tlrOptions.alarm.enabled
    ? resolveAlarmFireAt({
        alarmTime: tlrOptions.alarm.time,
        after: session.trainingEndedAt ?? session.startedAt,
      })
    : undefined;

  if (session.sessionType !== "tlr") {
    throw new Error("Native Phone Mode can only start a TLR session.");
  }

  if (session.mode !== "phone") {
    throw new Error("Native Phone Mode requires a phone session.");
  }

  if (!session.trainingStartedAt || !session.trainingEndedAt) {
    throw new Error("Native Phone Mode requires completed presleep training.");
  }

  const plan: NativePhoneSessionPlan = {
    sessionId: session.id,
    protocolVersion: session.protocolVersion,
    nativePolicyVersion: NATIVE_PHONE_POLICY_VERSION,
    mode: "phone",
    startedAt: session.startedAt,
    trainingStartedAt: session.trainingStartedAt,
    trainingEndedAt: session.trainingEndedAt,
    training: {
      guidedTrainingSkipped: session.guidedTrainingSkipped === true,
    },
    audioBed: {
      enabled: true,
      assetId: input.audioBedAssetId ?? DEFAULT_PHONE_AUDIO_BED_ASSET_ID,
      volume: settings.phoneAudioBedVolume,
    },
    backgroundAudio: {
      option: tlrOptions.backgroundNoise,
      enabled: tlrOptions.backgroundNoise !== "none",
      volume: BACKGROUND_AUDIO_VOLUME,
      binauralCarrierFrequencyHz: BINAURAL_CARRIER_FREQUENCY_HZ,
      binauralBeatFrequencyHz: BINAURAL_BEAT_FREQUENCY_HZ,
    },
    cue: {
      cueId: buildCueId(),
      assetId: input.cueAssetId ?? DEFAULT_PHONE_CUE_ASSET_ID,
      durationSeconds: cueAudio.durationSeconds,
      startVolume: settings.volumeStartLevel,
      rampPerCue: settings.volumeRampPerCue,
      capVolume: settings.volumeCap,
    },
    timing: {
      earliestCueAt: sleepTiming.likelyPhoneCueWindowStart,
      latestCueAt: sleepTiming.likelyPhoneCueWindowEnd,
      predictedRemWindows: sleepTiming.predictedRemWindows.map((window) => ({
        startAt: window.startAt,
        endAt: window.endAt,
        confidence: window.confidence,
        source: window.source,
      })),
      cueIntervalRangeSeconds: toMutableInterval(settings.cueIntervalRangeSeconds),
    },
    movement: {
      enabled: true,
      summaryIntervalSeconds: phoneCueing.motionSummaryIntervalSeconds,
      stableLowMovementRequiredSeconds:
        settings.stableLowMovementRequiredSeconds,
      largeMovementThreshold: phoneCueing.largeMovementThreshold,
      cueAssociatedMovementWindowSeconds:
        settings.cueAssociatedMovementWindowSeconds,
      cueAssociatedMovementPauseSeconds:
        settings.cueAssociatedMovementPauseSeconds,
    },
    budget: {
      maxCuesTonight: settings.maxCuesPerNight,
      maxCuesPerBlock: settings.maxPhoneCuesPerBlock,
      maxBlockDurationMinutes: settings.maxPhoneBlockDurationMinutes,
      minRestBetweenBlocksMinutes: settings.minRestBetweenCueBlocksMinutes,
    },
    pauses: {
      minimumSecondsSinceLastCue: settings.minimumSecondsSinceLastCue,
      userReportedAwakeningPauseSeconds:
        settings.userReportedAwakeningPauseSeconds,
    },
    safety: {
      requireAudioBed: true,
      stopAt: alarmFireAt ?? sleepTiming.expectedWakeAt,
    },
    alarm: {
      enabled: tlrOptions.alarm.enabled,
      fireAt: alarmFireAt,
      autoShutoff: tlrOptions.alarm.autoShutoff,
      ringDurationSeconds: tlrOptions.alarm.autoShutoff
        ? tlrOptions.alarm.ringDurationMinutes * 60
        : undefined,
      volume: DEFAULT_ALARM_VOLUME,
    },
  };
  const errors = validateNativePhoneSessionPlan(plan);

  if (errors.length > 0) {
    throw new Error(errors.join(" "));
  }

  return plan;
}

export function buildNativePhoneSessionPlanFromCompletedSession(
  input: BuildNativePhoneSessionPlanFromCompletedSessionInput,
): NativePhoneSessionPlan {
  if (!input.session.trainingEndedAt) {
    throw new Error("Native Phone Mode requires completed presleep training.");
  }

  return buildNativePhoneSessionPlan({
    ...input,
    sleepTiming: buildSleepTimingPrior({
      trainingEndedAt: input.session.trainingEndedAt,
      settings: input.settings,
      historicalSleepPrior: input.historicalSleepPrior,
    }),
  });
}
