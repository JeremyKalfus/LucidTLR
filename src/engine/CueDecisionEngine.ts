import type {
  CueDecision,
  CueDecisionContext,
  CueDecisionReason,
  MovementGateState,
  ScoreBreakdown,
  SleepTimingPrior,
  WatchDecisionState,
} from "./CueDecisionTypes";
import {
  addSeconds,
  buildCueId,
  emptyScoreBreakdown,
  isCueingSessionActive,
} from "./CueDecisionTypes";
import {
  buildCueBudgetState,
  evaluateCueBudgetGate,
} from "./CueBudgetController";
import { buildMovementGateState, evaluateMovementGate } from "./MovementGate";
import { scorePhoneOpportunity } from "./PhoneOpportunityProvider";
import { buildSleepTimingPrior } from "./SleepTimingPrior";
import { buildVolumeState } from "./VolumeController";
import { evaluateWatchOpportunity } from "./WatchOpportunityProvider";

function fallbackSleepTiming(context: CueDecisionContext): SleepTimingPrior {
  const trainingEndedAt = context.session?.trainingEndedAt ?? context.now;

  return buildSleepTimingPrior({
    trainingEndedAt,
    settings: context.settings,
  });
}

function buildDecision(input: {
  context: CueDecisionContext;
  action: CueDecision["action"];
  reason: CueDecisionReason;
  timing: SleepTimingPrior;
  movement: MovementGateState;
  scoreBreakdown?: ScoreBreakdown;
  opportunityScore?: number;
  nextCheckAt?: string;
  activePauseUntil?: string;
  watch?: WatchDecisionState;
  cue?: boolean;
}): CueDecision {
  const {
    action,
    activePauseUntil,
    context,
    cue,
    movement,
    nextCheckAt,
    opportunityScore = 0,
    reason,
    scoreBreakdown = emptyScoreBreakdown(),
    timing,
    watch,
  } = input;
  const budget = buildCueBudgetState(context);
  const volume = buildVolumeState(context);

  return {
    action,
    reason,
    cueId: cue ? buildCueId() : undefined,
    volumeLevel: cue ? volume.nextCueVolumeLevel : undefined,
    opportunityScore,
    scoreBreakdown,
    nextCheckAt: nextCheckAt ?? addSeconds(context.now, 30),
    activePauseUntil,
    sleepTiming: timing,
    movement,
    budget,
    volume,
    watch,
    metadata: {
      protocolVersion: context.session?.protocolVersion ?? null,
      mode: context.mode,
      threshold:
        context.mode === "watch"
          ? context.settings.remThreshold
          : context.settings.phoneScoreThreshold,
    },
  };
}

function evaluateRecentCueGate(context: CueDecisionContext): string | null {
  const lastCueTime = context.cueHistory.lastCueTime;

  if (!lastCueTime) {
    return null;
  }

  const nextAllowedCueAt = addSeconds(
    lastCueTime,
    context.settings.minimumSecondsSinceLastCue,
  );

  return Date.parse(nextAllowedCueAt) > Date.parse(context.now)
    ? nextAllowedCueAt
    : null;
}

export function evaluateCueDecision(context: CueDecisionContext): CueDecision {
  const timing = fallbackSleepTiming(context);
  const movementState = buildMovementGateState(context);

  if (!context.session || context.session.sessionType !== "tlr") {
    return buildDecision({
      context,
      action: "suppress",
      reason: "session_not_active",
      timing,
      movement: movementState,
    });
  }

  if (!context.session.trainingEndedAt) {
    return buildDecision({
      context,
      action: "suppress",
      reason: "before_training_finished",
      timing,
      movement: movementState,
    });
  }

  if (!isCueingSessionActive(context.session)) {
    return buildDecision({
      context,
      action: "suppress",
      reason: "session_not_active",
      timing,
      movement: movementState,
    });
  }

  if (Date.parse(context.now) < Date.parse(timing.likelyPhoneCueWindowStart)) {
    return buildDecision({
      context,
      action: "suppress",
      reason: "before_cue_window",
      timing,
      movement: movementState,
      nextCheckAt: timing.likelyPhoneCueWindowStart,
    });
  }

  const recentCueNextCheck = evaluateRecentCueGate(context);

  if (recentCueNextCheck) {
    return buildDecision({
      context,
      action: "suppress",
      reason: "recent_cue",
      timing,
      movement: movementState,
      nextCheckAt: recentCueNextCheck,
    });
  }

  const movementGate = evaluateMovementGate(context);

  if (movementGate) {
    return buildDecision({
      context,
      action: movementGate.action,
      reason: movementGate.reason,
      timing,
      movement: movementGate.state,
      nextCheckAt: movementGate.nextCheckAt,
      activePauseUntil: movementGate.activePauseUntil,
    });
  }

  const budgetGate = evaluateCueBudgetGate(context);

  if (budgetGate) {
    return buildDecision({
      context,
      action: "suppress",
      reason: budgetGate.reason,
      timing,
      movement: movementState,
      nextCheckAt: budgetGate.nextCheckAt,
    });
  }

  if (context.mode === "watch") {
    const watch = evaluateWatchOpportunity(context);

    if (!watch.eligible) {
      return buildDecision({
        context,
        action: "suppress",
        reason: watch.reason,
        timing,
        movement: movementState,
        watch: watch.state,
      });
    }

    return buildDecision({
      context,
      action: "play_cue",
      reason: "watch_likely_rem",
      timing,
      movement: movementState,
      watch: watch.state,
      opportunityScore: 1,
      cue: true,
      nextCheckAt: addSeconds(context.now, context.settings.cueIntervalRangeSeconds[0]),
    });
  }

  const budget = buildCueBudgetState(context);
  const { breakdown, score } = scorePhoneOpportunity({
    context,
    timing,
    movement: movementState,
    budget,
  });

  if (score >= context.settings.phoneScoreThreshold) {
    return buildDecision({
      context,
      action: "play_cue",
      reason: "phone_late_rem_opportunity",
      timing,
      movement: movementState,
      scoreBreakdown: breakdown,
      opportunityScore: score,
      cue: true,
      nextCheckAt: addSeconds(context.now, context.settings.cueIntervalRangeSeconds[0]),
    });
  }

  return buildDecision({
    context,
    action: "wait",
    reason: "outside_sleep_opportunity",
    timing,
    movement: movementState,
    scoreBreakdown: breakdown,
    opportunityScore: score,
    nextCheckAt: addSeconds(context.now, context.settings.cueIntervalRangeSeconds[1]),
  });
}
