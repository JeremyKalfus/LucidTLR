import type {
  AppMode,
  CueDecisionAction,
  CueDecisionReason,
  HistoricalSleepPrior,
  NightSession,
  PredictedRemWindow,
  SessionStatus,
  SoundSensitivityProfile,
  WatchSensorQuality,
} from "@/src/domain/types";
import {
  cueAudio,
  cueBudget,
  phoneCueing,
  TLR_PROTOCOL_VERSION,
  volumeProfiles,
  watchCueing,
} from "@/src/protocol/tlrProtocol";

export type {
  CueDecisionAction,
  CueDecisionReason,
  HistoricalSleepPrior,
  PredictedRemWindow,
  SoundSensitivityProfile,
  WatchSensorQuality,
};

export type SleepTimingConfidence = "low" | "medium" | "high";
export type SleepTimingSource = "default" | "self_report" | "historical_sleep";
export type WatchConnectivityState = "connected" | "disconnected" | "unknown";

export interface CueDecisionSettings {
  soundSensitivity: SoundSensitivityProfile;
  typicalBedtime: string;
  typicalWakeTime: string;
  typicalSleepDurationHours: number;
  selfReportedSleepLatencyMinutes: number;
  cueStartDelayHoursAfterTraining: number;
  cueIntervalRangeSeconds: readonly [number, number];
  minimumSecondsSinceLastCue: number;
  userInteractionSuppressionSeconds: number;
  stableLowMovementRequiredSeconds: number;
  cueAssociatedMovementWindowSeconds: number;
  cueAssociatedMovementPauseSeconds: number;
  userReportedAwakeningPauseSeconds: number;
  phoneAudioBedVolume: number;
  phoneScoreThreshold: number;
  remThreshold: number;
  minimumWatchSleepProbability: number;
  watchLikelyRemSuppressionEpochs: number;
  volumeStartLevel: number;
  volumeRampPerCue: number;
  volumeCap: number;
  maxPhoneCuesPerBlock: number;
  maxPhoneBlockDurationMinutes: number;
  minRestBetweenCueBlocksMinutes: number;
  maxCuesPerNight: number;
}

export interface CueHistoryEntry {
  id: string;
  timestamp: string;
  cueId: string;
  volumeLevel: number;
}

export interface SuppressionHistoryEntry {
  timestamp: string;
  reason: CueDecisionReason;
}

export interface CueHistoryContext {
  previousCues: CueHistoryEntry[];
  previousSuppressions?: SuppressionHistoryEntry[];
  lastCueTime?: string;
  numberOfCuesTonight: number;
  numberOfCuesInCurrentBlock: number;
  currentBlockStartedAt?: string;
  latestVolumeLevel?: number;
  lastSuccessfulCueVolume?: number;
  lastAwakeningCueVolume?: number;
}

export interface MovementHistoryContext {
  recentMovementIntensity: number;
  stableLowMovementSeconds: number;
  phonePickedUpRecently: boolean;
  orientationChangedRecently: boolean;
  lastUserInteractionAt?: string;
  movementAfterLastCueAt?: string;
  largeMovementEvents?: string[];
}

export interface UserFeedbackContext {
  cueWokeUser?: boolean;
  returnedToSleep?: boolean;
  cueWokeUserReportedAt?: string;
  cueIncorporatedIntoDream?: boolean;
  lucidDreamReported?: boolean;
  sleepQualityRating?: number;
}

export interface WatchEpochSignal {
  epochStart: string;
  epochEnd: string;
  remProbability?: number;
  sleepProbability?: number;
  sensorQuality: WatchSensorQuality;
  motionSummary?: number;
  heartRateSummary?: number;
  stableLowMovementSeconds: number;
  consecutiveLikelyRemEpochs: number;
  connectivityState: WatchConnectivityState;
  watchBatteryLevel?: number;
}

export interface CueDecisionContext {
  now: string;
  mode: AppMode;
  session: NightSession | null;
  settings: CueDecisionSettings;
  cueHistory: CueHistoryContext;
  movement: MovementHistoryContext;
  userFeedback: UserFeedbackContext;
  watchSignal?: WatchEpochSignal;
  historicalSleepPrior?: HistoricalSleepPrior;
}

