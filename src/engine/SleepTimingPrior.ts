import type {
  CueDecisionSettings,
  SleepTimingConfidence,
  SleepTimingPrior,
  SleepTimingSource,
} from "./CueDecisionTypes";
import { addSeconds } from "./CueDecisionTypes";

const wakeBufferSeconds = 20 * 60;

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

export function buildSleepTimingPrior(input: {
  trainingEndedAt: string;
  settings: CueDecisionSettings;
}): SleepTimingPrior {
  const { settings, trainingEndedAt } = input;
  const estimatedSleepOnsetAt = addSeconds(
    trainingEndedAt,
    settings.selfReportedSleepLatencyMinutes * 60,
  );
  const wakeFromClock = clockTimeAfter(trainingEndedAt, settings.typicalWakeTime);
  const wakeFromDuration = addSeconds(
    estimatedSleepOnsetAt,
    settings.typicalSleepDurationHours * 3600,
  );
  const expectedWakeAt = wakeFromClock ?? wakeFromDuration;
  const likelyPhoneCueWindowStart = addSeconds(
    trainingEndedAt,
    settings.cueStartDelayHoursAfterTraining * 3600,
  );
  const expectedWakeMinusBuffer = addSeconds(expectedWakeAt, -wakeBufferSeconds);
  const likelyPhoneCueWindowEnd =
    Date.parse(expectedWakeMinusBuffer) > Date.parse(likelyPhoneCueWindowStart)
      ? expectedWakeMinusBuffer
      : addSeconds(likelyPhoneCueWindowStart, 2 * 3600);

  return {
    estimatedSleepOnsetAt,
    expectedWakeAt,
    likelyPhoneCueWindowStart,
    likelyPhoneCueWindowEnd,
    confidence: inferConfidence(settings),
    source: inferSource(settings),
  };
}
