import { describe, expect, it } from "vitest";

import type { NightSession, SoundSensitivityProfile } from "@/src/domain/types";
import {
  buildEngineSnapshot,
  buildSleepTimingPrior,
  createDefaultEngineSettings,
  evaluateCueDecision,
  type CueDecisionContext,
  type CueDecisionSettings,
} from "@/src/engine";

const trainingEndedAt = "2026-01-01T23:00:00.000Z";
const cueWindowStart = "2026-01-02T05:00:00.000Z";

function localClockAfter(anchorIso: string, hours: number, minutes: number) {
  const anchor = new Date(anchorIso);
  const candidate = new Date(anchor);

  candidate.setHours(hours, minutes, 0, 0);

  if (candidate.getTime() <= anchor.getTime()) {
    candidate.setDate(candidate.getDate() + 1);
  }

  return candidate.toISOString();
}

function makeSession(overrides: Partial<NightSession> = {}): NightSession {
  return {
    id: "session-1",
    participantId: "participant-1",
    sessionType: "tlr",
    mode: "phone",
    status: "waiting_for_cue_window",
    protocolVersion: "tlr-2026-001",
    startedAt: "2026-01-01T22:45:00.000Z",
    trainingStartedAt: "2026-01-01T22:45:00.000Z",
    trainingEndedAt,
    ...overrides,
  };
}

function makeSettings(
  profile: SoundSensitivityProfile = "standard",
  overrides: Partial<CueDecisionSettings> = {},
): CueDecisionSettings {
  return {
    ...createDefaultEngineSettings(profile),
    ...overrides,
  };
}

function makeContext(
  overrides: Partial<CueDecisionContext> = {},
): CueDecisionContext {
  const settings = overrides.settings ?? makeSettings();

  return {
    now: cueWindowStart,
    mode: "phone",
    session: makeSession(),
    settings,
    cueHistory: {
      previousCues: [],
      numberOfCuesTonight: 0,
      numberOfCuesInCurrentBlock: 0,
      latestVolumeLevel: settings.volumeStartLevel,
    },
    movement: {
      recentMovementIntensity: 0,
      stableLowMovementSeconds: settings.stableLowMovementRequiredSeconds,
      phonePickedUpRecently: false,
      orientationChangedRecently: false,
      largeMovementEvents: [],
    },
    userFeedback: {},
    ...overrides,
  };
}

describe("CueDecisionEngine hard gates", () => {
  it.each([
    {
      name: "before training ends",
      context: makeContext({
        session: makeSession({
          status: "training",
          trainingEndedAt: undefined,
        }),
      }),
      action: "suppress",
      reason: "before_training_finished",
    },
    {
      name: "inactive session",
      context: makeContext({
        session: makeSession({ status: "ended" }),
      }),
      action: "suppress",
      reason: "session_not_active",
    },
    {
      name: "before 6-hour cue window",
      context: makeContext({
        now: "2026-01-02T04:59:00.000Z",
      }),
      action: "suppress",
      reason: "before_cue_window",
    },
    {
      name: "recent cue",
      context: makeContext({
        cueHistory: {
          previousCues: [],
          lastCueTime: "2026-01-02T04:59:50.000Z",
          numberOfCuesTonight: 1,
          numberOfCuesInCurrentBlock: 1,
        },
      }),
      action: "suppress",
      reason: "recent_cue",
    },
    {
      name: "active movement",
      context: makeContext({
        movement: {
          recentMovementIntensity: 0.9,
          stableLowMovementSeconds: 0,
          phonePickedUpRecently: false,
          orientationChangedRecently: false,
          largeMovementEvents: [],
        },
      }),
      action: "pause",
      reason: "movement",
    },
    {
      name: "cue-associated movement",
      context: makeContext({
        cueHistory: {
          previousCues: [],
          lastCueTime: "2026-01-02T04:59:40.000Z",
          numberOfCuesTonight: 1,
          numberOfCuesInCurrentBlock: 1,
        },
        movement: {
          recentMovementIntensity: 0,
          stableLowMovementSeconds: 60,
          phonePickedUpRecently: false,
          orientationChangedRecently: false,
          movementAfterLastCueAt: "2026-01-02T04:59:50.000Z",
          largeMovementEvents: [],
        },
      }),
      action: "pause",
      reason: "cue_associated_movement",
    },
    {
      name: "user-reported awakening",
      context: makeContext({
        userFeedback: {
          cueWokeUser: true,
          returnedToSleep: true,
          cueWokeUserReportedAt: "2026-01-02T04:30:00.000Z",
        },
      }),
      action: "pause",
      reason: "post_awakening_pause",
    },
    {
      name: "cue budget exhausted",
      context: makeContext({
        cueHistory: {
          previousCues: [],
          numberOfCuesTonight: 60,
          numberOfCuesInCurrentBlock: 0,
        },
      }),
      action: "suppress",
      reason: "cue_budget_exhausted",
    },
  ])("$name -> $reason", ({ action, context, reason }) => {
    const decision = evaluateCueDecision(context);

    expect(decision.action).toBe(action);
    expect(decision.reason).toBe(reason);
  });
});

