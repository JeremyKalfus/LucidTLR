import { describe, expect, it } from "vitest";

import type { HistoricalSleepPrior, NightSession } from "@/src/domain/types";
import {
  buildSleepTimingPrior,
  createDefaultEngineSettings,
} from "@/src/engine";
import { buildNativePhoneSessionPlan } from "@/src/native/phoneRuntime/buildNativePhoneSessionPlan";
import { validateNativePhoneSessionPlan } from "@/src/native/phoneRuntime/NativePhoneSessionPlan";

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
    expect(plan.cue).toMatchObject({
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
});
