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

  it("pauses when stable low movement has not accumulated", () => {
    const decision = evaluateWatchCuePolicy(
      baseInput({ stableLowMovementSeconds: 30 }),
    );

    expect(decision.action).toBe("pause");
    expect(decision.reason).toBe("movement");
    expect(decision.shouldPlayCue).toBe(false);
  });

  it("suppresses when sensor quality is bad", () => {
    const decision = evaluateWatchCuePolicy(
      baseInput({ sensorQuality: "bad" }),
    );

    expect(decision.reason).toBe("sensor_quality_bad");
    expect(decision.shouldPlayCue).toBe(false);
  });

  it("suppresses when iPhone audio is unavailable", () => {
    const decision = evaluateWatchCuePolicy(
      baseInput({ audioRuntimeActive: false }),
    );

    expect(decision.reason).toBe("audio_runtime_unavailable");
    expect(decision.shouldPlayCue).toBe(false);
  });

  it("suppresses during recent-cue and cue-associated movement pauses", () => {
    const recentCue = evaluateWatchCuePolicy(
      baseInput({
        now: "2026-01-01T05:00:10.000Z",
        cueHistory: {
          cueCountTonight: 1,
          lastCueAt: "2026-01-01T05:00:00.000Z",
        },
      }),
    );
    const cueAssociatedMovement = evaluateWatchCuePolicy(
      baseInput({
        cueHistory: {
          cueCountTonight: 1,
          cueAssociatedMovementPauseUntil: "2026-01-01T05:02:00.000Z",
        },
      }),
    );

    expect(recentCue.reason).toBe("recent_cue");
    expect(cueAssociatedMovement.reason).toBe("cue_associated_movement");
  });

  it("suppresses when cue budget or sleep probability gates fail", () => {
    const budget = evaluateWatchCuePolicy(
      baseInput({
        cueHistory: { cueCountTonight: 60 },
      }),
    );
    const sleepProbability = evaluateWatchCuePolicy(
      baseInput({
        prediction: {
          ...baseInput().prediction,
          sleepProbability: 0.6,
        },
      }),
    );

    expect(budget.reason).toBe("cue_budget_exhausted");
    expect(sleepProbability.reason).toBe("outside_sleep_opportunity");
  });

  it("suppresses before earliest cue time and after stopAt", () => {
    const beforeCueWindow = evaluateWatchCuePolicy(
      baseInput({
        now: "2026-01-01T04:59:00.000Z",
        settings: {
          ...baseInput().settings,
          earliestCueAt: "2026-01-01T05:00:00.000Z",
        },
      }),
    );
    const afterStop = evaluateWatchCuePolicy(
      baseInput({
        now: "2026-01-01T07:00:00.000Z",
        settings: {
          ...baseInput().settings,
          stopAt: "2026-01-01T07:00:00.000Z",
        },
      }),
    );

    expect(beforeCueWindow.reason).toBe("outside_sleep_opportunity");
    expect(beforeCueWindow.nextCheckAt).toBe("2026-01-01T05:00:00.000Z");
    expect(afterStop.reason).toBe("outside_sleep_opportunity");
  });

  it("suppresses cueing below the Watch battery cue threshold", () => {
    const decision = evaluateWatchCuePolicy(
      baseInput({
        settings: {
          ...baseInput().settings,
          batteryPct: 25,
          disableCueingBelowPct: 25,
        },
      }),
    );

    expect(decision.reason).toBe("sensor_quality_bad");
    expect(decision.shouldPlayCue).toBe(false);
  });
});
