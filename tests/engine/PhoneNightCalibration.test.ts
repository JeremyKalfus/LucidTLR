import { describe, expect, it } from "vitest";

import type { PhoneNightCalibrationNight } from "@/src/domain/types";
import {
  applyPhoneNightCalibrationToSettings,
  buildPhoneNightCalibrationPrior,
  buildSleepTimingPrior,
  createDefaultEngineSettings,
} from "@/src/engine";

function makeNight(
  overrides: Partial<PhoneNightCalibrationNight> = {},
): PhoneNightCalibrationNight {
  return {
    sessionId: "session-1",
    generatedAt: "2026-01-02T12:00:00.000Z",
    trainingEndedAt: "2026-01-01T23:00:00.000Z",
    runtimeStartedAt: "2026-01-01T23:00:00.000Z",
    runtimeStoppedAt: "2026-01-02T07:15:00.000Z",
    runtimeDurationMinutes: 495,
    observedEndMinutesAfterTraining: 495,
    quietStartMinutesAfterTraining: 24,
    quietRuntimeRatio: 0.96,
    cueCount: 60,
    cueFailures: 0,
    cueBudgetExhausted: true,
    movementPauseCount: 1,
    largeMovementCount: 1,
    interrupted: false,
    errored: false,
    ...overrides,
  };
}

describe("PhoneNightCalibration", () => {
  it("builds a timing prior from completed overnight Phone Mode runs only", () => {
    const prior = buildPhoneNightCalibrationPrior({
      now: "2026-01-03T12:00:00.000Z",
      nights: [
        makeNight(),
        makeNight({
          sessionId: "stress-test",
          runtimeDurationMinutes: 45,
          observedEndMinutesAfterTraining: 45,
        }),
      ],
    });

    expect(prior.nightsIncluded).toBe(1);
    expect(prior.confidence).toBe("low");
    expect(prior.medianObservedEndMinutesAfterTraining).toBe(495);
    expect(prior.medianQuietRuntimeRatio).toBe(0.96);
  });

  it("uses local Phone Mode timing without creating historical REM windows", () => {
    const settings = createDefaultEngineSettings("standard");
    const phoneNightPrior = buildPhoneNightCalibrationPrior({
      nights: [makeNight()],
    });
    const sleepTiming = buildSleepTimingPrior({
      trainingEndedAt: "2026-01-03T23:00:00.000Z",
      settings,
      phoneNightPrior,
    });

    expect(sleepTiming.source).toBe("local_phone_runtime");
    expect(sleepTiming.expectedWakeAt).toBe("2026-01-04T07:15:00.000Z");
    expect(sleepTiming.predictedRemWindows).toEqual([
      expect.objectContaining({
        source: "default",
        startAt: "2026-01-04T05:00:00.000Z",
      }),
    ]);
  });

  it("conservatively reduces volume and cue budget after adverse feedback", () => {
    const settings = createDefaultEngineSettings("standard");
    const prior = buildPhoneNightCalibrationPrior({
      nights: [
        makeNight({
          cueWokeUser: true,
          sleepQualityRating: 2,
          cueBudgetExhausted: true,
        }),
      ],
    });
    const adjusted = applyPhoneNightCalibrationToSettings(settings, prior);

    expect(adjusted.maxCuesPerNight).toBeLessThan(settings.maxCuesPerNight);
    expect(adjusted.volumeStartLevel).toBeLessThan(settings.volumeStartLevel);
    expect(adjusted.volumeCap).toBeLessThan(settings.volumeCap);
  });
});
