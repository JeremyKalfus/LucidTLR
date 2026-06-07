import { describe, expect, it } from "vitest";

import { createDefaultEngineSettings } from "@/src/engine";
import { createDefaultTlrOptions } from "@/src/features/tlrOptions/tlrOptions";
import {
  buildWatchRuntimePlan,
  hashWatchRuntimePayload,
  hashWatchRuntimePlan,
  validateWatchRuntimePlan,
  withWatchRuntimePlanHash,
  type WatchRuntimePlanV3,
} from "@/src/native/watchRuntime";

function basePlan(): WatchRuntimePlanV3 {
  return buildWatchRuntimePlan({
    sessionId: "session-1",
    participantId: "participant-1",
    sessionType: "tlr",
    createdAt: "2026-06-07T04:00:00.000Z",
    selectedCueId: "harp-flourish",
    tlrOptions: createDefaultTlrOptions(),
    engineSettings: createDefaultEngineSettings(),
  });
}

function rehash(plan: WatchRuntimePlanV3): WatchRuntimePlanV3 {
  return withWatchRuntimePlanHash(plan);
}

describe("WatchRuntimePlanV3", () => {
  it("hashes equivalent plan data stably", () => {
    expect(hashWatchRuntimePayload({ b: 2, a: 1 })).toBe(
      hashWatchRuntimePayload({ a: 1, b: 2 }),
    );
    expect(hashWatchRuntimePlan(basePlan())).toBe(basePlan().planHash);
  });

  it("changes the hash when a meaningful field changes", () => {
    const first = basePlan();
    const second = rehash({
      ...first,
      budget: {
        ...first.budget,
        maxCuesTonight: first.budget.maxCuesTonight + 1,
      },
    });

    expect(second.planHash).not.toBe(first.planHash);
  });

  it("rejects a plan if mode is not watch", () => {
    const invalid = rehash({
      ...basePlan(),
      mode: "phone" as never,
    });

    expect(validateWatchRuntimePlan(invalid)).toContain(
      "Watch runtime plan mode must be watch.",
    );
  });

  it("rejects TLR cueing with both haptic and audio disabled", () => {
    const plan = basePlan();
    const invalid = rehash({
      ...plan,
      cueOutput: {
        ...plan.cueOutput,
        hapticEnabled: false,
        audioEnabled: false,
      },
    });

    expect(validateWatchRuntimePlan(invalid)).toContain(
      "TLR Watch plans require haptic or audio cue output.",
    );
  });

  it("rejects audio-enabled cueing without preflight", () => {
    const plan = basePlan();
    const invalid = rehash({
      ...plan,
      cueOutput: {
        ...plan.cueOutput,
        audioEnabled: true,
        audioRequiresPreflight: false,
        preflightRequired: true,
      },
    });

    expect(validateWatchRuntimePlan(invalid)).toContain(
      "Audio-enabled Watch plans require same-night audio preflight.",
    );
  });

  it("rejects Low Power Mode allowance", () => {
    const plan = basePlan();
    const invalid = rehash({
      ...plan,
      safety: {
        ...plan.safety,
        requireLowPowerModeOff: false as never,
      },
    });

    expect(validateWatchRuntimePlan(invalid)).toContain(
      "Watch plans must block start when Low Power Mode is on.",
    );
  });

  it("rejects a missing cue asset hash", () => {
    const plan = basePlan();
    const invalid = rehash({
      ...plan,
      cue: {
        ...plan.cue,
        sha256: "",
      },
    });

    expect(validateWatchRuntimePlan(invalid)).toContain(
      "Watch plans must include the cue asset sha256.",
    );
  });

  it("rejects a missing REM model version", () => {
    const plan = basePlan();
    const invalid = rehash({
      ...plan,
      remModelVersion: "",
      model: {
        ...plan.model,
        modelVersion: "",
      },
    });

    expect(validateWatchRuntimePlan(invalid)).toContain(
      "Watch plans must include explicit REM model versions.",
    );
  });

  it("allows sleep log plans with cue delivery disabled and sensing required", () => {
    const plan = buildWatchRuntimePlan({
      sessionId: "sleep-log-1",
      participantId: "participant-1",
      sessionType: "sleep_log",
      createdAt: "2026-06-07T04:00:00.000Z",
      selectedCueId: "harp-flourish",
      tlrOptions: {
        ...createDefaultTlrOptions(),
        watchAudioCueEnabled: false,
      },
      engineSettings: createDefaultEngineSettings(),
    });

    expect(validateWatchRuntimePlan(plan)).toEqual([]);
    expect(plan.cueOutput.hapticEnabled).toBe(false);
    expect(plan.cueOutput.audioEnabled).toBe(false);
    expect(plan.safety.requireWorkoutSession).toBe(true);
    expect(plan.safety.requireMotion).toBe(true);
  });
});
