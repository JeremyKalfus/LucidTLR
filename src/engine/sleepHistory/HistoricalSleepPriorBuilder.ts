import type {
  ExternalSleepSession,
  ExternalSleepSource,
  ExternalSleepStage,
  ExternalSleepStageSegment,
  HistoricalRemWindow,
  HistoricalSleepPrior,
  HistoricalSleepPriorConfidence,
  RemDensityBin,
} from "@/src/domain/types";

const minSessionDurationMinutes = 4 * 60;
const maxSessionDurationMinutes = 12 * 60;
const maxNightsForPrior = 30;
const remBinMinutes = 15;
const lateRemStartMinutes = 4 * 60;

const sleepStages = new Set<ExternalSleepStage>([
  "rem",
  "core",
  "light",
  "deep",
  "asleep_unknown",
]);

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return Math.round(sorted[midpoint]);
  }

  return Math.round((sorted[midpoint - 1] + sorted[midpoint]) / 2);
}

function minutesAfterMidnight(iso: string): number {
  const date = new Date(iso);
  return date.getHours() * 60 + date.getMinutes();
}

function confidenceForNightCount(
  nightsIncluded: number,
): HistoricalSleepPriorConfidence {
  if (nightsIncluded === 0) {
    return "none";
  }

  if (nightsIncluded <= 3) {
    return "low";
  }

  if (nightsIncluded <= 9) {
    return "medium";
  }

  return "high";
}

function numericConfidence(confidence: HistoricalSleepPriorConfidence): number {
  if (confidence === "high") {
    return 0.9;
  }

  if (confidence === "medium") {
    return 0.65;
  }

  if (confidence === "low") {
    return 0.35;
  }

  return 0;
}

function emptyPrior(input: {
  source: ExternalSleepSource;
  generatedAt: string;
}): HistoricalSleepPrior {
  return {
    source: input.source,
    nightsIncluded: 0,
    confidence: "none",
    medianSleepOnsetMinutesAfterMidnight: null,
    medianWakeMinutesAfterMidnight: null,
    medianSleepDurationMinutes: null,
    remWindows: [],
    remDensityByMinute: [],
    generatedAt: input.generatedAt,
  };
}

function toValidStageSegments(input: {
  session: ExternalSleepSession;
  stageSegments: ExternalSleepStageSegment[];
}) {
  const sessionStartMs = Date.parse(input.session.startAt);
  const sessionEndMs = Date.parse(input.session.endAt);

  return input.stageSegments
    .filter((segment) => segment.externalSleepSessionId === input.session.id)
    .filter((segment) => {
      const startMs = Date.parse(segment.startAt);
      const endMs = Date.parse(segment.endAt);

      return (
        Number.isFinite(startMs) &&
        Number.isFinite(endMs) &&
        startMs >= sessionStartMs &&
        endMs <= sessionEndMs &&
        endMs > startMs
      );
    })
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
}

function buildRemDensity(input: {
  nightsIncluded: number;
  remOffsetsByNight: Array<Array<{ startMinute: number; endMinute: number }>>;
}): RemDensityBin[] {
  const binCounts = new Map<number, number>();

  for (const remOffsets of input.remOffsetsByNight) {
    const observedBins = new Set<number>();

    for (const offset of remOffsets) {
      const firstBin = Math.floor(offset.startMinute / remBinMinutes) * remBinMinutes;
      const lastBin =
        Math.floor(Math.max(offset.startMinute, offset.endMinute - 1) / remBinMinutes) *
        remBinMinutes;

      for (let bin = firstBin; bin <= lastBin; bin += remBinMinutes) {
        if (bin >= 0) {
          observedBins.add(bin);
        }
      }
    }

    for (const bin of observedBins) {
      binCounts.set(bin, (binCounts.get(bin) ?? 0) + 1);
    }
  }

  return [...binCounts.entries()]
    .sort(([a], [b]) => a - b)
    .map(([minuteAfterSleepOnset, nightsObserved]) => ({
      minuteAfterSleepOnset,
      density: nightsObserved / Math.max(1, input.nightsIncluded),
      nightsObserved,
    }));
}

