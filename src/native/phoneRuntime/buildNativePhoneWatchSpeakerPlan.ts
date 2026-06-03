import type { NightSession, TlrOptions } from "@/src/domain/types";
import type { CueDecisionSettings, SleepTimingPrior } from "@/src/engine";
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
  NATIVE_PHONE_POLICY_VERSION,
  NATIVE_PRESLEEP_TRAINING_AUDIO_RESOURCE_EXTENSION,
  NATIVE_PRESLEEP_TRAINING_AUDIO_RESOURCE_NAME,
  phoneAudioBedAssetIdForBackgroundNoise,
  type NativePhoneSessionPlan,
} from "./NativePhoneSessionPlan";

export type BuildNativePhoneWatchSpeakerPlanInput = {
  session: NightSession;
  sleepTiming: SleepTimingPrior;
  settings: CueDecisionSettings;
  tlrOptions?: TlrOptions;
  startedAt?: string;
};

function toMutableInterval(value: readonly [number, number]): [number, number] {
  return [value[0], value[1]];
}

export function buildNativePhoneWatchSpeakerPlan(
  input: BuildNativePhoneWatchSpeakerPlanInput,
): NativePhoneSessionPlan {
  const { session, settings, sleepTiming } = input;
  const tlrOptions = normalizeTlrOptions(
    input.tlrOptions,
    settings.typicalWakeTime,
  );
  const now = input.startedAt ?? new Date().toISOString();
  const playsTraining =
    session.sessionType === "tlr" && !tlrOptions.skipGuidedTraining;
  const trainingEndedAt = playsTraining
    ? new Date(
        Date.parse(now) + FINAL_LUCID_TRAINING_DURATION_SECONDS * 1000,
      ).toISOString()
    : now;
  const selectedCue = getBuiltInCue(
    session.selectedCueId ?? tlrOptions.selectedCueId,
  );
  const alarmFireAt = tlrOptions.alarm.enabled
    ? resolveAlarmFireAt({
        alarmTime: tlrOptions.alarm.time,
        after: session.startedAt,
      })
    : undefined;

  return {
    sessionId: session.id,
    protocolVersion: session.protocolVersion,
    nativePolicyVersion: NATIVE_PHONE_POLICY_VERSION,
    speakerOnly: true,
    mode: "phone",
    startedAt: session.startedAt,
    trainingStartedAt: now,
    trainingEndedAt,
    training: {
      guidedTrainingSkipped: !playsTraining,
      lockedPlayback: {
        enabled: playsTraining,
        audioResourceName: NATIVE_PRESLEEP_TRAINING_AUDIO_RESOURCE_NAME,
        audioResourceExtension: NATIVE_PRESLEEP_TRAINING_AUDIO_RESOURCE_EXTENSION,
        durationSeconds: FINAL_LUCID_TRAINING_DURATION_SECONDS,
        cueSchedule: playsTraining
          ? buildTrainingCueSchedule(selectedCue).map((entry) => ({
              markerIndex: entry.markerIndex,
              cueStartSeconds: entry.cueStartSeconds,
            }))
          : [],
      },
    },
    audioBed: {
      enabled: true,
      assetId: phoneAudioBedAssetIdForBackgroundNoise(tlrOptions.backgroundNoise),
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
      requireAccelerometer: false,
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
      maxCuesTonight: 0,
      maxCuesPerBlock: 0,
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
}
