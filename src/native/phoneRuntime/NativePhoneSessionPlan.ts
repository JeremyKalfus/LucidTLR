import type {
  BackgroundNoiseOption,
  CueSuppressionReason,
} from "@/src/domain/types";
import { MAX_BUILT_IN_CUE_DURATION_SECONDS } from "@/src/audio/cueCatalog";

export const NATIVE_PHONE_POLICY_VERSION = "iphone-phone-runtime-2026-001";

export const DEFAULT_PHONE_AUDIO_BED_ASSET_ID =
  "lucidcue-audible-bed-white-noise";

export function phoneAudioBedAssetIdForBackgroundNoise(
  option: BackgroundNoiseOption,
): string {
  return option === "binaural_beats"
    ? "lucidcue-audible-bed-binaural-beats"
    : DEFAULT_PHONE_AUDIO_BED_ASSET_ID;
}

export const NATIVE_PRESLEEP_TRAINING_AUDIO_RESOURCE_NAME =
  "final_lucid_training";

export const NATIVE_PRESLEEP_TRAINING_AUDIO_RESOURCE_EXTENSION = "mp3";

export type NativePhoneSessionPlan = {
  sessionId: string;
  protocolVersion: string;
  nativePolicyVersion: string;

  mode: "phone";
  startedAt: string;
  trainingStartedAt: string;
  trainingEndedAt: string;

  training: {
    guidedTrainingSkipped: boolean;
    lockedPlayback: {
      enabled: boolean;
      audioResourceName: string;
      audioResourceExtension: "mp3";
      durationSeconds: number;
      cueSchedule: Array<{
        markerIndex: number;
        cueStartSeconds: number;
      }>;
    };
  };

  audioBed: {
    enabled: true;
    assetId: string;
    volume: number;
  };

  backgroundAudio: {
    option: BackgroundNoiseOption;
    enabled: boolean;
    volume: number;
    binauralCarrierFrequencyHz: number;
    binauralBeatFrequencyHz: number;
  };

  cue: {
    cueId: string;
    assetId: string;
    resourceName: string;
    resourceExtension: "mp3" | "wav";
    durationSeconds: number;
    startVolume: number;
    rampPerCue: number;
    capVolume: number;
  };

  timing: {
    earliestCueAt: string;
    latestCueAt: string;
    predictedRemWindows: Array<{
      startAt: string;
      endAt: string;
      confidence: number;
      source: "historical_sleep" | "default";
    }>;
    cueIntervalRangeSeconds: [number, number];
  };

  movement: {
    enabled: true;
    summaryIntervalSeconds: number;
    stableLowMovementRequiredSeconds: number;
    largeMovementThreshold: number;
    cueAssociatedMovementWindowSeconds: number;
    cueAssociatedMovementPauseSeconds: number;
  };

  budget: {
    maxCuesTonight: number;
    maxCuesPerBlock: number;
    maxBlockDurationMinutes: number;
    minRestBetweenBlocksMinutes: number;
  };

  pauses: {
    minimumSecondsSinceLastCue: number;
    userReportedAwakeningPauseSeconds: number;
  };

  safety: {
    requireAudioBed: true;
    stopAt?: string;
  };

  alarm: {
    enabled: boolean;
    fireAt?: string;
    autoShutoff: boolean;
    ringDurationSeconds?: number;
    volume: number;
  };
};

export type NativePhoneRuntimeEvent = {
  id: string;
  sessionId: string;
  timestamp: string;
  eventType:
    | "runtime_started"
    | "runtime_stopped"
    | "training_started"
    | "training_cue_play_attempted"
    | "training_cue_played"
    | "training_cue_failed"
    | "training_completed"
    | "training_failed"
    | "audio_session_configured"
    | "audio_bed_started"
    | "audio_bed_failed"
    | "background_audio_started"
    | "background_audio_stopped"
    | "background_audio_failed"
    | "alarm_scheduled"
    | "alarm_started"
    | "alarm_stopped"
    | "decision_tick"
    | "cue_candidate"
    | "cue_suppressed"
    | "cue_play_attempted"
    | "cue_played"
    | "cue_failed"
    | "motion_started"
    | "motion_summary"
    | "movement_pause_started"
    | "movement_pause_ended"
    | "cue_associated_movement"
    | "budget_exhausted"
    | "route_changed"
    | "interruption_started"
    | "interruption_ended"
    | "battery_summary"
    | "thermal_state_changed"
    | "runtime_error";
  payload: Record<string, unknown>;
};

