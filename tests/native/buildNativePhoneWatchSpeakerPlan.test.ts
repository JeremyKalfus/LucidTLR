import { describe, expect, it } from "vitest";

import type { NightSession } from "@/src/domain/types";
import {
  buildSleepTimingPrior,
  createDefaultEngineSettings,
} from "@/src/engine";
import { createDefaultTlrOptions } from "@/src/features/tlrOptions/tlrOptions";
import { FINAL_LUCID_TRAINING_DURATION_SECONDS } from "@/src/audio/trainingAudio";
import { buildNativePhoneWatchSpeakerPlan } from "@/src/native/phoneRuntime/buildNativePhoneWatchSpeakerPlan";

function watchSession(sessionType: NightSession["sessionType"] = "tlr"): NightSession {
  return {
    id: `watch-${sessionType}`,
    participantId: "participant-1",
    sessionType,
    mode: "watch",
    status: "setup",
    protocolVersion: "tlr-2026-001",
    startedAt: "2026-01-20T03:50:00.000Z",
    selectedCueId: sessionType === "tlr" ? "harp-flourish" : undefined,
  };
}

describe("buildNativePhoneWatchSpeakerPlan", () => {
  it("builds a speaker-only phone plan that never schedules phone cueing", () => {
    const settings = createDefaultEngineSettings("standard");
    const session = watchSession();
    const sleepTiming = buildSleepTimingPrior({
      trainingEndedAt: session.startedAt,
      settings,
    });
    const startedAt = "2026-01-20T04:00:00.000Z";
    const plan = buildNativePhoneWatchSpeakerPlan({
      session,
      settings,
      sleepTiming,
      startedAt,
    });

    expect(plan.speakerOnly).toBe(true);
    expect(plan.sessionId).toBe("watch-tlr");
    expect(plan.training.lockedPlayback.enabled).toBe(true);
    expect(plan.trainingStartedAt).toBe(startedAt);
    expect(plan.trainingEndedAt).toBe(
      new Date(
        Date.parse(startedAt) + FINAL_LUCID_TRAINING_DURATION_SECONDS * 1000,
      ).toISOString(),
    );
    expect(plan.budget).toMatchObject({
      maxCuesTonight: 0,
      maxCuesPerBlock: 0,
    });
    expect(plan.movement.requireAccelerometer).toBe(false);
  });

  it("starts the audio bed immediately when training is skipped or TLR is disabled", () => {
    const settings = createDefaultEngineSettings("standard");
    const session = watchSession("sleep_log");
    const sleepTiming = buildSleepTimingPrior({
      trainingEndedAt: session.startedAt,
      settings,
    });
    const plan = buildNativePhoneWatchSpeakerPlan({
      session,
      settings,
      sleepTiming,
      startedAt: "2026-01-20T04:00:00.000Z",
      tlrOptions: {
        ...createDefaultTlrOptions("06:30"),
        skipGuidedTraining: true,
        backgroundNoise: "binaural_beats",
      },
    });

    expect(plan.speakerOnly).toBe(true);
    expect(plan.training.guidedTrainingSkipped).toBe(true);
    expect(plan.training.lockedPlayback).toMatchObject({
      enabled: false,
      cueSchedule: [],
    });
    expect(plan.audioBed).toMatchObject({
      enabled: true,
      assetId: "lucidcue-audible-bed-binaural-beats",
    });
  });
});