function buildRemWindows(input: {
  confidence: HistoricalSleepPriorConfidence;
  remDensityByMinute: RemDensityBin[];
  remDurations: number[];
}): HistoricalRemWindow[] {
  const lateBins = input.remDensityByMinute.filter(
    (bin) => bin.minuteAfterSleepOnset >= lateRemStartMinutes && bin.density > 0,
  );

  if (lateBins.length === 0) {
    return [];
  }

  const maxDensity = Math.max(...lateBins.map((bin) => bin.density));
  const threshold = Math.max(0.2, maxDensity * 0.5);
  const selectedBins = lateBins.filter((bin) => bin.density >= threshold);
  const merged: Array<{
    start: number;
    end: number;
    densities: number[];
  }> = [];

  for (const bin of selectedBins) {
    const latest = merged[merged.length - 1];
    const binStart = bin.minuteAfterSleepOnset;
    const binEnd = binStart + remBinMinutes;

    if (latest && binStart <= latest.end + remBinMinutes) {
      latest.end = binEnd;
      latest.densities.push(bin.density);
      continue;
    }

    merged.push({
      start: binStart,
      end: binEnd,
      densities: [bin.density],
    });
  }

  const baseConfidence = numericConfidence(input.confidence);
  const medianRemDuration = median(input.remDurations);

  return merged
    .map((window) => {
      const density =
        window.densities.reduce((total, value) => total + value, 0) /
        window.densities.length;

      return {
        startMinutesAfterSleepOnset: window.start,
        endMinutesAfterSleepOnset: window.end,
        confidence: Math.min(1, Math.max(0, density * baseConfidence)),
        medianDurationMinutes: medianRemDuration ?? undefined,
      };
    })
    .sort((a, b) => {
      if (b.confidence !== a.confidence) {
        return b.confidence - a.confidence;
      }

      return b.startMinutesAfterSleepOnset - a.startMinutesAfterSleepOnset;
    })
    .slice(0, 3)
    .sort(
      (a, b) =>
        a.startMinutesAfterSleepOnset - b.startMinutesAfterSleepOnset,
    );
}

export function buildHistoricalSleepPrior(input: {
  sessions: ExternalSleepSession[];
  stageSegments: ExternalSleepStageSegment[];
  participantId: string;
  source: ExternalSleepSource;
  now: string;
}): HistoricalSleepPrior {
  const generatedAt = input.now;
  const candidateSessions = input.sessions
    .filter((session) => session.participantId === input.participantId)
    .filter((session) => {
      const startMs = Date.parse(session.startAt);
      const endMs = Date.parse(session.endAt);
      const durationMinutes = (endMs - startMs) / 60000;

      return (
        Number.isFinite(startMs) &&
        Number.isFinite(endMs) &&
        endMs > startMs &&
        durationMinutes >= minSessionDurationMinutes &&
        durationMinutes <= maxSessionDurationMinutes
      );
    })
    .sort((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt))
    .slice(0, maxNightsForPrior);

  const onsetMinutes: number[] = [];
  const wakeMinutes: number[] = [];
  const durationMinutes: number[] = [];
  const remDurations: number[] = [];
  const remOffsetsByNight: Array<Array<{ startMinute: number; endMinute: number }>> =
    [];

  for (const session of candidateSessions) {
    const validSegments = toValidStageSegments({
      session,
      stageSegments: input.stageSegments,
    });
    const sleepSegments = validSegments.filter((segment) =>
      sleepStages.has(segment.stage),
    );
    const firstSleepSegment = sleepSegments[0];

    if (!firstSleepSegment) {
      continue;
    }

    const sessionEndMs = Date.parse(session.endAt);
    const onsetMs = Date.parse(firstSleepSegment.startAt);
    const finalSegment = validSegments[validSegments.length - 1];
    const wakeMs =
      finalSegment &&
      (finalSegment.stage === "awake" || finalSegment.stage === "out_of_bed") &&
      Date.parse(finalSegment.startAt) > onsetMs
        ? Date.parse(finalSegment.startAt)
        : sessionEndMs;
    const sleepDurationMinutes = (wakeMs - onsetMs) / 60000;

    if (sleepDurationMinutes <= 0) {
      continue;
    }

    const remOffsets = sleepSegments
      .filter((segment) => segment.stage === "rem")
      .map((segment) => {
        const startMinute = Math.max(
          0,
          Math.round((Date.parse(segment.startAt) - onsetMs) / 60000),
        );
        const endMinute = Math.max(
          startMinute,
          Math.round((Date.parse(segment.endAt) - onsetMs) / 60000),
        );

        remDurations.push(Math.max(0, endMinute - startMinute));

        return { startMinute, endMinute };
      })
      .filter((offset) => offset.endMinute > offset.startMinute);

    onsetMinutes.push(minutesAfterMidnight(firstSleepSegment.startAt));
    wakeMinutes.push(minutesAfterMidnight(new Date(wakeMs).toISOString()));
    durationMinutes.push(Math.round(sleepDurationMinutes));
    remOffsetsByNight.push(remOffsets);
  }

  const nightsIncluded = onsetMinutes.length;

  if (nightsIncluded === 0) {
    return emptyPrior({
      source: input.source,
      generatedAt,
    });
  }

  const confidence = confidenceForNightCount(nightsIncluded);
  const remDensityByMinute = buildRemDensity({
    nightsIncluded,
    remOffsetsByNight,
  });
  const remWindows = buildRemWindows({
    confidence,
    remDensityByMinute,
    remDurations,
  });

  return {
    source: input.source,
    nightsIncluded,
    confidence,
    medianSleepOnsetMinutesAfterMidnight: median(onsetMinutes),
    medianWakeMinutesAfterMidnight: median(wakeMinutes),
    medianSleepDurationMinutes: median(durationMinutes),
    remWindows,
    remDensityByMinute,
    generatedAt,
  };
}
