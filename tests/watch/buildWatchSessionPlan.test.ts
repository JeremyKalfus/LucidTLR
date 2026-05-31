import { describe, expect, it } from "vitest";

import type { NightSession } from "@/src/domain/types";
import {
  buildSleepTimingPrior,
  createDefaultEngineSettings,
} from "@/src/engine";
import { buildNativeWatchSessionPlan } from "@/src/native/watch/buildWatchSessionPlan";

function watchSession(): NightSession {
  return {
    id: "session-1",
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

describe("buildNativeWatchSessionPlan", () => {
  it("includes iPhone audio bed, cue settings, and watch classifier policy", () => {
    const settings = createDefaultEngineSettings("standard");
    const sleepTiming = buildSleepTimingPrior({
      trainingEndedAt: "2026-01-01T04:15:00.000Z",
      settings,
    });
    const plan = buildNativeWatchSessionPlan({
      session: watchSession(),
      settings,
      sleepTiming,
      classifierModelAvailable: false,
    });

    expect(plan.mode).toBe("watch");
    expect(plan.iPhoneAudio).toMatchObject({
      audioBedRequired: true,
      audioBedAssetId: "lucidcue-audible-bed-white-noise",
      cueId: "harp-flourish",
    });
    expect(plan.watch).toMatchObject({
      epochSeconds: 30,
      requireHeartRate: true,
      requireMotion: true,
      motionTargetHz: 30,
      enableWaterLock: true,
    });
    expect(plan.classifier).toMatchObject({
      modelAvailable: false,
      remThreshold: 0.24,
      suppressAfterConsecutiveLikelyRemEpochs: 5,
    });
    expect(plan.safety.requireIPhoneAudioBed).toBe(true);
  });
});
