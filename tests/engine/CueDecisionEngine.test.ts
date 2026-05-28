import { describe, expect, it } from "vitest";

import type {
  HistoricalSleepPrior,
  NightSession,
  SoundSensitivityProfile,
  WatchSensorQuality,
} from "@/src/domain/types";
import {
  buildEngineSnapshot,
  buildInactiveEngineSnapshot,
  buildSleepTimingPrior,
  createDefaultEngineSettings,
  evaluateCueDecision,
  formatEnginePercent,
  normalizeEngineSettings,
  type CueDecisionContext,
  type CueDecisionSettings,
} from "@/src/engine";
import { buildCueBudgetState } from "@/src/engine/CueBudgetController";

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

function makeHistoricalPrior(
  overrides: Partial<HistoricalSleepPrior> = {},
): HistoricalSleepPrior {
  return {
    source: "apple_health",
    nightsIncluded: 10,
    confidence: "high",
    medianSleepOnsetMinutesAfterMidnight: null,
    medianWakeMinutesAfterMidnight: null,
    medianSleepDurationMinutes: null,
    remWindows: [
      {
        startMinutesAfterSleepOnset: 330,
        endMinutesAfterSleepOnset: 360,
        confidence: 0.9,
        medianDurationMinutes: 20,
      },
    ],
    remDensityByMinute: [],
    generatedAt: "2026-01-01T12:00:00.000Z",
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
  it("uses normalized volume ramp defaults and percent display", () => {
    const standard = createDefaultEngineSettings("standard");
    const sensitive = createDefaultEngineSettings("sensitive");

    expect(standard.volumeRampPerCue).toBe(0.0016);
    expect(sensitive.volumeRampPerCue).toBe(0.0008);
    expect(formatEnginePercent(standard.volumeRampPerCue)).toBe("0.16%");
    expect(formatEnginePercent(sensitive.volumeRampPerCue)).toBe("0.08%");
    expect(formatEnginePercent(standard.volumeStartLevel)).toBe("16%");
  });

  it("normalizes old persisted volume ramp settings", () => {
    const normalized = normalizeEngineSettings({
      ...createDefaultEngineSettings("standard"),
      volumeRampPerCue: 0.16,
    });

    expect(normalized.volumeRampPerCue).toBe(0.0016);
  });

  it("plays a cue 6 hours after training with stable movement", () => {
    const decision = evaluateCueDecision(makeContext());

    expect(decision.action).toBe("play_cue");
    expect(decision.reason).toBe("phone_late_rem_opportunity");
    expect(decision.opportunityScore).toBeGreaterThanOrEqual(0.7);
    expect(decision.scoreBreakdown.timeOpportunityScore).toBe(1);
  });

  it("uses the weighted phone score formula with a visible sleep prior", () => {
    const settings = makeSettings();
    const decision = evaluateCueDecision(
      makeContext({
        settings,
        cueHistory: {
          previousCues: [],
          numberOfCuesTonight: 30,
          numberOfCuesInCurrentBlock: 0,
          latestVolumeLevel: settings.volumeStartLevel,
        },
        userFeedback: {
          cueWokeUser: true,
        },
      }),
    );
    const expectedScore =
      0.3 * 1 + 0.25 * 1 + 0.2 * 1 + 0.1 * 1 + 0.05 * 0.6 + 0.1 * 0.5;

    expect(decision.scoreBreakdown.sleepPriorScore).toBe(1);
    expect(decision.scoreBreakdown.historicalRemWindowScore).toBe(1);
    expect(decision.scoreBreakdown.noInteractionScore).toBe(1);
    expect(decision.opportunityScore).toBeCloseTo(expectedScore);
  });

  it("scores higher inside a historical REM window than outside one", () => {
    const historicalSleepPrior = makeHistoricalPrior();
    const inside = evaluateCueDecision(
      makeContext({
        now: "2026-01-02T05:00:00.000Z",
        historicalSleepPrior,
      }),
    );
    const outside = evaluateCueDecision(
      makeContext({
        now: "2026-01-02T05:45:00.000Z",
        historicalSleepPrior,
      }),
    );

    expect(inside.sleepTiming.predictedRemWindows[0]).toMatchObject({
      source: "historical_sleep",
      startAt: "2026-01-02T04:50:00.000Z",
      endAt: "2026-01-02T05:20:00.000Z",
    });
    expect(inside.scoreBreakdown.historicalRemWindowScore).toBeCloseTo(0.9);
    expect(outside.scoreBreakdown.historicalRemWindowScore).toBe(0);
    expect(inside.opportunityScore).toBeGreaterThan(outside.opportunityScore);
  });

  it("uses a predicted historical REM window to cue before the default 6-hour window", () => {
    const decision = evaluateCueDecision(
      makeContext({
        now: "2026-01-02T04:55:00.000Z",
        historicalSleepPrior: makeHistoricalPrior(),
      }),
    );

    expect(decision.sleepTiming.likelyPhoneCueWindowStart).toBe(
      "2026-01-02T04:50:00.000Z",
    );
    expect(decision.scoreBreakdown.timeOpportunityScore).toBe(0.6);
    expect(decision.scoreBreakdown.historicalRemWindowScore).toBeCloseTo(0.9);
    expect(decision.action).toBe("play_cue");
    expect(decision.reason).toBe("phone_late_rem_opportunity");
  });

  it("keeps default phone behavior close when no historical prior exists", () => {
    const decision = evaluateCueDecision(makeContext());

    expect(decision.sleepTiming.source).toBe("default");
    expect(decision.sleepTiming.predictedRemWindows[0]?.source).toBe("default");
    expect(decision.scoreBreakdown.historicalRemWindowScore).toBe(
      decision.scoreBreakdown.timeOpportunityScore,
    );
    expect(decision.action).toBe("play_cue");
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

  it("resumes after a cue block rest without an external counter reset", () => {
    const context = makeContext({
      now: "2026-01-02T05:21:00.000Z",
      cueHistory: {
        previousCues: [],
        lastCueTime: "2026-01-02T05:00:00.000Z",
        numberOfCuesTonight: 15,
        numberOfCuesInCurrentBlock: 15,
        currentBlockStartedAt: "2026-01-02T04:50:00.000Z",
      },
    });
    const budget = buildCueBudgetState(context);
    const decision = evaluateCueDecision(context);

    expect(budget.cuesInCurrentBlock).toBe(0);
    expect(budget.isBlockBudgetExhausted).toBe(false);
    expect(budget.isBlockResting).toBe(false);
    expect(decision.action).toBe("play_cue");
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

  it("can cue on likely REM before the phone cue window", () => {
    const decision = evaluateCueDecision(
      watchContext({
        now: "2026-01-02T04:00:00.000Z",
        watchSignal: {
          epochStart: "2026-01-02T04:00:00.000Z",
          epochEnd: "2026-01-02T04:00:30.000Z",
          remProbability: 0.3,
          sleepProbability: 0.8,
          sensorQuality: "good",
          stableLowMovementSeconds: 60,
          consecutiveLikelyRemEpochs: 1,
          connectivityState: "connected",
        },
      }),
    );

    expect(decision.action).toBe("play_cue");
    expect(decision.reason).toBe("watch_likely_rem");
  });

  it("pauses when the watch epoch has unstable movement", () => {
    const decision = evaluateCueDecision(
      watchContext({
        watchSignal: {
          epochStart: "2026-01-02T05:00:00.000Z",
          epochEnd: "2026-01-02T05:00:30.000Z",
          remProbability: 0.3,
          sleepProbability: 0.8,
          sensorQuality: "good",
          stableLowMovementSeconds: 0,
          consecutiveLikelyRemEpochs: 1,
          connectivityState: "connected",
        },
      }),
    );

    expect(decision.action).toBe("pause");
    expect(decision.reason).toBe("movement");
  });

  it("exposes non-stub watch opportunity scoring", () => {
    const context = watchContext({
      watchSignal: {
        epochStart: "2026-01-02T05:00:00.000Z",
        epochEnd: "2026-01-02T05:00:30.000Z",
        remProbability: 0.26,
        sleepProbability: 0.75,
        sensorQuality: "good",
        stableLowMovementSeconds: 60,
        consecutiveLikelyRemEpochs: 1,
        connectivityState: "connected",
      },
    });
    const decision = evaluateCueDecision(context);
    const snapshot = buildEngineSnapshot({ context, decision });

    expect(decision.opportunityScore).toBeGreaterThan(0);
    expect(decision.opportunityScore).toBeLessThan(1);
    expect(decision.watch?.scoreBreakdown?.sleepProbabilityScore).toBe(0.75);
    expect(snapshot.scoreRows.map((row) => row.label)).toEqual([
      "watch REM",
      "watch sleep probability",
      "watch movement stability",
      "sleep prior",
      "watch opportunity",
    ]);
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

  it.each(["missing", "bad"] as WatchSensorQuality[])(
    "suppresses %s sensor quality",
    (sensorQuality) => {
      const decision = evaluateCueDecision(
        watchContext({
          watchSignal: {
            epochStart: "2026-01-02T05:00:00.000Z",
            epochEnd: "2026-01-02T05:00:30.000Z",
            remProbability: 0.3,
            sleepProbability: 0.8,
            sensorQuality,
            stableLowMovementSeconds: 60,
            consecutiveLikelyRemEpochs: 1,
            connectivityState: "disconnected",
          },
        }),
      );

      expect(decision.action).toBe("suppress");
      expect(decision.reason).toBe("sensor_quality_bad");
    },
  );

  it("keeps live REM probability decisive even with a historical REM prior", () => {
    const decision = evaluateCueDecision(
      watchContext({
        historicalSleepPrior: makeHistoricalPrior(),
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

    expect(decision.sleepTiming.source).toBe("historical_sleep");
    expect(decision.action).toBe("suppress");
    expect(decision.reason).toBe("outside_sleep_opportunity");
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
    expect(timing.predictedRemWindows[0]).toMatchObject({
      source: "default",
      startAt: cueWindowStart,
    });
    expect(timing.confidence).toBe("low");
    expect(timing.source).toBe("default");
  });

  it("bounds an early historical Phone Mode cue window at 4 hours after training", () => {
    const timing = buildSleepTimingPrior({
      trainingEndedAt,
      settings: createDefaultEngineSettings(),
      historicalSleepPrior: makeHistoricalPrior({
        remWindows: [
          {
            startMinutesAfterSleepOnset: 180,
            endMinutesAfterSleepOnset: 240,
            confidence: 0.9,
          },
        ],
      }),
    });

    expect(timing.source).toBe("historical_sleep");
    expect(timing.predictedRemWindows[0]).toMatchObject({
      source: "historical_sleep",
      startAt: "2026-01-02T02:20:00.000Z",
      endAt: "2026-01-02T03:20:00.000Z",
    });
    expect(timing.likelyPhoneCueWindowStart).toBe("2026-01-02T03:00:00.000Z");
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
    expect(snapshot.scoreRows.map((row) => row.label)).toContain(
      "historical REM window",
    );
  });

  it("shows idle state without a cue-decision reason when no overnight run is active", () => {
    const context = makeContext({
      session: null,
    });
    const snapshot = buildInactiveEngineSnapshot({ context });

    expect(snapshot.decision.action).toBe("idle");
    expect(snapshot.decision.reason).toBe("none");
    expect(snapshot.currentValues.currentEngineStatus).toBe("engine idle");
    expect(snapshot.currentValues.latestDecisionReason).toBe("none");
    expect(snapshot.currentValues.nextCheckTime).toBe("not scheduled");
    expect(snapshot.decisionLogLine).toBe("");
  });
});
