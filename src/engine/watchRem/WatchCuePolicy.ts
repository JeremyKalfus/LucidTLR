import { addSeconds } from "@/src/engine/CueDecisionTypes";

import type { WatchCuePolicyDecision, WatchCuePolicyInput } from "./WatchRemTypes";

export function evaluateWatchCuePolicy(
  input: WatchCuePolicyInput,
): WatchCuePolicyDecision {
  const likelyRem = input.prediction.remLabel === "likely_rem";
  const consecutiveLikelyRemEpochs = likelyRem
    ? input.state.consecutiveLikelyRemEpochs + 1
    : 0;
  const persistentRemSuppressionActive =
    consecutiveLikelyRemEpochs >=
    input.settings.consecutiveLikelyRemSuppressionThreshold;

  function suppress(
    reason: WatchCuePolicyDecision["reason"],
    nextCheckAt?: string,
  ): WatchCuePolicyDecision {
    return {
      action: "suppress",
      reason,
      shouldPlayCue: false,
      consecutiveLikelyRemEpochs,
      persistentRemSuppressionActive,
      nextCheckAt,
    };
  }

  if (!input.prediction.modelAvailable || input.prediction.remLabel === "unknown") {
    return suppress("classifier_unavailable");
  }

  if (
    input.settings.earliestCueAt &&
    Date.parse(input.now) < Date.parse(input.settings.earliestCueAt)
  ) {
    return suppress("outside_sleep_opportunity", input.settings.earliestCueAt);
  }

  if (
    input.settings.stopAt &&
    Date.parse(input.now) >= Date.parse(input.settings.stopAt)
  ) {
    return suppress("outside_sleep_opportunity");
  }

  if (input.sensorQuality === "missing" || input.sensorQuality === "bad") {
    return suppress("sensor_quality_bad");
  }

  if (
    typeof input.settings.batteryPct === "number" &&
    typeof input.settings.disableCueingBelowPct === "number" &&
    input.settings.batteryPct <= input.settings.disableCueingBelowPct
  ) {
    return suppress("sensor_quality_bad");
  }

  if (
    input.stableLowMovementSeconds <
    input.settings.stableLowMovementRequiredSeconds
  ) {
    const remainingSeconds =
      input.settings.stableLowMovementRequiredSeconds -
      input.stableLowMovementSeconds;

    return {
      action: "pause",
      reason: "movement",
      shouldPlayCue: false,
      consecutiveLikelyRemEpochs,
      persistentRemSuppressionActive,
      nextCheckAt: addSeconds(input.now, remainingSeconds),
    };
  }

  if (!input.audioRuntimeActive) {
    return suppress("audio_runtime_unavailable");
  }

  if (input.cueHistory.cueCountTonight >= input.settings.maxCuesTonight) {
    return suppress("cue_budget_exhausted");
  }

  if (
    input.cueHistory.cueAssociatedMovementPauseUntil &&
    Date.parse(input.cueHistory.cueAssociatedMovementPauseUntil) > Date.parse(input.now)
  ) {
    return suppress(
      "cue_associated_movement",
      input.cueHistory.cueAssociatedMovementPauseUntil,
    );
  }

  if (input.cueHistory.lastCueAt) {
    const nextCueAt = addSeconds(
      input.cueHistory.lastCueAt,
      input.settings.minimumSecondsSinceLastCue,
    );

    if (Date.parse(nextCueAt) > Date.parse(input.now)) {
      return suppress("recent_cue", nextCueAt);
    }
  }

  if (
    input.prediction.sleepProbability !== undefined &&
    input.settings.minimumSleepProbability !== undefined &&
    input.prediction.sleepProbability < input.settings.minimumSleepProbability
  ) {
    return suppress("outside_sleep_opportunity");
  }

  if (persistentRemSuppressionActive) {
    return suppress("rem_persistent_suppression");
  }

  if (
    input.prediction.remProbability === undefined ||
    input.prediction.remProbability < input.settings.remThreshold
  ) {
    return suppress("outside_sleep_opportunity");
  }

  return {
    action: "play_cue",
    reason: "watch_likely_rem",
    shouldPlayCue: true,
    consecutiveLikelyRemEpochs,
    persistentRemSuppressionActive,
  };
}
