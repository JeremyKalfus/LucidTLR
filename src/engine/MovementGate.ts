import type {
  CueDecisionContext,
  CueDecisionReason,
  MovementGateState,
} from "./CueDecisionTypes";
import { addSeconds, secondsBetween } from "./CueDecisionTypes";

const largeMovementThreshold = 0.7;

export interface MovementGateResult {
  blocked: boolean;
  action: "pause" | "suppress";
  reason: CueDecisionReason;
  activePauseUntil?: string;
  nextCheckAt: string;
  state: MovementGateState;
}

export function evaluateMovementGate(
  context: CueDecisionContext,
): MovementGateResult | null {
  const { movement, now, settings, userFeedback } = context;
  const userInteractionSuppressionUntil = movement.lastUserInteractionAt
    ? addSeconds(
        movement.lastUserInteractionAt,
        settings.userInteractionSuppressionSeconds,
      )
    : undefined;
  const recentInteractionByTime =
    Boolean(userInteractionSuppressionUntil) &&
    Date.parse(userInteractionSuppressionUntil ?? now) > Date.parse(now);
  const userInteractionSuppressionActive =
    movement.phonePickedUpRecently ||
    movement.orientationChangedRecently ||
    recentInteractionByTime;
  const lastCueTime = context.cueHistory.lastCueTime;
  const movementAfterLastCueAt = movement.movementAfterLastCueAt;
  const movementWasCueAssociated =
    Boolean(lastCueTime && movementAfterLastCueAt) &&
    secondsBetween(lastCueTime ?? now, movementAfterLastCueAt ?? now) >= 0 &&
    secondsBetween(lastCueTime ?? now, movementAfterLastCueAt ?? now) <=
      settings.cueAssociatedMovementWindowSeconds;
  const cueAssociatedMovementPauseUntil =
    movementWasCueAssociated && movementAfterLastCueAt
      ? addSeconds(
          movementAfterLastCueAt,
          settings.cueAssociatedMovementPauseSeconds,
        )
      : undefined;
  const cueAssociatedMovementPauseActive =
    Boolean(cueAssociatedMovementPauseUntil) &&
    Date.parse(cueAssociatedMovementPauseUntil ?? now) > Date.parse(now);
  const awakeningPauseUntil =
    userFeedback.cueWokeUser &&
    userFeedback.returnedToSleep &&
    userFeedback.cueWokeUserReportedAt
      ? addSeconds(
          userFeedback.cueWokeUserReportedAt,
          settings.userReportedAwakeningPauseSeconds,
        )
      : undefined;
  const awakeningPauseActive =
    Boolean(awakeningPauseUntil) &&
    Date.parse(awakeningPauseUntil ?? now) > Date.parse(now);
  const isLargeMovement =
    movement.recentMovementIntensity >= largeMovementThreshold ||
    Boolean(movement.largeMovementEvents?.length);
  const stableMovementMissing =
    movement.stableLowMovementSeconds <
    settings.stableLowMovementRequiredSeconds;
  const state: MovementGateState = {
    recentMovementIntensity: movement.recentMovementIntensity,
    largeMovementThreshold,
    stableLowMovementSeconds: movement.stableLowMovementSeconds,
    requiredStableLowMovementSeconds: settings.stableLowMovementRequiredSeconds,
    movementPauseActive: isLargeMovement || stableMovementMissing,
    movementPauseUntil: stableMovementMissing
      ? addSeconds(
          now,
          settings.stableLowMovementRequiredSeconds -
            movement.stableLowMovementSeconds,
        )
      : undefined,
    cueAssociatedMovementPauseActive,
    cueAssociatedMovementPauseUntil,
    userInteractionSuppressionActive,
    userInteractionSuppressionUntil,
  };

  if (userInteractionSuppressionActive) {
    return {
      blocked: true,
      action: "suppress",
      reason: "user_interaction",
      nextCheckAt: userInteractionSuppressionUntil ?? addSeconds(now, 30),
      state,
    };
  }

  if (cueAssociatedMovementPauseActive) {
    return {
      blocked: true,
      action: "pause",
      reason: "cue_associated_movement",
      activePauseUntil: cueAssociatedMovementPauseUntil,
      nextCheckAt: cueAssociatedMovementPauseUntil ?? addSeconds(now, 30),
      state,
    };
  }

  if (awakeningPauseActive) {
    return {
      blocked: true,
      action: "pause",
      reason: "post_awakening_pause",
      activePauseUntil: awakeningPauseUntil,
      nextCheckAt: awakeningPauseUntil ?? addSeconds(now, 30),
      state,
    };
  }

  if (isLargeMovement || stableMovementMissing) {
    return {
      blocked: true,
      action: "pause",
      reason: "movement",
      activePauseUntil: state.movementPauseUntil,
      nextCheckAt: state.movementPauseUntil ?? addSeconds(now, 30),
      state,
    };
  }

  return null;
}

export function buildMovementGateState(
  context: CueDecisionContext,
): MovementGateState {
  return (
    evaluateMovementGate(context)?.state ?? {
      recentMovementIntensity: context.movement.recentMovementIntensity,
      largeMovementThreshold,
      stableLowMovementSeconds: context.movement.stableLowMovementSeconds,
      requiredStableLowMovementSeconds:
        context.settings.stableLowMovementRequiredSeconds,
      movementPauseActive: false,
      cueAssociatedMovementPauseActive: false,
      userInteractionSuppressionActive: false,
    }
  );
}
