import { describe, expect, it } from "vitest";

import { evaluateWatchCuePolicy, type WatchCuePolicyInput } from "@/src/engine/watchRem";

function baseInput(overrides: Partial<WatchCuePolicyInput> = {}): WatchCuePolicyInput {
  return {
    now: "2026-01-01T05:00:00.000Z",
    epochStart: "2026-01-01T05:00:00.000Z",
    epochEnd: "2026-01-01T05:00:30.000Z",
    prediction: {
      classifierVersion: "toy",
      modelAvailable: true,
      epochStart: "2026-01-01T05:00:00.000Z",
      epochEnd: "2026-01-01T05:00:30.000Z",
      features: { hrFeature: 1, motionFeature: 1, timeFeatureHours: 2 },
      remProbability: 0.3,
      sleepProbability: 0.8,
      remLabel: "likely_rem",
      threshold: 0.24,
      reason: "likely_rem",
    },
    sensorQuality: "good",
    stableLowMovementSeconds: 60,
    audioRuntimeActive: true,
    cueHistory: {
      cueCountTonight: 0,
    },
    state: {
      consecutiveLikelyRemEpochs: 0,
    },
    settings: {
      remThreshold: 0.24,
      minimumSleepProbability: 0.7,
      stableLowMovementRequiredSeconds: 60,
      minimumSecondsSinceLastCue: 20,
      cueAssociatedMovementPauseSeconds: 180,
      consecutiveLikelyRemSuppressionThreshold: 5,
      maxCuesTonight: 60,
    },
    ...overrides,
  };
}

describe("WatchCuePolicy", () => {
  it("allows iPhone cueing when model, REM, movement, and budget gates pass", () => {
    const decision = evaluateWatchCuePolicy(baseInput());

    expect(decision.action).toBe("play_cue");
    expect(decision.shouldPlayCue).toBe(true);
    expect(decision.reason).toBe("watch_likely_rem");
  });

  it("suppresses on the fifth consecutive likely-REM epoch", () => {
    const decision = evaluateWatchCuePolicy(
      baseInput({
        state: { consecutiveLikelyRemEpochs: 4 },
      }),
    );

    expect(decision.action).toBe("suppress");
    expect(decision.reason).toBe("rem_persistent_suppression");
    expect(decision.consecutiveLikelyRemEpochs).toBe(5);
  });

  it("prevents cueing when classifier is unavailable", () => {
    const decision = evaluateWatchCuePolicy(
      baseInput({
        prediction: {
          ...baseInput().prediction,
          modelAvailable: false,
          remLabel: "unknown",
        },
      }),
    );

    expect(decision.action).toBe("suppress");
    expect(decision.reason).toBe("classifier_unavailable");
    expect(decision.shouldPlayCue).toBe(false);
  });
});
