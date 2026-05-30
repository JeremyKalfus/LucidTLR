import type {
  CueDecision,
  CueDecisionContext,
  EngineSnapshot,
  ScoreBreakdown,
} from "./CueDecisionTypes";
import { emptyScoreBreakdown, formatReason } from "./CueDecisionTypes";
import { buildCueBudgetState } from "./CueBudgetController";
import { buildMovementGateState } from "./MovementGate";
import { buildSleepTimingPrior } from "./SleepTimingPrior";
import { buildVolumeState } from "./VolumeController";

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

  const percent = value * 100;
  const precision = percent > 0 && percent < 1 ? 2 : 1;
  const formatted = percent.toFixed(Number.isInteger(percent) ? 0 : precision);

  return `${formatted.includes(".")
    ? formatted.replace(/0+$/, "").replace(/\.$/, "")
    : formatted}%`;
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

function formatPhoneScoreRows(breakdown: ScoreBreakdown) {
  return [
    {
      label: "time opportunity",
      value: formatScore(breakdown.timeOpportunityScore),
    },
    {
      label: "historical REM window",
      value: formatScore(breakdown.historicalRemWindowScore),
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
      label: "sleep prior",
      value: formatScore(breakdown.sleepPriorScore),
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

function formatScoreRows(decision: CueDecision) {
  if (decision.watch?.scoreBreakdown) {
    return [
      {
        label: "watch REM",
        value: formatScore(decision.watch.scoreBreakdown.normalizedRemScore),
      },
      {
        label: "watch sleep probability",
        value: formatScore(decision.watch.scoreBreakdown.sleepProbabilityScore),
      },
      {
        label: "watch movement stability",
        value: formatScore(
          decision.watch.scoreBreakdown.watchMovementStabilityScore,
        ),
      },
      {
        label: "sleep prior",
        value: formatScore(decision.watch.scoreBreakdown.sleepPriorScore),
      },
      {
        label: "watch opportunity",
        value: formatScore(decision.watch.opportunityScore ?? 0),
      },
    ];
  }

  return formatPhoneScoreRows(decision.scoreBreakdown);
}

function formatWindow(start: string, end: string): string {
  return `${formatDateTime(start)} - ${formatDateTime(end)}`;
}

function formatSource(value: string): string {
  return value.replaceAll("_", " ");
}

function formatNextPredictedRemWindow(
  decision: CueDecision,
  now: string,
): string {
  const nowMs = Date.parse(now);
  const window = decision.sleepTiming.predictedRemWindows
    .filter((candidate) => Date.parse(candidate.endAt) >= nowMs)
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))[0];

  return window ? formatWindow(window.startAt, window.endAt) : "not available";
}

function formatHealthHistoryStatus(decision: CueDecision): string {
  const prior = decision.sleepTiming.historicalSleepPrior;

  if (!prior) {
    return "not connected";
  }

  return `${formatSource(prior.source)}; ${prior.nightsIncluded} nights; ${prior.confidence}`;
}

function formatPhoneNightCalibrationStatus(decision: CueDecision): string {
  const prior = decision.sleepTiming.phoneNightPrior;

  if (!prior || prior.nightsIncluded === 0) {
    return "not enough Phone Mode nights";
  }

  return `${prior.nightsIncluded} local night${prior.nightsIncluded === 1 ? "" : "s"}; ${prior.confidence}`;
}

function formatPhoneNightObservedEnd(decision: CueDecision): string {
  const minutes =
    decision.sleepTiming.phoneNightPrior?.medianObservedEndMinutesAfterTraining;

  return typeof minutes === "number"
    ? `${Math.round(minutes / 60)}h after training`
    : "not available";
}

function formatPhoneNightQuietRuntime(decision: CueDecision): string {
  const prior = decision.sleepTiming.phoneNightPrior;

  if (!prior || prior.medianQuietRuntimeRatio === null) {
    return "not available";
  }

  const quiet = formatPercent(prior.medianQuietRuntimeRatio);
  const quietStart =
    typeof prior.medianQuietStartMinutesAfterTraining === "number"
      ? `; quiet after ${Math.round(prior.medianQuietStartMinutesAfterTraining)}m`
      : "";

  return `${quiet}${quietStart}`;
}

function formatPhoneNightBudgetAdjustment(decision: CueDecision): string {
  const prior = decision.sleepTiming.phoneNightPrior;

  if (!prior || prior.nightsIncluded === 0) {
    return "not available";
  }

  const exhausted = formatPercent(prior.budgetExhaustedRate);

  if (
    prior.recommendedMaxCuesPerNightMultiplier === 1 &&
    prior.recommendedVolumeMultiplier === 1
  ) {
    return `${exhausted} exhausted; no reduction`;
  }

  return `${exhausted} exhausted; conservative reduction active`;
}

function formatCueWindowSource(decision: CueDecision): string {
  if (decision.sleepTiming.source === "local_phone_runtime") {
    return "local Phone Mode timing plus protocol gate";
  }

  return decision.sleepTiming.predictedRemWindows.some(
    (window) => window.source === "historical_sleep",
  )
    ? "historical sleep plus protocol gate"
    : "default protocol";
}

function formatStatus(decision: CueDecision): string {
  if (decision.action === "idle") {
    return "engine idle";
  }

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

function formatInactiveStatus(context: CueDecisionContext): string {
  if (!context.session) {
    return "engine idle";
  }

  if (context.session.sessionType === "sleep_log") {
    return "sleep log only";
  }

  if (context.session.status === "setup") {
    return "setup";
  }

  if (context.session.status === "training") {
    return "training";
  }

  return "engine idle";
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
      healthHistoryCalibrationStatus: formatHealthHistoryStatus(decision),
      phoneNightCalibrationStatus: formatPhoneNightCalibrationStatus(decision),
      phoneNightObservedEnd: formatPhoneNightObservedEnd(decision),
      phoneNightQuietRuntime: formatPhoneNightQuietRuntime(decision),
      phoneNightBudgetAdjustment: formatPhoneNightBudgetAdjustment(decision),
      sleepPriorSource: formatSource(decision.sleepTiming.source),
      nextPredictedRemWindow: formatNextPredictedRemWindow(
        decision,
        context.now,
      ),
      cueWindowSource: formatCueWindowSource(decision),
      sleepPriorConfidence: decision.sleepTiming.confidence,
      historicalRemWindowScore: formatScore(
        decision.scoreBreakdown.historicalRemWindowScore,
      ),
      latestDecisionUsedHistoricalSleep: decision.sleepTiming.historicalSleepPrior
        ? "yes"
        : "no",
    },
    scoreRows: formatScoreRows(decision),
    decisionLogLine: `${formatDateTime(context.now)}: ${decision.action} / ${formatReason(
      decision.reason,
    )} / next ${formatSeconds(
      Math.max(0, (Date.parse(decision.nextCheckAt) - Date.parse(context.now)) / 1000),
    )}`,
  };
}

