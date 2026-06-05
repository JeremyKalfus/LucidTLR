import { describe, expect, it } from "vitest";

import type { NightSession } from "@/src/domain/types";
import {
  buildSleepTimingPrior,
  createDefaultEngineSettings,
} from "@/src/engine";
import {
  buildWatchOwnedSessionPlan,
  projectedWatchTrainingCompletedAt,
} from "@/src/native/watch/buildWatchOwnedSessionPlan";

function watchSession(): NightSession {
  return {
    id: "session-watch-owned",
    participantId: "participant-1",
    sessionType: "tlr",
    mode: "watch",
    status: "waiting_for_cue_window",
    protocolVersion: "tlr-2026-001",
    startedAt: "2026-01-01T03:55:00.000Z",
    selectedCueId: "harp-flourish",
  };
}

function watchSleepLogSession(): NightSession {
  return {
    id: "session-watch-sleep-log",
    participantId: "participant-1",
    sessionType: "sleep_log",
    mode: "watch",
    status: "cueing_disabled_sleep_log",
    protocolVersion: "tlr-2026-001",
    startedAt: "2026-01-01T04:15:00.000Z",
  };
}

describe("buildWatchOwnedSessionPlan", () => {
  it("builds a Watch-owned v2 plan with local runtime, cue, model, and battery policy", () => {
    const settings = createDefaultEngineSettings("standard");
    const session = watchSession();
    const trainingEndedAt = projectedWatchTrainingCompletedAt({
      session,
      settings,
    });
    const sleepTiming = buildSleepTimingPrior({
      trainingEndedAt,
      settings,
    });

    const plan = buildWatchOwnedSessionPlan({
      session,
      settings,
      sleepTiming,
      createdAt: "2026-01-01T04:16:00.000Z",
    });

    expect(plan).toMatchObject({
      protocol: "watch-session-plan-v2",
      sessionId: "session-watch-owned",
      sessionType: "tlr",
      runtimeOwner: "watch",
      tlrEnabled: true,
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
      training: {
        enabled: true,
        skipped: false,
        trainingAssetId: "final_lucid_training",
        resourceName: "final_lucid_training",
        resourceExtension: "mp3",
        expectedStartedAt: "2026-01-01T03:55:00.000Z",
        expectedCompletedAt: trainingEndedAt,
      },
      tlrInterval: {
        enabled: true,
        startsAt: trainingEndedAt,
        earliestCueAt: sleepTiming.likelyPhoneCueWindowStart,
        derivedFrom: "watch_training_end",
      },
    });
    expect(plan.training.durationSec).toBeGreaterThan(1300);
    expect(plan.training.cueSchedule).toHaveLength(17);
    expect(plan.training.cueSchedule[0]).toMatchObject({
      markerIndex: 0,
      markerMidpointSec: 111.672,
    });
    expect(plan.earliestCueAt).toBe(sleepTiming.likelyPhoneCueWindowStart);
    expect(plan.stopAt).toBe(sleepTiming.expectedWakeAt);
    expect(plan.suppressCueFromConsecutiveLikelyRemEpoch).toBe(5);
  });

  it("uses the Watch audio/haptic toggles to choose cue mode", () => {
    const settings = createDefaultEngineSettings("standard");
    const session = watchSession();
    const sleepTiming = buildSleepTimingPrior({
      trainingEndedAt: projectedWatchTrainingCompletedAt({ session, settings }),
      settings,
    });

    const plan = buildWatchOwnedSessionPlan({
      session,
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

  it("does not require presleep training timestamps for Watch Mode TLR", () => {
    const settings = createDefaultEngineSettings("standard");
    const session = {
      ...watchSession(),
      status: "setup" as const,
      trainingStartedAt: undefined,
      trainingEndedAt: undefined,
    };
    const sleepTiming = buildSleepTimingPrior({
      trainingEndedAt: projectedWatchTrainingCompletedAt({ session, settings }),
      settings,
    });

    const plan = buildWatchOwnedSessionPlan({
      session,
      settings,
      sleepTiming,
      createdAt: "2026-01-01T03:56:00.000Z",
    });

    expect(plan.validAfter).toBe(session.startedAt);
    expect(plan.trainingCompletedAt).toBeUndefined();
    expect(plan.training.enabled).toBe(true);
    expect(plan.training.expectedCompletedAt).toBe(
      projectedWatchTrainingCompletedAt({ session, settings }),
    );
    expect(plan.earliestCueAt).toBe(sleepTiming.likelyPhoneCueWindowStart);
  });

  it("builds a Watch-owned no-cue plan for Watch Mode sleep logs", () => {
    const settings = createDefaultEngineSettings("standard");
    const sleepTiming = buildSleepTimingPrior({
      trainingEndedAt: "2026-01-01T04:15:00.000Z",
      settings,
    });

    const plan = buildWatchOwnedSessionPlan({
      session: watchSleepLogSession(),
      settings,
      sleepTiming,
      createdAt: "2026-01-01T04:16:00.000Z",
    });

    expect(plan).toMatchObject({
      protocol: "watch-session-plan-v2",
      sessionId: "session-watch-sleep-log",
      runtimeOwner: "watch",
      cueMode: "none",
      cueBudget: 0,
      validAfter: "2026-01-01T04:15:00.000Z",
      earliestCueAt: "2026-01-01T04:15:00.000Z",
      sessionType: "sleep_log",
      tlrEnabled: false,
      training: {
        enabled: false,
        skipped: true,
        cueSchedule: [],
      },
      tlrInterval: {
        enabled: false,
        startsAt: "2026-01-01T04:15:00.000Z",
        derivedFrom: "session_start",
      },
      remModelManifest: {
        modelId: "mallela_rf_v1",
      },
    });
    expect(plan.cueAssetManifest).toBeUndefined();
  });
});