export type PhoneRuntimeStatus = {
  available: boolean;
  unavailableReason?: string;
  running: boolean;
  phase?: "training" | "runtime" | "alarm";
  sessionId?: string;
  audioBedRunning: boolean;
  backgroundAudioRunning: boolean;
  alarmRinging: boolean;
  alarmFireAt?: string;
  motionRunning: boolean;
  cueCount: number;
  cuesInBlock: number;
  lastCueAt?: string;
  nextCueCandidateAt?: string;
  latestDecisionReason?: string;
  latestMovementIntensity?: string;
  latestMotionSummaryAt?: string;
  latestRuntimeError?: string;
};

export type PhoneRuntimeCueRecordDraft = {
  id: string;
  sessionId: string;
  timestamp: string;
  cueId: string;
  volumeLevel: number;
  played: boolean;
  suppressionReason: CueSuppressionReason;
};

export type PhoneRuntimeMovementRecordDraft = {
  id: string;
  sessionId: string;
  timestamp: string;
  intensity: number;
  wasCueAssociated: boolean;
  pauseStartedAt?: string;
  pauseEndedAt?: string;
};

export type PhoneRuntimeLogSummary = {
  cuesPlayed: number;
  cueFailures: number;
  motionSummaries: number;
  movementPauses: number;
  interruptions: number;
  stopped: boolean;
  completed: boolean;
  errored: boolean;
};

export function nativePhoneSessionUsesPredictedRemWindows(
  plan: NativePhoneSessionPlan,
): boolean {
  return plan.timing.predictedRemWindows.some(
    (window) => window.source === "historical_sleep",
  );
}

export function validateNativePhoneSessionPlan(
  plan: NativePhoneSessionPlan,
): string[] {
  const errors: string[] = [];

  if (plan.mode !== "phone") {
    errors.push("Phone runtime only accepts mode=phone.");
  }

  if (plan.audioBed.enabled !== true || plan.safety.requireAudioBed !== true) {
    errors.push("Phone runtime requires an audible audio bed.");
  }

  if (
    plan.backgroundAudio.option !== "none" &&
    plan.backgroundAudio.option !== "white_noise" &&
    plan.backgroundAudio.option !== "binaural_beats"
  ) {
    errors.push("Phone runtime background audio option is invalid.");
  }

  if (plan.backgroundAudio.option === "none" && plan.backgroundAudio.enabled) {
    errors.push("Background audio cannot be enabled when option is none.");
  }

  if (plan.backgroundAudio.option !== "none" && !plan.backgroundAudio.enabled) {
    errors.push("Background audio must be enabled for the selected option.");
  }

  if (
    plan.backgroundAudio.volume < 0 ||
    plan.backgroundAudio.volume > 1
  ) {
    errors.push("Background audio volume must be between 0 and 1.");
  }

  if (!plan.audioBed.assetId) {
    errors.push("Phone runtime requires an audio bed asset id.");
  }

  if (!plan.cue.assetId || !plan.cue.resourceName) {
    errors.push("Phone runtime requires a cue asset id.");
  }

  if (
    plan.cue.resourceExtension !== "mp3" &&
    plan.cue.resourceExtension !== "wav"
  ) {
    errors.push("Phone runtime cue resource extension is invalid.");
  }

  if (
    plan.cue.durationSeconds <= 0 ||
    plan.cue.durationSeconds > MAX_BUILT_IN_CUE_DURATION_SECONDS
  ) {
    errors.push("Phone runtime cue duration must be 3 seconds or shorter.");
  }

  if (plan.training.lockedPlayback.enabled) {
    if (!plan.training.lockedPlayback.audioResourceName) {
      errors.push("Locked presleep training requires a bundled audio asset.");
    }

    if (plan.training.lockedPlayback.audioResourceExtension !== "mp3") {
      errors.push("Locked presleep training audio resource extension is invalid.");
    }

    if (plan.training.lockedPlayback.durationSeconds <= 0) {
      errors.push("Locked presleep training duration must be positive.");
    }
  }

  if (plan.timing.cueIntervalRangeSeconds[0] > plan.timing.cueIntervalRangeSeconds[1]) {
    errors.push("Cue interval minimum cannot exceed maximum.");
  }

  if (Date.parse(plan.timing.earliestCueAt) > Date.parse(plan.timing.latestCueAt)) {
    errors.push("Earliest cue time cannot be after latest cue time.");
  }

  if (plan.alarm.enabled) {
    if (!plan.alarm.fireAt || Number.isNaN(Date.parse(plan.alarm.fireAt))) {
      errors.push("Alarm requires a valid fire time.");
    }

    if (
      plan.alarm.autoShutoff &&
      (!plan.alarm.ringDurationSeconds || plan.alarm.ringDurationSeconds <= 0)
    ) {
      errors.push("Alarm auto shutoff requires a positive ring duration.");
    }
  }

  return errors;
}
