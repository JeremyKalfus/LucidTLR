import {
  MALLELA_APPROX_FEATURE_VERSION,
  MALLELA_HR_EMA_ALPHA,
  MALLELA_MOTION_EMA_ALPHA,
  type MallelaFeatureExtractorInput,
  type MallelaFeatureOutput,
  type WatchMotionSample,
} from "./WatchRemTypes";

function average(values: number[]): number | undefined {
  const usable = values.filter(Number.isFinite);

  if (usable.length === 0) {
    return undefined;
  }

  return usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

function updateEma(value: number, previous: number | undefined, alpha: number): number {
  return previous === undefined ? value : (1 - alpha) * value + alpha * previous;
}

function activityCountLikeMagnitudeSum(samples: WatchMotionSample[]): number | undefined {
  const usable = samples.filter(
    (sample) =>
      Number.isFinite(sample.x) &&
      Number.isFinite(sample.y) &&
      Number.isFinite(sample.z),
  );

  if (usable.length === 0) {
    return undefined;
  }

  return usable.reduce(
    (sum, sample) =>
      sum + Math.sqrt(sample.x * sample.x + sample.y * sample.y + sample.z * sample.z),
    0,
  );
}

export function extractMallelaFeatures(
  input: MallelaFeatureExtractorInput,
): MallelaFeatureOutput {
  const hrSampleCount = input.heartRateSamples.filter(Number.isFinite).length;
  const motionSampleCount = input.motionSamples.filter(
    (sample) =>
      Number.isFinite(sample.x) &&
      Number.isFinite(sample.y) &&
      Number.isFinite(sample.z),
  ).length;
  const elapsedSessionSeconds = Math.max(0, input.elapsedSessionSeconds);
  const timeFeatureHours = elapsedSessionSeconds / 3600;
  const missingReasons: string[] = [];
  const avgHR = average(input.heartRateSamples);
  const hrEma =
    avgHR === undefined
      ? input.previousState?.hrEma
      : updateEma(
          avgHR,
          input.previousState?.hrEma,
          input.hrEmaAlpha ?? MALLELA_HR_EMA_ALPHA,
        );
  const hrFeature = hrEma === undefined ? undefined : Math.pow(hrEma, 3) / 1000;
  const motionSummary = activityCountLikeMagnitudeSum(input.motionSamples);
  const motionTotal = motionSummary === undefined ? undefined : motionSummary ** 2;
  const motionEma =
    motionTotal === undefined
      ? input.previousState?.motionEma
      : updateEma(
          motionTotal,
          input.previousState?.motionEma,
          input.motionEmaAlpha ?? MALLELA_MOTION_EMA_ALPHA,
        );
  const motionFeature =
    motionEma === undefined ? undefined : Number((motionEma / 1e9).toPrecision(12));

  if (avgHR === undefined) {
    missingReasons.push("heart_rate_missing");
  }

  if (motionSummary === undefined) {
    missingReasons.push("motion_missing");
  }

  if (motionSampleCount > 0 && motionSampleCount < 30 * 20) {
    missingReasons.push("motion_sample_count_low");
  }

  const sensorQuality =
    avgHR === undefined && motionSummary === undefined
      ? "missing"
      : missingReasons.length > 0
        ? "degraded"
        : "good";

  return {
    avgHR,
    hrSampleCount,
    hrEma,
    hrFeature,
    motionSampleCount,
    motionSummary,
    motionFeature,
    motionEma,
    timeFeatureHours,
    elapsedSessionSeconds,
    sensorQuality,
    missingReasons,
    featureVersion: MALLELA_APPROX_FEATURE_VERSION,
    state: {
      hrEma,
      motionEma,
    },
  };
}
