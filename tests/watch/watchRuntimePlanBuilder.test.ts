import { describe, expect, it } from "vitest";

import { createDefaultEngineSettings } from "@/src/engine";
import { createDefaultTlrOptions } from "@/src/features/tlrOptions/tlrOptions";
import {
  WATCH_RUNTIME_PLAN_SCHEMA_VERSION,
  buildWatchRuntimePlan,
  buildWatchRuntimePlanFromSession,
} from "@/src/native/watchRuntime";

describe("buildWatchRuntimePlan", () => {
  it("builds a v3 Watch-owned TLR plan from current app state inputs", () => {
    const plan = buildWatchRuntimePlan({
      sessionId: "session-1",
      participantId: "participant-1",
      sessionType: "tlr",
      createdAt: "2026-06-07T04:00:00.000Z",
      selectedCueId: "dx-harp-c5",
      tlrOptions: createDefaultTlrOptions(),
      engineSettings: createDefaultEngineSettings("standard"),
    });

    expect(plan.schemaVersion).toBe(WATCH_RUNTIME_PLAN_SCHEMA_VERSION);
    expect(plan.mode).toBe("watch");
    expect(plan.selectedCueId).toBe("dx-harp-c5");
    expect(plan.cueOutput).toMatchObject({
      hapticEnabled: true,
      audioEnabled: false,
      audioRequiresPreflight: true,
      defaultOutput: "haptic",
    });
    expect(plan.epoching).toMatchObject({
      epochSeconds: 30,
      rawMotionPersistence: false,
    });
    expect(plan.safety).toMatchObject({
      requireWorkoutSession: true,
      requireHealthKitAuthorization: true,
      requireMotion: true,
      requireLowPowerModeOff: true,
    });
    expect(plan.assets.map((asset) => asset.kind)).toEqual(["cue", "training"]);
    expect(plan.privacy.noGps).toBe(true);
    expect(plan.privacy.noLiveAppleSleepStages).toBe(true);
  });

  it("requires an explicit lab opt-in before enabling experimental audio", () => {
    const common = {
      sessionId: "session-1",
      participantId: "participant-1",
      sessionType: "tlr" as const,
      createdAt: "2026-06-07T04:00:00.000Z",
      selectedCueId: "harp-flourish",
      tlrOptions: {
        ...createDefaultTlrOptions(),
        watchAudioCueEnabled: true,
      },
      engineSettings: createDefaultEngineSettings(),
    };

    expect(buildWatchRuntimePlan(common).cueOutput.audioEnabled).toBe(false);
    expect(
      buildWatchRuntimePlan({
        ...common,
        allowExperimentalAudio: true,
      }).cueOutput,
    ).toMatchObject({
      hapticEnabled: true,
      audioEnabled: true,
      audioRequiresPreflight: true,
    });
  });

  it("can build from a NightSession-shaped object without starting Watch Mode", () => {
    const plan = buildWatchRuntimePlanFromSession({
      session: {
        id: "session-1",
        participantId: "participant-1",
        sessionType: "sleep_log",
        startedAt: "2026-06-07T04:00:00.000Z",
        selectedCueId: "harp-flourish",
      },
      tlrOptions: createDefaultTlrOptions(),
      engineSettings: createDefaultEngineSettings(),
    });

    expect(plan.sessionType).toBe("sleep_log");
    expect(plan.tlrInterval.enabled).toBe(false);
    expect(plan.training.enabled).toBe(false);
    expect(plan.assets.map((asset) => asset.kind)).toEqual(["cue"]);
  });
});
