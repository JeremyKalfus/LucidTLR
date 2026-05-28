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
  const cuesRemainingTonight = Math.max(
    0,
    settings.maxCuesPerNight - cueHistory.numberOfCuesTonight,
  );
  const blockStartedAt =
    cueHistory.currentBlockStartedAt ?? cueHistory.lastCueTime;
  const blockEndsAt = blockStartedAt
    ? addSeconds(blockStartedAt, settings.maxPhoneBlockDurationMinutes * 60)
    : undefined;
  const isBlockBudgetExhausted =
    cueHistory.numberOfCuesInCurrentBlock >= settings.maxPhoneCuesPerBlock ||
    Boolean(blockEndsAt && Date.parse(now) >= Date.parse(blockEndsAt));
  const blockRestUntil =
    cueHistory.lastCueTime && isBlockBudgetExhausted
      ? addSeconds(
          cueHistory.lastCueTime,
          settings.minRestBetweenCueBlocksMinutes * 60,
        )
      : undefined;
  const isBlockResting =
    Boolean(blockRestUntil) && Date.parse(blockRestUntil ?? now) > Date.parse(now);

  return {
    cuesTonight: cueHistory.numberOfCuesTonight,
    maxCuesTonight: settings.maxCuesPerNight,
    cuesRemainingTonight,
    cuesInCurrentBlock: cueHistory.numberOfCuesInCurrentBlock,
    maxCuesPerBlock: settings.maxPhoneCuesPerBlock,
    blockStartedAt,
    blockEndsAt,
    blockRestUntil,
    isNightlyBudgetExhausted: cuesRemainingTonight <= 0,
    isBlockBudgetExhausted,
    isBlockResting,
  };
}

export function evaluateCueBudgetGate(
  context: CueDecisionContext,
): CueBudgetGateResult | null {
  const state = buildCueBudgetState(context);

  if (
    state.isNightlyBudgetExhausted ||
    state.isBlockResting ||
    state.isBlockBudgetExhausted
  ) {
    return {
      blocked: true,
      reason: "cue_budget_exhausted",
      nextCheckAt:
        state.blockRestUntil ??
        addSeconds(context.now, context.settings.minRestBetweenCueBlocksMinutes * 60),
      state,
    };
  }

  return null;
}
