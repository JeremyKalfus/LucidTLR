import { describe, expect, it } from "vitest";

import { FINAL_LUCID_TRAINING_DURATION_SECONDS } from "@/src/audio/trainingAudio";
import type { NightSession } from "@/src/domain/types";
import {
  getWatchModeTrainingPlaybackState,
  watchSessionHasPhoneTrainingAudio,
} from "@/src/features/watchMode/watchModeTrainingPlayback";

function watchTlrSession(overrides: Partial<NightSession> = {}): NightSession {
  return {
    id: "watch-session-1",
    participantId: "participant-1",
    sessionType: "tlr",
    mode: "watch",
    status: "setup",
    protocolVersion: "tlr-2026-001",
    startedAt: "2026-06-12T03:00:00.000Z",
    selectedCueId: "harp-flourish",
    guidedTrainingSkipped: false,
    ...overrides,
  };
}

describe("Watch Mode phone-played training playback state", () => {
  it("shows the locked-screen training section during an audio-training Watch window", () => {
    const state = getWatchModeTrainingPlaybackState({
      session: watchTlrSession({
        trainingStartedAt: "2026-06-12T03:00:10.000Z",
      }),
      now: "2026-06-12T03:05:10.000Z",
    });

    expect(state.visible).toBe(true);
    expect(state.enabled).toBe(true);
    expect(state.elapsedSeconds).toBe(300);
    expect(state.remainingSeconds).toBeGreaterThan(1000);
  });

  it("does not show for sleep-log, skipped-guided-training, ended, or expired windows", () => {
    const base = watchTlrSession();
    const afterPlannedEnd = new Date(
      Date.parse(base.startedAt) +
        FINAL_LUCID_TRAINING_DURATION_SECONDS * 1000 +
        2000,
    ).toISOString();

    expect(
      watchSessionHasPhoneTrainingAudio(
        watchTlrSession({ sessionType: "sleep_log" }),
      ),
    ).toBe(false);
    expect(
      getWatchModeTrainingPlaybackState({
        session: watchTlrSession({ guidedTrainingSkipped: true }),
        now: "2026-06-12T03:05:10.000Z",
      }).visible,
    ).toBe(false);
    expect(
      getWatchModeTrainingPlaybackState({
        session: watchTlrSession({
          trainingStartedAt: "2026-06-12T03:00:10.000Z",
          trainingEndedAt: "2026-06-12T03:08:10.000Z",
        }),
        now: "2026-06-12T03:09:10.000Z",
      }).visible,
    ).toBe(false);
    expect(
      getWatchModeTrainingPlaybackState({
        session: watchTlrSession({
          trainingStartedAt: "2026-06-12T03:00:10.000Z",
        }),
        now: afterPlannedEnd,
      }).visible,
    ).toBe(false);
  });

  it("starts playback once from persisted session timestamps and closes expired windows", () => {
    const notStarted = getWatchModeTrainingPlaybackState({
      session: watchTlrSession(),
      now: "2026-06-12T03:00:05.000Z",
    });
    const started = getWatchModeTrainingPlaybackState({
      session: watchTlrSession({
        trainingStartedAt: "2026-06-12T03:00:05.000Z",
      }),
      now: "2026-06-12T03:00:06.000Z",
    });
    const expired = getWatchModeTrainingPlaybackState({
      session: watchTlrSession({
        trainingStartedAt: "2026-06-12T03:00:05.000Z",
      }),
      now: "2026-06-12T03:22:21.000Z",
    });

    expect(notStarted.shouldStartPlayback).toBe(true);
    expect(started.shouldStartPlayback).toBe(false);
    expect(expired.windowExpired).toBe(true);
  });
});
