import type {
  CueDecisionSettings,
  HistoricalSleepPrior,
  PredictedRemWindow,
  SleepTimingConfidence,
  SleepTimingPrior,
  SleepTimingSource,
} from "./CueDecisionTypes";
import { addSeconds } from "./CueDecisionTypes";

const wakeBufferSeconds = 20 * 60;
const earliestHistoricalPhoneCueStartSeconds = 4 * 3600;

function parseTime(value: string): { hours: number; minutes: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());

  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return { hours, minutes };
}

function clockTimeAfter(anchorIso: string, time: string): string | null {
  const parsed = parseTime(time);

  if (!parsed) {
    return null;
  }

  const anchor = new Date(anchorIso);
  const candidate = new Date(anchor);

  candidate.setHours(parsed.hours, parsed.minutes, 0, 0);

  if (candidate.getTime() <= anchor.getTime()) {
    candidate.setDate(candidate.getDate() + 1);
  }

  return candidate.toISOString();
}

function clockMinutesAfter(anchorIso: string, minutesAfterMidnight: number): string {
  const anchor = new Date(anchorIso);
  const candidate = new Date(anchor);
  const minutes = Math.round(minutesAfterMidnight);

  candidate.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);

  if (candidate.getTime() <= anchor.getTime()) {
    candidate.setDate(candidate.getDate() + 1);
  }

  return candidate.toISOString();
}

function betterConfidence(
  current: SleepTimingConfidence,
  next: SleepTimingConfidence,
): SleepTimingConfidence {
  const rank: Record<SleepTimingConfidence, number> = {
    low: 1,
    medium: 2,
    high: 3,
  };

  return rank[next] > rank[current] ? next : current;
}

function timingConfidenceFromHistorical(
  prior: HistoricalSleepPrior,
): SleepTimingConfidence | null {
  if (prior.confidence === "high") {
    return "high";
  }

  if (prior.confidence === "medium") {
    return "medium";
  }

  if (prior.confidence === "low") {
    return "low";
  }

  return null;
}

function inferConfidence(settings: CueDecisionSettings): SleepTimingConfidence {
  if (
    settings.typicalBedtime !== "23:00" ||
    settings.typicalWakeTime !== "07:00" ||
    settings.typicalSleepDurationHours !== 8
  ) {
    return "medium";
  }

  return "low";
}

function inferSource(settings: CueDecisionSettings): SleepTimingSource {
  return inferConfidence(settings) === "medium" ? "self_report" : "default";
}

function isUsableHistoricalPrior(
  prior: HistoricalSleepPrior | undefined,
): prior is HistoricalSleepPrior {
  return Boolean(prior && prior.confidence !== "none" && prior.nightsIncluded > 0);
}

function buildPredictedRemWindows(input: {
  estimatedSleepOnsetAt: string;
  likelyPhoneCueWindowStart: string;
  likelyPhoneCueWindowEnd: string;
  historicalSleepPrior?: HistoricalSleepPrior;
}): PredictedRemWindow[] {
  const prior = input.historicalSleepPrior;

  if (isUsableHistoricalPrior(prior) && prior.remWindows.length > 0) {
    return prior.remWindows.map((window) => ({
      startAt: addSeconds(
        input.estimatedSleepOnsetAt,
        window.startMinutesAfterSleepOnset * 60,
      ),
      endAt: addSeconds(
        input.estimatedSleepOnsetAt,
        window.endMinutesAfterSleepOnset * 60,
      ),
      source: "historical_sleep",
      confidence: window.confidence,
      medianDurationMinutes: window.medianDurationMinutes,
    }));
  }

  return [
    {
      startAt: input.likelyPhoneCueWindowStart,
      endAt: input.likelyPhoneCueWindowEnd,
      source: "default",
      confidence: 0.5,
    },
  ];
}

function buildLikelyPhoneCueWindowStart(input: {
  trainingEndedAt: string;
  estimatedSleepOnsetAt: string;
  defaultPhoneCueWindowStart: string;
  historicalSleepPrior?: HistoricalSleepPrior;
}): string {
  const prior = input.historicalSleepPrior;

  if (!isUsableHistoricalPrior(prior) || prior.remWindows.length === 0) {
    return input.defaultPhoneCueWindowStart;
  }

  const earliestHistoricalRemWindowStartMs = Math.min(
    ...prior.remWindows.map((window) =>
      Date.parse(
        addSeconds(
          input.estimatedSleepOnsetAt,
          window.startMinutesAfterSleepOnset * 60,
        ),
      ),
    ),
  );
  const defaultStartMs = Date.parse(input.defaultPhoneCueWindowStart);

  if (earliestHistoricalRemWindowStartMs >= defaultStartMs) {
    return input.defaultPhoneCueWindowStart;
  }

  const lowerBoundMs = Date.parse(
    addSeconds(input.trainingEndedAt, earliestHistoricalPhoneCueStartSeconds),
  );

  return new Date(
    Math.max(lowerBoundMs, earliestHistoricalRemWindowStartMs),
  ).toISOString();
}