export interface SleepTimingPrior {
  estimatedSleepOnsetAt: string;
  expectedWakeAt: string;
  likelyPhoneCueWindowStart: string;
  likelyPhoneCueWindowEnd: string;
  predictedRemWindows: PredictedRemWindow[];
  historicalSleepPrior?: HistoricalSleepPrior;
  confidence: SleepTimingConfidence;
  source: SleepTimingSource;
}

export interface ScoreBreakdown {
  timeOpportunityScore: number;
  historicalRemWindowScore: number;
  movementStabilityScore: number;
  noInteractionScore: number;
  sleepPriorScore: number;
  userToleranceScore: number;
  cueBudgetScore: number;
}

export interface WatchScoreBreakdown {
  normalizedRemScore: number;
  sleepProbabilityScore: number;
  watchMovementStabilityScore: number;
  sleepPriorScore: number;
}

export interface MovementGateState {
  recentMovementIntensity: number;
  largeMovementThreshold: number;
  stableLowMovementSeconds: number;
  requiredStableLowMovementSeconds: number;
  movementPauseActive: boolean;
  movementPauseUntil?: string;
  cueAssociatedMovementPauseActive: boolean;
  cueAssociatedMovementPauseUntil?: string;
  userInteractionSuppressionActive: boolean;
  userInteractionSuppressionUntil?: string;
}

export interface CueBudgetState {
  cuesTonight: number;
  maxCuesTonight: number;
  cuesRemainingTonight: number;
  cuesInCurrentBlock: number;
  maxCuesPerBlock: number;
  blockStartedAt?: string;
  blockEndsAt?: string;
  blockRestUntil?: string;
  isNightlyBudgetExhausted: boolean;
  isBlockBudgetExhausted: boolean;
  isBlockResting: boolean;
}

export interface VolumeState {
  currentVolumeLevel: number;
  nextCueVolumeLevel: number;
  startLevel: number;
  rampPerCue: number;
  cap: number;
  lastSuccessfulCueVolume?: number;
  lastAwakeningCueVolume?: number;
}

export interface WatchDecisionState {
  remProbability?: number;
  remThreshold: number;
  sleepProbability?: number;
  minimumSleepProbability: number;
  sensorQuality: WatchSensorQuality;
  stableLowMovementSeconds: number;
  consecutiveLikelyRemEpochs: number;
  persistentRemSuppressionActive: boolean;
  connectivityState: WatchConnectivityState;
  watchBatteryLevel?: number;
  opportunityScore?: number;
  scoreBreakdown?: WatchScoreBreakdown;
}

export interface CueDecision {
  action: CueDecisionAction;
  reason: CueDecisionReason;
  cueId?: string;
  volumeLevel?: number;
  opportunityScore: number;
  scoreBreakdown: ScoreBreakdown;
  nextCheckAt: string;
  activePauseUntil?: string;
  sleepTiming: SleepTimingPrior;
  movement: MovementGateState;
  budget: CueBudgetState;
  volume: VolumeState;
  watch?: WatchDecisionState;
  metadata: Record<string, string | number | boolean | null>;
}

export interface EngineSnapshot {
  evaluatedAt: string;
  mode: AppMode;
  sessionStatus: SessionStatus | "none";
  decision: CueDecision;
  sleepTiming: SleepTimingPrior;
  currentValues: {
    selectedMode: AppMode;
    sensitivityProfile: SoundSensitivityProfile;
    trainingEndTime: string;
    estimatedSleepOnset: string;
    expectedWakeTime: string;
    nextOrActiveCueWindow: string;
    cueDelay: string;
    cueIntervalRange: string;
    currentEngineStatus: string;
    latestDecisionReason: string;
    lastCueTime: string;
    nextCheckTime: string;
    cueCountTonight: string;
    cueBudget: string;
    currentVolumeLevel: string;
    volumeRamp: string;
    volumeCap: string;
    movementPauseStatus: string;
    stableLowMovementSeconds: string;
    cueAssociatedMovementPause: string;
    userReportedAwakeningPause: string;
    suppressionReason: string;
    healthHistoryCalibrationStatus: string;
    sleepPriorSource: string;
    nextPredictedRemWindow: string;
    cueWindowSource: string;
    sleepPriorConfidence: string;
    historicalRemWindowScore: string;
    latestDecisionUsedHistoricalSleep: string;
  };
  scoreRows: Array<{ label: string; value: string }>;
  decisionLogLine: string;
}

