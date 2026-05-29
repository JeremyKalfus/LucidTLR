import type { CueSuppressionReason } from "@/src/domain/types";

export const NATIVE_PHONE_POLICY_VERSION = "iphone-phone-runtime-2026-001";

export const DEFAULT_PHONE_AUDIO_BED_ASSET_ID =
  "lucidcue-audible-bed-sine-220hz";

export const DEFAULT_PHONE_CUE_ASSET_ID = "lucidcue_feasibility_medium";

export type NativePhoneSessionPlan = {
  sessionId: string;
  protocolVersion: string;
  nativePolicyVersion: string;

  mode: "phone";
  startedAt: string;
  trainingStartedAt: string;
  trainingEndedAt: string;

  audioBed: {
    enabled: true;
    assetId: string;
    volume: number;
  };

  cue: {
    cueId: string;
    assetId: string;
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
};

export type NativePhoneRuntimeEvent = {
  id: string;
  sessionId: string;
  timestamp: string;
  eventType:
    | "runtime_started"
    | "runtime_stopped"
    | "audio_session_configured"
    | "audio_bed_started"
    | "audio_bed_failed"
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
  sessionId?: string;
  audioBedRunning: boolean;
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

  if (!plan.audioBed.assetId) {
    errors.push("Phone runtime requires an audio bed asset id.");
  }

  if (!plan.cue.assetId) {
    errors.push("Phone runtime requires a cue asset id.");
  }

  if (plan.timing.cueIntervalRangeSeconds[0] > plan.timing.cueIntervalRangeSeconds[1]) {
    errors.push("Cue interval minimum cannot exceed maximum.");
  }

  if (Date.parse(plan.timing.earliestCueAt) > Date.parse(plan.timing.latestCueAt)) {
    errors.push("Earliest cue time cannot be after latest cue time.");
  }

  return errors;
}
