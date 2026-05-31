import { describe, expect, it } from "vitest";

import {
  MALLELA_MOTION_EMA_ALPHA,
  extractMallelaFeatures,
} from "@/src/engine/watchRem";

describe("MallelaFeatureExtractor", () => {
  it("calculates timeFeatureHours from elapsed seconds", () => {
    const result = extractMallelaFeatures({
      heartRateSamples: [60],
      motionSamples: [{ t: 0, x: 0, y: 0, z: 1 }],
      elapsedSessionSeconds: 5400,
    });

    expect(result.timeFeatureHours).toBe(1.5);
  });

  it("applies the paper HR transform from EMA cubed and scaled by 1000", () => {
    const result = extractMallelaFeatures({
      heartRateSamples: [60, 62],
      motionSamples: [{ t: 0, x: 0, y: 0, z: 1 }],
      elapsedSessionSeconds: 30,
      previousState: { hrEma: 59 },
      hrEmaAlpha: 0.5,
    });

    const expectedEma = 0.5 * 61 + 0.5 * 59;

    expect(result.hrEma).toBe(expectedEma);
    expect(result.hrFeature).toBeCloseTo(Math.pow(expectedEma, 3) / 1000);
  });

  it("updates motion EMA with alpha 0.90 and normalizes by 1e9", () => {
    const result = extractMallelaFeatures({
      heartRateSamples: [60],
      motionSamples: [
        { t: 0, x: 3, y: 4, z: 0 },
        { t: 1, x: 0, y: 0, z: 12 },
      ],
      elapsedSessionSeconds: 30,
      previousState: { motionEma: 100 },
    });
    const motionSum = 5 + 12;
    const squared = motionSum ** 2;
    const expectedEma =
      (1 - MALLELA_MOTION_EMA_ALPHA) * squared +
      MALLELA_MOTION_EMA_ALPHA * 100;

    expect(result.motionSummary).toBe(17);
    expect(result.motionEma).toBeCloseTo(expectedEma);
    expect(result.motionFeature).toBeCloseTo(expectedEma / 1e9);
  });

  it("marks missing and degraded sensors without discarding epochs", () => {
    const missing = extractMallelaFeatures({
      heartRateSamples: [],
      motionSamples: [],
      elapsedSessionSeconds: 30,
    });
    const degraded = extractMallelaFeatures({
      heartRateSamples: [61],
      motionSamples: [],
      elapsedSessionSeconds: 30,
    });

    expect(missing.sensorQuality).toBe("missing");
    expect(degraded.sensorQuality).toBe("degraded");
    expect(degraded.hrFeature).toBeDefined();
  });
});
