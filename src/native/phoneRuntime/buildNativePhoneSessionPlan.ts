import type {
  HistoricalSleepPrior,
  NightSession,
  PhoneNightCalibrationPrior,
  TlrOptions,
} from "@/src/domain/types";
import type { CueDecisionSettings, SleepTimingPrior } from "@/src/engine";
import { buildSleepTimingPrior } from "@/src/engine";
import { getBuiltInCue } from "@/src/audio/cueCatalog";
import {
  FINAL_LUCID_TRAINING_DURATION_SECONDS,
  buildTrainingCueSchedule,
} from "@/src/audio/trainingAudio";
import {
  BINAURAL_BEAT_FREQUENCY_HZ,
  BINAURAL_CARRIER_FREQUENCY_HZ,
  DEFAULT_ALARM_VOLUME,
  normalizeTlrOptions,
  resolveAlarmFireAt,
} from "@/src/features/tlrOptions/tlrOptions";
import { phoneCueing } from "@/src/protocol/tlrProtocol";

import {
  NATIVE_PRESLEEP_TRAINING_AUDIO_RESOURCE_EXTENSION,
  NATIVE_PRESLEEP_TRAINING_AUDIO_RESOURCE_NAME,
  NATIVE_PHONE_POLICY_VERSION,
  phoneAudioBedAssetIdForBackgroundNoise,
  type NativePhoneSessionPlan,
  validateNativePhoneSessionPlan,
} from "./NativePhoneSessionPlan";

export type BuildNativePhoneSessionPlanInput = {
  session: NightSession;
  sleepTiming: SleepTimingPrior;
  settings: CueDecisionSettings;
  tlrOptions?: TlrOptions;
  audioBedAssetId?: string;
};

export type BuildNativePhoneSessionPlanFromCompletedSessionInput = Omit<
  BuildNativePhoneSessionPlanInput,
  "sleepTiming"
> & {
  historicalSleepPrior?: HistoricalSleepPrior;
  phoneNightPrior?: PhoneNightCalibrationPrior;
};

export type BuildNativePhoneSessionPlanForLockedTrainingInput = Omit<
  BuildNativePhoneSessionPlanFromCompletedSessionInput,
  "session"
> & {
  session: NightSession;
  trainingStartedAt: string;
};

export type BuildNativePhoneSessionPlanForWatchLockedTrainingInput =
  BuildNativePhoneSessionPlanForLockedTrainingInput;

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
  const selectedCue = getBuiltInCue(
    session.selectedCueId ?? tlrOptions.selectedCueId,
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
      lockedPlayback: {
        enabled: false,
        audioResourceName: NATIVE_PRESLEEP_TRAINING_AUDIO_RESOURCE_NAME,
        audioResourceExtension: NATIVE_PRESLEEP_TRAINING_AUDIO_RESOURCE_EXTENSION,
        durationSeconds: FINAL_LUCID_TRAINING_DURATION_SECONDS,
        cueSchedule: [],
      },
    },
    audioBed: {
      enabled: true,
      assetId:
        input.audioBedAssetId ??
        phoneAudioBedAssetIdForBackgroundNoise(tlrOptions.backgroundNoise),
      volume: settings.phoneAudioBedVolume,
    },
    backgroundAudio: {
      option: "none",
      enabled: false,
      volume: 0,
      binauralCarrierFrequencyHz: BINAURAL_CARRIER_FREQUENCY_HZ,
      binauralBeatFrequencyHz: BINAURAL_BEAT_FREQUENCY_HZ,
    },
    cue: {
      cueId: selectedCue.id,
      assetId: selectedCue.id,
      resourceName: selectedCue.nativeResourceName,
      resourceExtension: selectedCue.nativeResourceExtension,
      durationSeconds: selectedCue.durationSeconds,
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
      requireAccelerometer: tlrOptions.requireAccelerometer,
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
      phoneNightPrior: input.phoneNightPrior,
    }),
  });
}

export function buildNativePhoneSessionPlanForLockedTraining(
  input: BuildNativePhoneSessionPlanForLockedTrainingInput,
): NativePhoneSessionPlan {
  const trainingEndedAt = new Date(
    Date.parse(input.trainingStartedAt) + FINAL_LUCID_TRAINING_DURATION_SECONDS * 1000,
  ).toISOString();
  const selectedCue = getBuiltInCue(
    input.session.selectedCueId ??
      normalizeTlrOptions(input.tlrOptions, input.settings.typicalWakeTime)
        .selectedCueId,
  );
  const completedSession: NightSession = {
    ...input.session,
    status: "waiting_for_cue_window",
    trainingStartedAt: input.trainingStartedAt,
    trainingEndedAt,
    guidedTrainingSkipped: false,
  };
  const plan = buildNativePhoneSessionPlanFromCompletedSession({
    ...input,
    session: completedSession,
  });

  return {
    ...plan,
    training: {
      ...plan.training,
      lockedPlayback: {
        enabled: true,
        audioResourceName: NATIVE_PRESLEEP_TRAINING_AUDIO_RESOURCE_NAME,
        audioResourceExtension: NATIVE_PRESLEEP_TRAINING_AUDIO_RESOURCE_EXTENSION,
        durationSeconds: FINAL_LUCID_TRAINING_DURATION_SECONDS,
        cueSchedule: buildTrainingCueSchedule(selectedCue).map((entry) => ({
          markerIndex: entry.markerIndex,
          cueStartSeconds: entry.cueStartSeconds,
        })),
      },
    },
  };
}

export function buildNativePhoneSessionPlanForWatchLockedTraining(
  input: BuildNativePhoneSessionPlanForWatchLockedTrainingInput,
): NativePhoneSessionPlan {
  if (input.session.mode !== "watch") {
    throw new Error("Watch locked training requires a Watch session.");
  }

  return buildNativePhoneSessionPlanForLockedTraining({
    ...input,
    session: {
      ...input.session,
      mode: "phone",
    },
  });
}
