import { describe, expect, it } from "vitest";

import { getBuiltInCue } from "@/src/audio/cueCatalog";
import type { HistoricalSleepPrior, NightSession } from "@/src/domain/types";
import {
  buildSleepTimingPrior,
  createDefaultEngineSettings,
} from "@/src/engine";
import { createDefaultTlrOptions } from "@/src/features/tlrOptions/tlrOptions";
import {
  DEV_KITCHEN_SINK_DURATION_SECONDS,
  buildDevKitchenSinkPhoneSessionPlan,
} from "@/src/native/phoneRuntime/buildDevKitchenSinkPhoneSessionPlan";
import {
  buildNativePhoneSessionPlan,
  buildNativePhoneSessionPlanFromCompletedSession,
  buildNativePhoneSessionPlanForLockedTraining,
} from "@/src/native/phoneRuntime/buildNativePhoneSessionPlan";
import {
  nativePhoneSessionUsesPredictedRemWindows,
  validateNativePhoneSessionPlan,
} from "@/src/native/phoneRuntime/NativePhoneSessionPlan";

const trainingEndedAt = "2026-01-20T04:00:00.000Z";

function session(): NightSession {
  return {
    id: "session-1",
    participantId: "participant-1",
    sessionType: "tlr",
    mode: "phone",
    status: "waiting_for_cue_window",
    protocolVersion: "tlr-2026-001",
    startedAt: "2026-01-20T03:50:00.000Z",
    trainingStartedAt: "2026-01-20T03:50:00.000Z",
    trainingEndedAt,
  };
}

function historicalPrior(): HistoricalSleepPrior {
  return {
    source: "apple_health",
    nightsIncluded: 5,
    confidence: "medium",
    medianSleepOnsetMinutesAfterMidnight: 260,
    medianWakeMinutesAfterMidnight: 720,
    medianSleepDurationMinutes: 460,
    remWindows: [
      {
        startMinutesAfterSleepOnset: 240,
        endMinutesAfterSleepOnset: 270,
        confidence: 0.72,
        medianDurationMinutes: 20,
      },
    ],
    remDensityByMinute: [],
    generatedAt: "2026-01-20T12:00:00.000Z",
  };
}

