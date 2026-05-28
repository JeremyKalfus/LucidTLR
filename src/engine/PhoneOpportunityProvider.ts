import type {
  CueDecisionContext,
  ScoreBreakdown,
  SleepTimingPrior,
} from "./CueDecisionTypes";
import { clamp } from "./CueDecisionTypes";
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

export function scorePhoneOpportunity(input: {
  context: CueDecisionContext;
  timing: SleepTimingPrior;
  movement: MovementGateState;
  budget: CueBudgetState;
}): { score: number; breakdown: ScoreBreakdown } {
  const { budget, context, movement, timing } = input;
  const trainingEndedAt = context.session?.trainingEndedAt ?? context.now;
  const breakdown: ScoreBreakdown = {
    timeOpportunityScore: scoreTimeOpportunity(
      context.now,
      trainingEndedAt,
      timing,
    ),
    movementStabilityScore: clamp(
      movement.stableLowMovementSeconds /
        Math.max(1, movement.requiredStableLowMovementSeconds),
      0,
      1,
    ),
    noInteractionScore: movement.userInteractionSuppressionActive ? 0 : 1,
    userToleranceScore: scoreUserTolerance(context),
    cueBudgetScore: clamp(
      budget.cuesRemainingTonight / Math.max(1, budget.maxCuesTonight),
      0,
      1,
    ),
  };
  const score =
    (breakdown.timeOpportunityScore +
      breakdown.movementStabilityScore +
      breakdown.noInteractionScore +
      breakdown.userToleranceScore +
      breakdown.cueBudgetScore) /
    5;

  return { score, breakdown };
}
