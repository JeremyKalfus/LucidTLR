import type {
  CueDecisionContext,
  CueDecisionReason,
  WatchDecisionState,
} from "./CueDecisionTypes";

export interface WatchOpportunityResult {
  eligible: boolean;
  reason: CueDecisionReason;
  state: WatchDecisionState;
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

export function evaluateWatchOpportunity(
  context: CueDecisionContext,
): WatchOpportunityResult {
  const signal = context.watchSignal;

  if (!signal) {
    return {
      eligible: false,
      reason: "sensor_quality_bad",
      state: missingWatchState(context),
    };
  }

  const likelyRem =
    (signal.remProbability ?? 0) >= context.settings.remThreshold &&
    (signal.sleepProbability ?? 0) >= context.settings.minimumWatchSleepProbability;
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
  };

  if (signal.sensorQuality === "missing" || signal.sensorQuality === "bad") {
    return { eligible: false, reason: "sensor_quality_bad", state };
  }

  if (persistentRemSuppressionActive) {
    return { eligible: false, reason: "rem_persistent_suppression", state };
  }

  if (!likelyRem) {
    return { eligible: false, reason: "outside_sleep_opportunity", state };
  }

  return { eligible: true, reason: "watch_likely_rem", state };
}
