import type {
  CueBudgetState,
  CueDecisionContext,
  CueDecisionReason,
} from "./CueDecisionTypes";
import { addSeconds } from "./CueDecisionTypes";

export interface CueBudgetGateResult {
  blocked: boolean;
  reason: CueDecisionReason;
  nextCheckAt: string;
  state: CueBudgetState;
}

export function buildCueBudgetState(context: CueDecisionContext): CueBudgetState {
  const { cueHistory, now, settings } = context;
  const nowMs = Date.parse(now);
  const cuesRemainingTonight = Math.max(
    0,
    settings.maxCuesPerNight - cueHistory.numberOfCuesTonight,
  );
  const blockStartedAt =
    cueHistory.currentBlockStartedAt ?? cueHistory.lastCueTime;
  const blockEndsAt = blockStartedAt
    ? addSeconds(blockStartedAt, settings.maxPhoneBlockDurationMinutes * 60)
    : undefined;
  const cueCountExhausted =
    cueHistory.numberOfCuesInCurrentBlock >= settings.maxPhoneCuesPerBlock;
  const durationExhausted = Boolean(
    blockEndsAt && nowMs >= Date.parse(blockEndsAt),
  );
  let restStartedAt: string | undefined;

  if (cueCountExhausted && cueHistory.lastCueTime) {
    restStartedAt = cueHistory.lastCueTime;
  } else if (durationExhausted) {
    restStartedAt = blockEndsAt;
  }

  const blockRestUntil =
    restStartedAt
      ? addSeconds(
          restStartedAt,
          settings.minRestBetweenCueBlocksMinutes * 60,
        )
      : undefined;
  const isBlockResting =
    Boolean(blockRestUntil) && Date.parse(blockRestUntil ?? now) > nowMs;
  const hasCompletedBlockRest =
    Boolean(blockRestUntil) && Date.parse(blockRestUntil ?? now) <= nowMs;
  const isBlockBudgetExhausted =
    !hasCompletedBlockRest && (cueCountExhausted || durationExhausted);

  return {
    cuesTonight: cueHistory.numberOfCuesTonight,
    maxCuesTonight: settings.maxCuesPerNight,
    cuesRemainingTonight,
    cuesInCurrentBlock: hasCompletedBlockRest
      ? 0
      : cueHistory.numberOfCuesInCurrentBlock,
    maxCuesPerBlock: settings.maxPhoneCuesPerBlock,
    blockStartedAt: hasCompletedBlockRest ? undefined : blockStartedAt,
    blockEndsAt: hasCompletedBlockRest ? undefined : blockEndsAt,
    blockRestUntil: hasCompletedBlockRest ? undefined : blockRestUntil,
    isNightlyBudgetExhausted: cuesRemainingTonight <= 0,
    isBlockBudgetExhausted,
    isBlockResting,
  };
}

export function evaluateCueBudgetGate(
  context: CueDecisionContext,
): CueBudgetGateResult | null {
  const state = buildCueBudgetState(context);

  if (state.isNightlyBudgetExhausted || state.isBlockResting) {
    return {
      blocked: true,
      reason: "cue_budget_exhausted",
      nextCheckAt:
        state.blockRestUntil ??
        addSeconds(
          context.now,
          context.settings.minRestBetweenCueBlocksMinutes * 60,
        ),
      state,
    };
  }

  return null;
}