export const ENGINE_SETTINGS_KEY = "tlr_engine_settings_v1";

const defaultSettingsByProfile: Record<
  SoundSensitivityProfile,
  Pick<
    CueDecisionSettings,
    | "volumeStartLevel"
    | "volumeRampPerCue"
    | "volumeCap"
    | "maxCuesPerNight"
  >
> = {
  sensitive: {
    volumeStartLevel: volumeProfiles.sensitive.startLevel,
    volumeRampPerCue: volumeProfiles.sensitive.rampPerCue,
    volumeCap: volumeProfiles.sensitive.cap,
    maxCuesPerNight: cueBudget.maxCuesPerNight.sensitive,
  },
  standard: {
    volumeStartLevel: volumeProfiles.standard.startLevel,
    volumeRampPerCue: volumeProfiles.standard.rampPerCue,
    volumeCap: volumeProfiles.standard.cap,
    maxCuesPerNight: cueBudget.maxCuesPerNight.standard,
  },
  hard_to_wake: {
    volumeStartLevel: volumeProfiles.hard_to_wake.startLevel,
    volumeRampPerCue: volumeProfiles.hard_to_wake.rampPerCue,
    volumeCap: volumeProfiles.hard_to_wake.cap,
    maxCuesPerNight: cueBudget.maxCuesPerNight.hard_to_wake,
  },
};

export function createDefaultEngineSettings(
  soundSensitivity: SoundSensitivityProfile = "standard",
): CueDecisionSettings {
  const profile = defaultSettingsByProfile[soundSensitivity];

  return {
    soundSensitivity,
    typicalBedtime: "23:00",
    typicalWakeTime: "07:00",
    typicalSleepDurationHours: 8,
    selfReportedSleepLatencyMinutes: 20,
    cueStartDelayHoursAfterTraining: phoneCueing.cueStartDelayHoursAfterTraining,
    cueIntervalRangeSeconds: phoneCueing.cueIntervalRangeSeconds,
    minimumSecondsSinceLastCue: phoneCueing.minimumSecondsSinceLastCue,
    userInteractionSuppressionSeconds:
      phoneCueing.userInteractionSuppressionSeconds,
    stableLowMovementRequiredSeconds:
      phoneCueing.stableLowMovementRequiredSeconds,
    cueAssociatedMovementWindowSeconds:
      phoneCueing.cueAssociatedMovementWindowSeconds,
    cueAssociatedMovementPauseSeconds:
      phoneCueing.cueAssociatedMovementPauseSeconds,
    userReportedAwakeningPauseSeconds:
      phoneCueing.userReportedAwakeningPauseSeconds,
    phoneAudioBedVolume: 0.03,
    phoneScoreThreshold: 0.7,
    remThreshold: watchCueing.defaultRemThreshold,
    minimumWatchSleepProbability: watchCueing.minimumSleepProbability,
    watchLikelyRemSuppressionEpochs:
      watchCueing.consecutiveLikelyRemSuppressionThreshold,
    volumeStartLevel: profile.volumeStartLevel,
    volumeRampPerCue: profile.volumeRampPerCue,
    volumeCap: profile.volumeCap,
    maxPhoneCuesPerBlock: cueBudget.maxPhoneCuesPerBlock,
    maxPhoneBlockDurationMinutes: cueBudget.maxPhoneBlockDurationMinutes,
    minRestBetweenCueBlocksMinutes: cueBudget.minRestBetweenCueBlocksMinutes,
    maxCuesPerNight: profile.maxCuesPerNight,
  };
}