describe("Phone Mode scoring", () => {
  it("plays a cue 6 hours after training with stable movement", () => {
    const decision = evaluateCueDecision(makeContext());

    expect(decision.action).toBe("play_cue");
    expect(decision.reason).toBe("phone_late_rem_opportunity");
    expect(decision.opportunityScore).toBeGreaterThanOrEqual(0.7);
    expect(decision.scoreBreakdown.timeOpportunityScore).toBe(1);
  });

  it("becomes eligible after cue-associated pause ends and movement is stable", () => {
    const decision = evaluateCueDecision(
      makeContext({
        now: "2026-01-02T05:03:01.000Z",
        cueHistory: {
          previousCues: [],
          lastCueTime: "2026-01-02T04:59:40.000Z",
          numberOfCuesTonight: 1,
          numberOfCuesInCurrentBlock: 1,
        },
        movement: {
          recentMovementIntensity: 0,
          stableLowMovementSeconds: 60,
          phonePickedUpRecently: false,
          orientationChangedRecently: false,
          movementAfterLastCueAt: "2026-01-02T04:59:50.000Z",
          largeMovementEvents: [],
        },
      }),
    );

    expect(decision.action).toBe("play_cue");
    expect(decision.reason).toBe("phone_late_rem_opportunity");
  });

  it("uses lower sensitive volume and budget than standard", () => {
    const sensitive = createDefaultEngineSettings("sensitive");
    const standard = createDefaultEngineSettings("standard");

    expect(sensitive.volumeCap).toBeLessThan(standard.volumeCap);
    expect(sensitive.volumeRampPerCue).toBeLessThan(standard.volumeRampPerCue);
    expect(sensitive.maxCuesPerNight).toBeLessThan(standard.maxCuesPerNight);
  });

  it("uses a higher hard-to-wake cap and budget than standard", () => {
    const hardToWake = createDefaultEngineSettings("hard_to_wake");
    const standard = createDefaultEngineSettings("standard");

    expect(hardToWake.volumeCap).toBeGreaterThan(standard.volumeCap);
    expect(hardToWake.maxCuesPerNight).toBeGreaterThan(
      standard.maxCuesPerNight,
    );
  });
});

describe("Watch Mode opportunity", () => {
  function watchContext(overrides: Partial<CueDecisionContext> = {}) {
    return makeContext({
      mode: "watch",
      session: makeSession({ mode: "watch" }),
      watchSignal: {
        epochStart: "2026-01-02T05:00:00.000Z",
        epochEnd: "2026-01-02T05:00:30.000Z",
        remProbability: 0.3,
        sleepProbability: 0.8,
        sensorQuality: "good",
        stableLowMovementSeconds: 60,
        consecutiveLikelyRemEpochs: 1,
        connectivityState: "connected",
      },
      ...overrides,
    });
  }

  it("plays on likely REM", () => {
    const decision = evaluateCueDecision(watchContext());

    expect(decision.action).toBe("play_cue");
    expect(decision.reason).toBe("watch_likely_rem");
  });

  it("suppresses below the REM threshold", () => {
    const decision = evaluateCueDecision(
      watchContext({
        watchSignal: {
          epochStart: "2026-01-02T05:00:00.000Z",
          epochEnd: "2026-01-02T05:00:30.000Z",
          remProbability: 0.1,
          sleepProbability: 0.8,
          sensorQuality: "good",
          stableLowMovementSeconds: 60,
          consecutiveLikelyRemEpochs: 1,
          connectivityState: "connected",
        },
      }),
    );

    expect(decision.action).toBe("suppress");
    expect(decision.reason).toBe("outside_sleep_opportunity");
  });

  it("suppresses after 5 consecutive likely-REM epochs", () => {
    const decision = evaluateCueDecision(
      watchContext({
        watchSignal: {
          epochStart: "2026-01-02T05:00:00.000Z",
          epochEnd: "2026-01-02T05:00:30.000Z",
          remProbability: 0.3,
          sleepProbability: 0.8,
          sensorQuality: "good",
          stableLowMovementSeconds: 60,
          consecutiveLikelyRemEpochs: 5,
          connectivityState: "connected",
        },
      }),
    );

    expect(decision.action).toBe("suppress");
    expect(decision.reason).toBe("rem_persistent_suppression");
  });

  it("suppresses missing sensor quality", () => {
    const decision = evaluateCueDecision(
      watchContext({
        watchSignal: {
          epochStart: "2026-01-02T05:00:00.000Z",
          epochEnd: "2026-01-02T05:00:30.000Z",
          remProbability: 0.3,
          sleepProbability: 0.8,
          sensorQuality: "missing",
          stableLowMovementSeconds: 60,
          consecutiveLikelyRemEpochs: 1,
          connectivityState: "disconnected",
        },
      }),
    );

    expect(decision.action).toBe("suppress");
    expect(decision.reason).toBe("sensor_quality_bad");
  });
});

describe("Sleep timing prior and snapshots", () => {
  it("uses default sleep timing and phone cue window", () => {
    const timing = buildSleepTimingPrior({
      trainingEndedAt,
      settings: createDefaultEngineSettings(),
    });

    expect(timing.estimatedSleepOnsetAt).toBe("2026-01-01T23:20:00.000Z");
    expect(timing.expectedWakeAt).toBe(localClockAfter(trainingEndedAt, 7, 0));
    expect(timing.likelyPhoneCueWindowStart).toBe(cueWindowStart);
    expect(timing.confidence).toBe("low");
    expect(timing.source).toBe("default");
  });

  it("formats visible engine fields for UI surfaces", () => {
    const context = makeContext();
    const decision = evaluateCueDecision(context);
    const snapshot = buildEngineSnapshot({ context, decision });

    expect(snapshot.currentValues.selectedMode).toBe("phone");
    expect(snapshot.currentValues.sensitivityProfile).toBe("standard");
    expect(snapshot.currentValues.cueCountTonight).toBe("0 / 60");
    expect(snapshot.currentValues.latestDecisionReason).toBe(
      "phone late rem opportunity",
    );
    expect(snapshot.scoreRows.map((row) => row.label)).toContain(
      "time opportunity",
    );
  });
});