describe("buildNativePhoneSessionPlan", () => {
  it("includes historical predicted REM windows", () => {
    const settings = createDefaultEngineSettings("standard");
    const sleepTiming = buildSleepTimingPrior({
      trainingEndedAt,
      settings,
      historicalSleepPrior: historicalPrior(),
    });
    const plan = buildNativePhoneSessionPlan({
      session: session(),
      sleepTiming,
      settings,
    });

    expect(plan.timing.predictedRemWindows).toEqual([
      expect.objectContaining({
        source: "historical_sleep",
        confidence: 0.72,
      }),
    ]);
    expect(nativePhoneSessionUsesPredictedRemWindows(plan)).toBe(true);
  });

  it("preserves broad protocol cueing when there are no historical REM windows", () => {
    const settings = createDefaultEngineSettings("standard");
    const plan = buildNativePhoneSessionPlanFromCompletedSession({
      session: session(),
      settings,
    });

    expect(plan.timing.predictedRemWindows).toEqual([
      expect.objectContaining({
        startAt: plan.timing.earliestCueAt,
        endAt: plan.timing.latestCueAt,
        source: "default",
      }),
    ]);
    expect(nativePhoneSessionUsesPredictedRemWindows(plan)).toBe(false);
  });

  it("recomputes sleep timing from the completed session training end", () => {
    const settings = createDefaultEngineSettings("standard");
    const completedSession = {
      ...session(),
      trainingEndedAt: "2026-01-20T04:30:00.000Z",
    };
    const plan = buildNativePhoneSessionPlanFromCompletedSession({
      session: completedSession,
      settings,
    });

    expect(plan.trainingEndedAt).toBe("2026-01-20T04:30:00.000Z");
    expect(plan.timing.earliestCueAt).toBe("2026-01-20T10:30:00.000Z");
  });

  it("includes the shifted historical cue window when history pulls it earlier", () => {
    const settings = createDefaultEngineSettings("standard");
    const sleepTiming = buildSleepTimingPrior({
      trainingEndedAt,
      settings,
      historicalSleepPrior: historicalPrior(),
    });
    const plan = buildNativePhoneSessionPlan({
      session: session(),
      sleepTiming,
      settings,
    });

    expect(plan.timing.earliestCueAt).toBe("2026-01-20T08:20:00.000Z");
    expect(plan.timing.earliestCueAt).toBe(sleepTiming.likelyPhoneCueWindowStart);
  });

  it("passes audio bed, volume ramp, movement, and budget settings", () => {
    const settings = {
      ...createDefaultEngineSettings("standard"),
      phoneAudioBedVolume: 0.04,
      volumeStartLevel: 0.12,
      volumeRampPerCue: 0.002,
      volumeCap: 0.5,
      stableLowMovementRequiredSeconds: 75,
      cueAssociatedMovementWindowSeconds: 35,
      cueAssociatedMovementPauseSeconds: 210,
      maxCuesPerNight: 12,
      maxPhoneCuesPerBlock: 4,
      maxPhoneBlockDurationMinutes: 8,
      minRestBetweenCueBlocksMinutes: 18,
    };
    const sleepTiming = buildSleepTimingPrior({
      trainingEndedAt,
      settings,
    });
    const plan = buildNativePhoneSessionPlan({
      session: session(),
      sleepTiming,
      settings,
    });

    expect(plan.audioBed).toMatchObject({
      enabled: true,
      volume: 0.04,
    });
    expect(plan.safety.requireAudioBed).toBe(true);
    expect(plan.backgroundAudio).toMatchObject({
      option: "none",
      enabled: false,
    });
    expect(plan.cue).toMatchObject({
      cueId: "harp-flourish",
      assetId: "harp-flourish",
      resourceName: "harp_flourish",
      resourceExtension: "mp3",
      durationSeconds: getBuiltInCue("harp-flourish").durationSeconds,
      startVolume: 0.12,
      rampPerCue: 0.002,
      capVolume: 0.5,
    });
    expect(plan.movement).toMatchObject({
      stableLowMovementRequiredSeconds: 75,
      largeMovementThreshold: 0.7,
      cueAssociatedMovementWindowSeconds: 35,
      cueAssociatedMovementPauseSeconds: 210,
    });
    expect(plan.budget).toMatchObject({
      maxCuesTonight: 12,
      maxCuesPerBlock: 4,
      maxBlockDurationMinutes: 8,
      minRestBetweenBlocksMinutes: 18,
    });
  });

  it("uses the session-selected cue for native one-off cue playback", () => {
    const settings = createDefaultEngineSettings("standard");
    const selectedCue = getBuiltInCue("dx-harp-c5");
    const plan = buildNativePhoneSessionPlanFromCompletedSession({
      session: {
        ...session(),
        selectedCueId: selectedCue.id,
      },
      settings,
    });

    expect(plan.cue).toMatchObject({
      cueId: selectedCue.id,
      assetId: selectedCue.id,
      resourceName: selectedCue.nativeResourceName,
      resourceExtension: selectedCue.nativeResourceExtension,
      durationSeconds: selectedCue.durationSeconds,
    });
  });

  it("passes user-facing background audio and alarm fields through", () => {
    const settings = createDefaultEngineSettings("standard");
    const plan = buildNativePhoneSessionPlanFromCompletedSession({
      session: session(),
      settings,
      tlrOptions: {
        ...createDefaultTlrOptions("06:30"),
        backgroundNoise: "white_noise",
        alarm: {
          enabled: true,
          time: "06:30",
          autoShutoff: true,
          ringDurationMinutes: 5,
        },
      },
    });

    expect(plan.audioBed.enabled).toBe(true);
    expect(plan.safety.requireAudioBed).toBe(true);
    expect(plan.backgroundAudio).toMatchObject({
      option: "white_noise",
      enabled: true,
    });
    expect(plan.alarm).toMatchObject({
      enabled: true,
      autoShutoff: true,
      ringDurationSeconds: 300,
    });
    expect(plan.alarm.fireAt).toBe(plan.safety.stopAt);
  });

  it("represents skipped guided training explicitly in the native plan", () => {
    const settings = createDefaultEngineSettings("standard");
    const plan = buildNativePhoneSessionPlanFromCompletedSession({
      session: {
        ...session(),
        trainingStartedAt: trainingEndedAt,
        guidedTrainingSkipped: true,
      },
      settings,
    });

    expect(plan.training.guidedTrainingSkipped).toBe(true);
  });

  it("builds locked presleep training playback into a projected native plan", () => {
    const settings = createDefaultEngineSettings("standard");
    const trainingStartedAt = "2026-01-20T03:50:00.000Z";
    const plan = buildNativePhoneSessionPlanForLockedTraining({
      session: {
        ...session(),
        status: "setup",
        trainingStartedAt: undefined,
        trainingEndedAt: undefined,
      },
      trainingStartedAt,
      settings,
    });

    expect(plan.trainingStartedAt).toBe(trainingStartedAt);
    expect(plan.trainingEndedAt).toBe("2026-01-20T04:12:20.928Z");
    expect(plan.timing.earliestCueAt).toBe("2026-01-20T10:12:20.928Z");
    expect(plan.training.lockedPlayback).toMatchObject({
      enabled: true,
      audioResourceName: "final_lucid_training",
      audioResourceExtension: "mp3",
    });
    expect(plan.training.lockedPlayback.durationSeconds).toBeGreaterThan(1300);
    expect(plan.training.lockedPlayback.cueSchedule).toHaveLength(17);
    expect(plan.training.lockedPlayback.cueSchedule[0]).toMatchObject({
      markerIndex: 0,
    });
  });

  it("rejects plans without a required audible audio bed", () => {
    const settings = createDefaultEngineSettings("standard");
    const sleepTiming = buildSleepTimingPrior({
      trainingEndedAt,
      settings,
    });
    const plan = buildNativePhoneSessionPlan({
      session: session(),
      sleepTiming,
      settings,
    });

    expect(
      validateNativePhoneSessionPlan({
        ...plan,
        audioBed: {
          ...plan.audioBed,
          enabled: false as true,
        },
      }),
    ).toContain("Phone runtime requires an audible audio bed.");
  });

  it("builds a dev-only 45-minute kitchen sink plan with explicit REM gating", () => {
    const settings = {
      ...createDefaultEngineSettings("standard"),
      phoneAudioBedVolume: 0.01,
    };
    const now = "2026-01-20T04:01:00.000Z";
    const plan = buildDevKitchenSinkPhoneSessionPlan({
      session: {
        ...session(),
        status: "cueing",
        trainingStartedAt: now,
        trainingEndedAt: now,
        cueingStartedAt: now,
        selectedCueId: "clear-bell-chime",
        guidedTrainingSkipped: true,
      },
      settings,
      now,
    });

    expect(plan.nativePolicyVersion).toContain("dev-kitchen-sink-45m");
    expect(plan.audioBed.enabled).toBe(true);
    expect(plan.audioBed.volume).toBe(0.03);
    expect(plan.safety.stopAt).toBe(
      "2026-01-20T04:46:00.000Z",
    );
    expect(
      Date.parse(plan.safety.stopAt ?? "") - Date.parse(now),
    ).toBe(DEV_KITCHEN_SINK_DURATION_SECONDS * 1000);
    expect(plan.timing.predictedRemWindows).toEqual([
      {
        startAt: "2026-01-20T04:01:20.000Z",
        endAt: "2026-01-20T04:45:40.000Z",
        confidence: 1,
        source: "historical_sleep",
      },
    ]);
    expect(nativePhoneSessionUsesPredictedRemWindows(plan)).toBe(true);
    expect(plan.timing.cueIntervalRangeSeconds).toEqual([20, 30]);
    expect(plan.cue.cueId).toBe("clear-bell-chime");
    expect(plan.alarm.enabled).toBe(false);
  });
});