export function buildInactiveEngineSnapshot(input: {
  context: CueDecisionContext;
}): EngineSnapshot {
  const { context } = input;
  const trainingEndedAt = context.session?.trainingEndedAt ?? context.now;
  const sleepTiming = buildSleepTimingPrior({
    trainingEndedAt,
    settings: context.settings,
    historicalSleepPrior: context.historicalSleepPrior,
    phoneNightPrior: context.phoneNightPrior,
  });
  const decision: CueDecision = {
    action: "idle",
    reason: "none",
    opportunityScore: 0,
    scoreBreakdown: emptyScoreBreakdown(),
    nextCheckAt: context.now,
    sleepTiming,
    movement: buildMovementGateState(context),
    budget: buildCueBudgetState(context),
    volume: buildVolumeState(context),
    metadata: {
      protocolVersion: context.session?.protocolVersion ?? null,
      mode: context.mode,
      threshold: null,
    },
  };
  const snapshot = buildEngineSnapshot({ context, decision });
  const hasTrainingEnd = Boolean(context.session?.trainingEndedAt);

  return {
    ...snapshot,
    currentValues: {
      ...snapshot.currentValues,
      estimatedSleepOnset: hasTrainingEnd
        ? snapshot.currentValues.estimatedSleepOnset
        : "not available",
      expectedWakeTime: hasTrainingEnd
        ? snapshot.currentValues.expectedWakeTime
        : "not available",
      nextOrActiveCueWindow: hasTrainingEnd
        ? snapshot.currentValues.nextOrActiveCueWindow
        : "not scheduled",
      currentEngineStatus: formatInactiveStatus(context),
      latestDecisionReason: "none",
      nextCheckTime: "not scheduled",
      suppressionReason: "none",
    },
    decisionLogLine: "",
  };
}

export function formatEnginePercent(value: number | undefined): string {
  return formatPercent(value);
}

export function formatEngineDateTime(value: string | undefined): string {
  return formatDateTime(value);
}
