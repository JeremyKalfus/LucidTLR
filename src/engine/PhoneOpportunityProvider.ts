import type {
  CueDecisionContext,
  ScoreBreakdown,
  SleepTimingPrior,
} from "./CueDecisionTypes";
import { addSeconds, clamp } from "./CueDecisionTypes";
import type { CueBudgetState } from "./CueDecisionTypes";
import type { MovementGateState } from "./CueDecisionTypes";

function scoreTimeOpportunity(
  now: string,
  trainingEndedAt: string,
  timing: SleepTimingPrior,
): number {
  const nowMs = Date.parse(now);
  const trainingEndMs = Date.parse(trainingEndedAt);
  const hoursAfterTraining = (nowMs - trainingEndMs) / 3600000;
  const expectedWakeMs = Date.parse(timing.expectedWakeAt);
  const minutesUntilWake = (expectedWakeMs - nowMs) / 60000;

  if (minutesUntilWake <= 20) {
    return 0;
  }

  if (hoursAfterTraining < 5.5) {
    return 0;
  }

  if (hoursAfterTraining < 6) {
    return 0.6;
  }

  if (hoursAfterTraining <= 8) {
    return 1;
  }

  return nowMs < expectedWakeMs ? 0.8 : 0;
}

function scoreUserTolerance(context: CueDecisionContext): number {
  if (context.settings.soundSensitivity === "sensitive") {
    return context.userFeedback.cueWokeUser ? 0.4 : 0.8;
  }

  if (context.settings.soundSensitivity === "hard_to_wake") {
    return 1;
  }

  return context.userFeedback.cueWokeUser ? 0.6 : 1;
}

function scoreSleepPrior(now: string, timing: SleepTimingPrior): number {
  const nowMs = Date.parse(now);
  const expectedWakeCutoff = addSeconds(timing.expectedWakeAt, -20 * 60);

  return nowMs >= Date.parse(timing.estimatedSleepOnsetAt) &&
    nowMs < Date.parse(expectedWakeCutoff)
    ? 1
    : 0;
}

function scoreHistoricalRemWindow(input: {
  now: string;
  timing: SleepTimingPrior;
  fallbackScore: number;
}): number {
  const historicalWindows = input.timing.predictedRemWindows.filter(
    (window) => window.source === "historical_sleep",
  );

  if (!input.timing.historicalSleepPrior || historicalWindows.length === 0) {
    return input.fallbackScore;
  }

  const nowMs = Date.parse(input.now);
  const shoulderMs = 15 * 60 * 1000;
  const score = historicalWindows.reduce((bestScore, window) => {
    const startMs = Date.parse(window.startAt);
    const endMs = Date.parse(window.endAt);
    const confidence = clamp(window.confidence, 0, 1);

    if (nowMs >= startMs && nowMs <= endMs) {
      return Math.max(bestScore, confidence);
    }

    if (nowMs >= startMs - shoulderMs && nowMs <= endMs + shoulderMs) {
      return Math.max(bestScore, confidence * 0.5);
    }

    return bestScore;
  }, 0);

  return clamp(score, 0, 1);
}

export function scorePhoneOpportunity(input: {
  context: CueDecisionContext;
  timing: SleepTimingPrior;
  movement: MovementGateState;
  budget: CueBudgetState;
}): { score: number; breakdown: ScoreBreakdown } {
  const { budget, context, movement, timing } = input;
  const trainingEndedAt = context.session?.trainingEndedAt ?? context.now;
  const timeOpportunityScore = scoreTimeOpportunity(
    context.now,
    trainingEndedAt,
    timing,
  );
  const breakdown: ScoreBreakdown = {
    timeOpportunityScore,
    historicalRemWindowScore: scoreHistoricalRemWindow({
      now: context.now,
      timing,
      fallbackScore: timeOpportunityScore,
    }),
    movementStabilityScore: clamp(
      movement.stableLowMovementSeconds /
        Math.max(1, movement.requiredStableLowMovementSeconds),
      0,
      1,
    ),
    noInteractionScore: movement.userInteractionSuppressionActive ? 0 : 1,
    sleepPriorScore: scoreSleepPrior(context.now, timing),
    userToleranceScore: scoreUserTolerance(context),
    cueBudgetScore: clamp(
      budget.cuesRemainingTonight / Math.max(1, budget.maxCuesTonight),
      0,
      1,
    ),
  };
  const score =
    breakdown.timeOpportunityScore * 0.3 +
    breakdown.historicalRemWindowScore * 0.25 +
    breakdown.movementStabilityScore * 0.2 +
    breakdown.sleepPriorScore * 0.1 +
    breakdown.userToleranceScore * 0.05 +
    breakdown.cueBudgetScore * 0.1;

  return { score, breakdown };
}