export function normalizeEngineSettings(
  settings: CueDecisionSettings,
): CueDecisionSettings {
  const minInterval = Math.max(5, Math.round(settings.cueIntervalRangeSeconds[0]));
  const maxInterval = Math.max(
    minInterval,
    Math.round(settings.cueIntervalRangeSeconds[1]),
  );
  const phoneAudioBedVolume =
    typeof settings.phoneAudioBedVolume === "number"
      ? settings.phoneAudioBedVolume
      : 0.03;
  const volumeStartLevel = clamp(settings.volumeStartLevel, 0, 1);
  const volumeRampPerCue =
    settings.volumeRampPerCue > 0.02
      ? settings.volumeRampPerCue / 100
      : settings.volumeRampPerCue;

  return {
    ...settings,
    typicalSleepDurationHours: clamp(settings.typicalSleepDurationHours, 4, 12),
    selfReportedSleepLatencyMinutes: clamp(
      settings.selfReportedSleepLatencyMinutes,
      0,
      120,
    ),
    cueStartDelayHoursAfterTraining: clamp(
      settings.cueStartDelayHoursAfterTraining,
      4,
      9,
    ),
    cueIntervalRangeSeconds: [minInterval, maxInterval],
    minimumSecondsSinceLastCue: Math.max(
      5,
      Math.round(settings.minimumSecondsSinceLastCue),
    ),
    userInteractionSuppressionSeconds: Math.max(
      0,
      Math.round(settings.userInteractionSuppressionSeconds),
    ),
    stableLowMovementRequiredSeconds: Math.max(
      0,
      Math.round(settings.stableLowMovementRequiredSeconds),
    ),
    cueAssociatedMovementWindowSeconds: Math.max(
      0,
      Math.round(settings.cueAssociatedMovementWindowSeconds),
    ),
    cueAssociatedMovementPauseSeconds: Math.max(
      0,
      Math.round(settings.cueAssociatedMovementPauseSeconds),
    ),
    userReportedAwakeningPauseSeconds: Math.max(
      0,
      Math.round(settings.userReportedAwakeningPauseSeconds),
    ),
    phoneAudioBedVolume: clamp(phoneAudioBedVolume, 0.01, 0.2),
    phoneScoreThreshold: clamp(settings.phoneScoreThreshold, 0, 1),
    remThreshold: clamp(settings.remThreshold, 0, 1),
    minimumWatchSleepProbability: clamp(
      settings.minimumWatchSleepProbability,
      0,
      1,
    ),
    watchLikelyRemSuppressionEpochs: Math.max(
      1,
      Math.round(settings.watchLikelyRemSuppressionEpochs),
    ),
    volumeStartLevel,
    volumeRampPerCue: clamp(volumeRampPerCue, 0, 1),
    volumeCap: clamp(settings.volumeCap, volumeStartLevel, 1),
    maxPhoneCuesPerBlock: Math.max(1, Math.round(settings.maxPhoneCuesPerBlock)),
    maxPhoneBlockDurationMinutes: Math.max(
      1,
      Math.round(settings.maxPhoneBlockDurationMinutes),
    ),
    minRestBetweenCueBlocksMinutes: Math.max(
      0,
      Math.round(settings.minRestBetweenCueBlocksMinutes),
    ),
    maxCuesPerNight: Math.max(1, Math.round(settings.maxCuesPerNight)),
  };
}

export function getProfileDefaults(
  soundSensitivity: SoundSensitivityProfile,
): Pick<
  CueDecisionSettings,
  "volumeStartLevel" | "volumeRampPerCue" | "volumeCap" | "maxCuesPerNight"
> {
  return defaultSettingsByProfile[soundSensitivity];
}

export function emptyScoreBreakdown(): ScoreBreakdown {
  return {
    timeOpportunityScore: 0,
    historicalRemWindowScore: 0,
    movementStabilityScore: 0,
    noInteractionScore: 0,
    sleepPriorScore: 0,
    userToleranceScore: 0,
    cueBudgetScore: 0,
  };
}

export function isCueingSessionActive(session: NightSession | null): boolean {
  if (!session || session.sessionType !== "tlr") {
    return false;
  }

  return (
    session.status === "waiting_for_cue_window" ||
    session.status === "cueing" ||
    session.status === "paused_for_movement" ||
    session.status === "paused_after_awakening"
  );
}

export function addSeconds(iso: string, seconds: number): string {
  return new Date(Date.parse(iso) + seconds * 1000).toISOString();
}

export function secondsBetween(startIso: string, endIso: string): number {
  return Math.floor((Date.parse(endIso) - Date.parse(startIso)) / 1000);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function formatReason(reason: CueDecisionReason): string {
  return reason.replaceAll("_", " ");
}

export function buildCueId(): string {
  return `${cueAudio.defaultCueId}-${TLR_PROTOCOL_VERSION}`;
}
