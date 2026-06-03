import { describe, expect, it } from "vitest";

import type { NightSession } from "@/src/domain/types";
import {
  buildSleepTimingPrior,
  createDefaultEngineSettings,
} from "@/src/engine";
import { buildWatchOwnedSessionPlan } from "@/src/native/watch/buildWatchOwnedSessionPlan";

function watchSession(): NightSession {
  return {
    id: "session-watch-owned",
    participantId: "participant-1",
    sessionType: "tlr",
    mode: "watch",
    status: "waiting_for_cue_window",
    protocolVersion: "tlr-2026-001",
    startedAt: "2026-01-01T03:55:00.000Z",
    trainingStartedAt: "2026-01-01T04:00:00.000Z",
    trainingEndedAt: "2026-01-01T04:15:00.000Z",
    selectedCueId: "harp-flourish",
  };
}

describe("buildWatchOwnedSessionPlan", () => {
  it("builds a Watch-owned v2 plan with local runtime, cue, model, and battery policy", () => {
    const settings = createDefaultEngineSettings("standard");
    const sleepTiming = buildSleepTimingPrior({
      trainingEndedAt: "2026-01-01T04:15:00.000Z",
      settings,
    });

    const plan = buildWatchOwnedSessionPlan({
      session: watchSession(),
      settings,
      sleepTiming,
      createdAt: "2026-01-01T04:16:00.000Z",
    });

    expect(plan).toMatchObject({
      protocol: "watch-session-plan-v2",
      sessionId: "session-watch-owned",
      runtimeOwner: "watch",
      cueMode: "audio_haptic",
      epochDurationSec: 30,
      accelerometerHz: 30,
      lowPowerModePolicy: "warn_degraded",
      privacyLoggingMode: "summary_only",
      batteryPolicy: {
        recommendedStartBatteryPct: 90,
        requireOverrideBelowPct: 60,
        disableCueingBelowPct: 25,
        stopRuntimeBelowPct: 20,
        hardStopBelowPct: 12,
      },
      cueAssetManifest: {
        cueAssetId: "harp-flourish",
        fileName: "harp_flourish.mp3",
      },
      remModelManifest: {
        modelId: "mallela_rf_v1",
        threshold: 0.24,
      },
    });
    expect(plan.earliestCueAt).toBe(sleepTiming.likelyPhoneCueWindowStart);
    expect(plan.stopAt).toBe(sleepTiming.expectedWakeAt);
    expect(plan.suppressCueFromConsecutiveLikelyRemEpoch).toBe(5);
  });

  it("uses the Watch audio/haptic toggles to choose cue mode", () => {
    const settings = createDefaultEngineSettings("standard");
    const sleepTiming = buildSleepTimingPrior({
      trainingEndedAt: "2026-01-01T04:15:00.000Z",
      settings,
    });

    const plan = buildWatchOwnedSessionPlan({
      session: watchSession(),
      settings,
      sleepTiming,
      tlrOptions: {
        selectedCueId: "harp-flourish",
        backgroundNoise: "none",
        watchAudioCueEnabled: false,
        watchHapticCueEnabled: true,
        skipGuidedTraining: false,
        requireAccelerometer: true,
        alarm: {
          enabled: false,
          time: "07:00",
          autoShutoff: true,
          ringDurationMinutes: 5,
        },
      },
    });

    expect(plan.cueMode).toBe("haptic_only");
  });
});
