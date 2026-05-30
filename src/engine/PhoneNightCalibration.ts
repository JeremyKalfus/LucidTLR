import type {
  PhoneNightCalibrationNight,
  PhoneNightCalibrationPrior,
} from "@/src/domain/types";

import type { CueDecisionSettings } from "./CueDecisionTypes";
import { clamp, normalizeEngineSettings } from "./CueDecisionTypes";

export type {
  PhoneNightCalibrationNight,
  PhoneNightCalibrationPrior,
} from "@/src/domain/types";

const minCalibrationRuntimeMinutes = 4 * 60;
const maxCalibrationNights = 30;

function median(values: number[]): number | null {
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  if (sorted.length === 0) {
    return null;
  }

  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function rate(values: boolean[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.filter(Boolean).length / values.length;
}

function isEligibleNight(night: PhoneNightCalibrationNight): boolean {
  return (
    !night.errored &&
    night.runtimeDurationMinutes >= minCalibrationRuntimeMinutes &&
    Date.parse(night.trainingEndedAt) > 0
  );
}

export function emptyPhoneNightCalibrationPrior(
  generatedAt = new Date().toISOString(),
): PhoneNightCalibrationPrior {
  return {
    source: "local_phone_runtime",
    nightsIncluded: 0,
    confidence: "none",
    generatedAt,
    medianRuntimeDurationMinutes: null,
    medianObservedEndMinutesAfterTraining: null,
    medianQuietStartMinutesAfterTraining: null,
    medianQuietRuntimeRatio: null,
    budgetExhaustedRate: 0,
    cueWokeUserRate: null,
    medianSleepQualityRating: null,
    recommendedMaxCuesPerNightMultiplier: 1,
    recommendedVolumeMultiplier: 1,
  };
}

export function buildPhoneNightCalibrationPrior(input: {
  nights: PhoneNightCalibrationNight[];
  now?: string;
}): PhoneNightCalibrationPrior {
  const generatedAt = input.now ?? new Date().toISOString();
  const eligibleNights = input.nights
    .filter(isEligibleNight)
    .sort((a, b) => Date.parse(b.trainingEndedAt) - Date.parse(a.trainingEndedAt))
    .slice(0, maxCalibrationNights);

  if (eligibleNights.length === 0) {
    return emptyPhoneNightCalibrationPrior(generatedAt);
  }

  const cueWokeAnswers = eligibleNights.flatMap((night) =>
    typeof night.cueWokeUser === "boolean" ? [night.cueWokeUser] : [],
  );
  const qualityRatings = eligibleNights.flatMap((night) =>
    typeof night.sleepQualityRating === "number" ? [night.sleepQualityRating] : [],
  );
  const cueWokeUserRate =
    cueWokeAnswers.length > 0 ? rate(cueWokeAnswers) : null;
  const lowQualityRate = rate(
    qualityRatings.map((rating) => rating > 0 && rating <= 2),
  );
  const budgetExhaustedRate = rate(
    eligibleNights.map((night) => night.cueBudgetExhausted),
  );
  const adverseFeedback =
    (cueWokeUserRate !== null && cueWokeUserRate >= 0.34) ||
    lowQualityRate >= 0.34;
  const reduceBudget = adverseFeedback && budgetExhaustedRate >= 0.34;

  return {
    source: "local_phone_runtime",
    nightsIncluded: eligibleNights.length,
    confidence: eligibleNights.length >= 3 ? "medium" : "low",
    generatedAt,
    medianRuntimeDurationMinutes: median(
      eligibleNights.map((night) => night.runtimeDurationMinutes),
    ),
    medianObservedEndMinutesAfterTraining: median(
      eligibleNights.map((night) => night.observedEndMinutesAfterTraining),
    ),
    medianQuietStartMinutesAfterTraining: median(
      eligibleNights.flatMap((night) =>
        typeof night.quietStartMinutesAfterTraining === "number"
          ? [night.quietStartMinutesAfterTraining]
          : [],
      ),
    ),
    medianQuietRuntimeRatio: median(
      eligibleNights.flatMap((night) =>
        typeof night.quietRuntimeRatio === "number"
          ? [night.quietRuntimeRatio]
          : [],
      ),
    ),
    budgetExhaustedRate,
    cueWokeUserRate,
    medianSleepQualityRating: median(qualityRatings),
    recommendedMaxCuesPerNightMultiplier: reduceBudget ? 0.75 : 1,
    recommendedVolumeMultiplier: adverseFeedback ? 0.85 : 1,
  };
}

export function isUsablePhoneNightCalibrationPrior(
  prior: PhoneNightCalibrationPrior | undefined,
): prior is PhoneNightCalibrationPrior {
  return Boolean(prior && prior.nightsIncluded > 0 && prior.confidence !== "none");
}

export function applyPhoneNightCalibrationToSettings(
  settings: CueDecisionSettings,
  prior: PhoneNightCalibrationPrior | undefined,
): CueDecisionSettings {
  if (!isUsablePhoneNightCalibrationPrior(prior)) {
    return settings;
  }

  const cueMultiplier = clamp(
    prior.recommendedMaxCuesPerNightMultiplier,
    0.25,
    1,
  );
  const volumeMultiplier = clamp(prior.recommendedVolumeMultiplier, 0.25, 1);

  if (cueMultiplier === 1 && volumeMultiplier === 1) {
    return settings;
  }

  return normalizeEngineSettings({
    ...settings,
    maxCuesPerNight: Math.max(
      1,
      Math.round(settings.maxCuesPerNight * cueMultiplier),
    ),
    volumeStartLevel: settings.volumeStartLevel * volumeMultiplier,
    volumeCap: settings.volumeCap * volumeMultiplier,
  });
}
