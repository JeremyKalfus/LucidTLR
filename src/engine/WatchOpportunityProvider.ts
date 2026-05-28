import type {
  CueDecisionContext,
  CueDecisionReason,
  SleepTimingPrior,
  WatchDecisionState,
  WatchScoreBreakdown,
} from "./CueDecisionTypes";
import { addSeconds, clamp } from "./CueDecisionTypes";

export interface WatchOpportunityResult {
  eligible: boolean;
  action: "play_cue" | "pause" | "suppress";
  reason: CueDecisionReason;
  state: WatchDecisionState;
  score: number;
  nextCheckAt?: string;
  activePauseUntil?: string;
}

function missingWatchState(context: CueDecisionContext): WatchDecisionState {
  return {
    remThreshold: context.settings.remThreshold,
    minimumSleepProbability: context.settings.minimumWatchSleepProbability,
    sensorQuality: "missing",
    stableLowMovementSeconds: context.movement.stableLowMovementSeconds,
    consecutiveLikelyRemEpochs: 0,
    persistentRemSuppressionActive: false,
    connectivityState: "unknown",
  };
}

function scoreSleepPrior(
  context: CueDecisionContext,
  timing: SleepTimingPrior,
): number {
  const nowMs = Date.parse(context.now);
  const expectedWakeCutoff = addSeconds(timing.expectedWakeAt, -20 * 60);

  return nowMs >= Date.parse(timing.estimatedSleepOnsetAt) &&
    nowMs < Date.parse(expectedWakeCutoff)
    ? 1
    : 0;
}

function scoreWatchOpportunity(
  context: CueDecisionContext,
  timing: SleepTimingPrior,
): { score: number; breakdown: WatchScoreBreakdown } {
  const signal = context.watchSignal;
  const normalizedRemScore = clamp(
    (signal?.remProbability ?? 0) /
      Math.max(0.01, context.settings.remThreshold),
    0,
    1,
  );
  const sleepProbabilityScore = clamp(signal?.sleepProbability ?? 0, 0, 1);
  const watchMovementStabilityScore = clamp(
    (signal?.stableLowMovementSeconds ?? 0) /
      Math.max(1, context.settings.stableLowMovementRequiredSeconds),
    0,
    1,
  );
  const breakdown = {
    normalizedRemScore,
    sleepProbabilityScore,
    watchMovementStabilityScore,
    sleepPriorScore: scoreSleepPrior(context, timing),
  };
  const score =
    breakdown.normalizedRemScore * 0.45 +
    breakdown.sleepProbabilityScore * 0.25 +
    breakdown.watchMovementStabilityScore * 0.2 +
    breakdown.sleepPriorScore * 0.1;

  return { score, breakdown };
}

export function evaluateWatchOpportunity(
  context: CueDecisionContext,
  timing: SleepTimingPrior,
): WatchOpportunityResult {
  const signal = context.watchSignal;
  const { breakdown, score } = scoreWatchOpportunity(context, timing);

  if (!signal) {
    return {
      eligible: false,
      action: "suppress",
      reason: "sensor_quality_bad",
      state: missingWatchState(context),
      score,
    };
  }

  const likelyRem =
    (signal.remProbability ?? 0) >= context.settings.remThreshold &&
    (signal.sleepProbability ?? 0) >=
      context.settings.minimumWatchSleepProbability;
  const persistentRemSuppressionActive =
    likelyRem &&
    signal.consecutiveLikelyRemEpochs >=
      context.settings.watchLikelyRemSuppressionEpochs;
  const state: WatchDecisionState = {
    remProbability: signal.remProbability,
    remThreshold: context.settings.remThreshold,
    sleepProbability: signal.sleepProbability,
    minimumSleepProbability: context.settings.minimumWatchSleepProbability,
    sensorQuality: signal.sensorQuality,
    stableLowMovementSeconds: signal.stableLowMovementSeconds,
    consecutiveLikelyRemEpochs: signal.consecutiveLikelyRemEpochs,
    persistentRemSuppressionActive,
    connectivityState: signal.connectivityState,
    watchBatteryLevel: signal.watchBatteryLevel,
    opportunityScore: score,
    scoreBreakdown: breakdown,
  };

  if (signal.sensorQuality === "missing" || signal.sensorQuality === "bad") {
    return {
      eligible: false,
      action: "suppress",
      reason: "sensor_quality_bad",
      state,
      score,
    };
  }

  if (
    signal.stableLowMovementSeconds <
    context.settings.stableLowMovementRequiredSeconds
  ) {
    const activePauseUntil = addSeconds(
      context.now,
      context.settings.stableLowMovementRequiredSeconds -
        signal.stableLowMovementSeconds,
    );

    return {
      eligible: false,
      action: "pause",
      reason: "movement",
      state,
      score,
      activePauseUntil,
      nextCheckAt: activePauseUntil,
    };
  }

  if (persistentRemSuppressionActive) {
    return {
      eligible: false,
      action: "suppress",
      reason: "rem_persistent_suppression",
      state,
      score,
    };
  }

  if (!likelyRem) {
    return {
      eligible: false,
      action: "suppress",
      reason: "outside_sleep_opportunity",
      state,
      score,
    };
  }

  return {
    eligible: true,
    action: "play_cue",
    reason: "watch_likely_rem",
    state,
    score,
  };
}
