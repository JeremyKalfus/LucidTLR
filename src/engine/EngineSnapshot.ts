import type {
  CueDecision,
  CueDecisionContext,
  EngineSnapshot,
  ScoreBreakdown,
} from "./CueDecisionTypes";
import { formatReason } from "./CueDecisionTypes";

function formatDateTime(value: string | undefined): string {
  if (!value) {
    return "not available";
  }

  return new Date(value).toLocaleString();
}

function formatPercent(value: number | undefined): string {
  if (value === undefined) {
    return "not available";
  }

  return `${Math.round(value * 100)}%`;
}

function formatSeconds(value: number): string {
  if (value >= 3600) {
    return `${Math.round(value / 3600)}h`;
  }

  if (value >= 60) {
    return `${Math.round(value / 60)}m`;
  }

  return `${Math.round(value)}s`;
}

function formatScore(value: number): string {
  return value.toFixed(2);
}

function formatScoreRows(breakdown: ScoreBreakdown) {
  return [
    {
      label: "time opportunity",
      value: formatScore(breakdown.timeOpportunityScore),
    },
    {
      label: "movement stability",
      value: formatScore(breakdown.movementStabilityScore),
    },
    {
      label: "no interaction",
      value: formatScore(breakdown.noInteractionScore),
    },
    {
      label: "user tolerance",
      value: formatScore(breakdown.userToleranceScore),
    },
    {
      label: "cue budget",
      value: formatScore(breakdown.cueBudgetScore),
    },
  ];
}

function formatWindow(start: string, end: string): string {
  return `${formatDateTime(start)} - ${formatDateTime(end)}`;
}

function formatStatus(decision: CueDecision): string {
  if (decision.action === "play_cue") {
    return "cue eligible";
  }

  if (decision.action === "pause") {
    return `paused for ${formatReason(decision.reason)}`;
  }

  if (decision.action === "wait") {
    return "waiting";
  }

  return `suppressed: ${formatReason(decision.reason)}`;
}

export function buildEngineSnapshot(input: {
  context: CueDecisionContext;
  decision: CueDecision;
}): EngineSnapshot {
  const { context, decision } = input;
  const trainingEndTime = context.session?.trainingEndedAt;
  const userAwakeningPauseActive =
    context.userFeedback.cueWokeUser &&
    context.userFeedback.returnedToSleep &&
    decision.reason === "post_awakening_pause";

  return {
    evaluatedAt: context.now,
    mode: context.mode,
    sessionStatus: context.session?.status ?? "none",
    decision,
    sleepTiming: decision.sleepTiming,
    currentValues: {
      selectedMode: context.mode,
      sensitivityProfile: context.settings.soundSensitivity,
      trainingEndTime: formatDateTime(trainingEndTime),
      estimatedSleepOnset: formatDateTime(
        decision.sleepTiming.estimatedSleepOnsetAt,
      ),
      expectedWakeTime: formatDateTime(decision.sleepTiming.expectedWakeAt),
      nextOrActiveCueWindow: formatWindow(
        decision.sleepTiming.likelyPhoneCueWindowStart,
        decision.sleepTiming.likelyPhoneCueWindowEnd,
      ),
      cueDelay: `${context.settings.cueStartDelayHoursAfterTraining}h after training`,
      cueIntervalRange: `${context.settings.cueIntervalRangeSeconds[0]}-${context.settings.cueIntervalRangeSeconds[1]}s`,
      currentEngineStatus: formatStatus(decision),
      latestDecisionReason: formatReason(decision.reason),
      lastCueTime: formatDateTime(context.cueHistory.lastCueTime),
      nextCheckTime: formatDateTime(decision.nextCheckAt),
      cueCountTonight: `${decision.budget.cuesTonight} / ${decision.budget.maxCuesTonight}`,
      cueBudget: `${decision.budget.cuesRemainingTonight} remaining tonight`,
      currentVolumeLevel: formatPercent(decision.volume.currentVolumeLevel),
      volumeRamp: formatPercent(decision.volume.rampPerCue),
      volumeCap: formatPercent(decision.volume.cap),
      movementPauseStatus: decision.movement.movementPauseActive
        ? `active until ${formatDateTime(decision.movement.movementPauseUntil)}`
        : "off",
      stableLowMovementSeconds: `${decision.movement.stableLowMovementSeconds}s / ${decision.movement.requiredStableLowMovementSeconds}s`,
      cueAssociatedMovementPause: decision.movement
        .cueAssociatedMovementPauseActive
        ? `active until ${formatDateTime(
            decision.movement.cueAssociatedMovementPauseUntil,
          )}`
        : "off",
      userReportedAwakeningPause: userAwakeningPauseActive
        ? `active until ${formatDateTime(decision.activePauseUntil)}`
        : "off",
      suppressionReason:
        decision.action === "suppress" || decision.action === "pause"
          ? formatReason(decision.reason)
          : "none",
      healthHistoryCalibrationStatus: "not connected",
    },
    scoreRows: formatScoreRows(decision.scoreBreakdown),
    decisionLogLine: `${formatDateTime(context.now)}: ${decision.action} / ${formatReason(
      decision.reason,
    )} / next ${formatSeconds(
      Math.max(0, (Date.parse(decision.nextCheckAt) - Date.parse(context.now)) / 1000),
    )}`,
  };
}

export function formatEnginePercent(value: number | undefined): string {
  return formatPercent(value);
}

export function formatEngineDateTime(value: string | undefined): string {
  return formatDateTime(value);
}
