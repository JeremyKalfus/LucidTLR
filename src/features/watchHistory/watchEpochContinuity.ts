const DEFAULT_WATCH_EPOCH_GAP_THRESHOLD_SECONDS = 90;

export interface WatchEpochContinuityInput {
  epochStart: string;
  epochEnd: string;
}

export interface WatchEpochContinuitySummary {
  epochGaps: number;
  maxEpochGapSeconds: number;
  hasLargeEpochGap: boolean;
  largeEpochGapThresholdSeconds: number;
}

function secondsBetween(leftIso: string, rightIso: string): number | null {
  const left = Date.parse(leftIso);
  const right = Date.parse(rightIso);

  if (Number.isNaN(left) || Number.isNaN(right)) {
    return null;
  }

  return Math.max(0, (right - left) / 1000);
}

export function summarizeWatchEpochContinuity(
  epochs: WatchEpochContinuityInput[],
  largeEpochGapThresholdSeconds = DEFAULT_WATCH_EPOCH_GAP_THRESHOLD_SECONDS,
): WatchEpochContinuitySummary {
  const sorted = [...epochs].sort((left, right) =>
    left.epochStart.localeCompare(right.epochStart),
  );
  let epochGaps = 0;
  let maxEpochGapSeconds = 0;

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    const gapSeconds = secondsBetween(previous.epochEnd, current.epochStart);

    if (gapSeconds === null) {
      continue;
    }

    maxEpochGapSeconds = Math.max(maxEpochGapSeconds, gapSeconds);

    if (gapSeconds > largeEpochGapThresholdSeconds) {
      epochGaps += 1;
    }
  }

  return {
    epochGaps,
    maxEpochGapSeconds,
    hasLargeEpochGap: epochGaps > 0,
    largeEpochGapThresholdSeconds,
  };
}