export function buildSleepTimingPrior(input: {
  trainingEndedAt: string;
  settings: CueDecisionSettings;
  historicalSleepPrior?: HistoricalSleepPrior;
}): SleepTimingPrior {
  const { historicalSleepPrior, settings, trainingEndedAt } = input;
  const selfReportedSleepOnsetAt = addSeconds(
    trainingEndedAt,
    settings.selfReportedSleepLatencyMinutes * 60,
  );
  const usableHistoricalPrior = isUsableHistoricalPrior(historicalSleepPrior)
    ? historicalSleepPrior
    : undefined;
  const historicalSleepOnsetAt =
    usableHistoricalPrior?.medianSleepOnsetMinutesAfterMidnight !== null &&
    usableHistoricalPrior?.medianSleepOnsetMinutesAfterMidnight !== undefined
      ? clockMinutesAfter(
          trainingEndedAt,
          usableHistoricalPrior.medianSleepOnsetMinutesAfterMidnight,
        )
      : null;
  const historicalOnsetMs = historicalSleepOnsetAt
    ? Date.parse(historicalSleepOnsetAt)
    : null;
  const trainingEndMs = Date.parse(trainingEndedAt);
  const useHistoricalOnset =
    historicalOnsetMs !== null &&
    historicalOnsetMs >= trainingEndMs &&
    historicalOnsetMs - trainingEndMs <= 4 * 3600000;
  const estimatedSleepOnsetAt = useHistoricalOnset && historicalSleepOnsetAt
    ? historicalSleepOnsetAt
    : selfReportedSleepOnsetAt;
  const historicalWakeFromClock =
    usableHistoricalPrior?.medianWakeMinutesAfterMidnight !== null &&
    usableHistoricalPrior?.medianWakeMinutesAfterMidnight !== undefined
      ? clockMinutesAfter(
          estimatedSleepOnsetAt,
          usableHistoricalPrior.medianWakeMinutesAfterMidnight,
        )
      : null;
  const wakeFromClock =
    historicalWakeFromClock ?? clockTimeAfter(trainingEndedAt, settings.typicalWakeTime);
  const wakeFromDuration = addSeconds(
    estimatedSleepOnsetAt,
    (usableHistoricalPrior?.medianSleepDurationMinutes ??
      settings.typicalSleepDurationHours * 60) * 60,
  );
  const expectedWakeAt = wakeFromClock ?? wakeFromDuration;
  const defaultPhoneCueWindowStart = addSeconds(
    trainingEndedAt,
    settings.cueStartDelayHoursAfterTraining * 3600,
  );
  const likelyPhoneCueWindowStart = buildLikelyPhoneCueWindowStart({
    trainingEndedAt,
    estimatedSleepOnsetAt,
    defaultPhoneCueWindowStart,
    historicalSleepPrior: usableHistoricalPrior,
  });
  const expectedWakeMinusBuffer = addSeconds(expectedWakeAt, -wakeBufferSeconds);
  const likelyPhoneCueWindowEnd =
    Date.parse(expectedWakeMinusBuffer) > Date.parse(likelyPhoneCueWindowStart)
      ? expectedWakeMinusBuffer
      : addSeconds(likelyPhoneCueWindowStart, 2 * 3600);
  const predictedRemWindows = buildPredictedRemWindows({
    estimatedSleepOnsetAt,
    likelyPhoneCueWindowStart,
    likelyPhoneCueWindowEnd,
    historicalSleepPrior: usableHistoricalPrior,
  });
  const baseConfidence = inferConfidence(settings);
  const historicalConfidence = usableHistoricalPrior
    ? timingConfidenceFromHistorical(usableHistoricalPrior)
    : null;
  const confidence = historicalConfidence
    ? betterConfidence(baseConfidence, historicalConfidence)
    : baseConfidence;

  return {
    estimatedSleepOnsetAt,
    expectedWakeAt,
    likelyPhoneCueWindowStart,
    likelyPhoneCueWindowEnd,
    predictedRemWindows,
    historicalSleepPrior: usableHistoricalPrior,
    confidence,
    source: usableHistoricalPrior ? "historical_sleep" : inferSource(settings),
  };
}
