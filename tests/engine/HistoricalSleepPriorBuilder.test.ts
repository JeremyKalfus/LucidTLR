import { describe, expect, it } from "vitest";

import type {
  ExternalSleepSession,
  ExternalSleepStage,
  ExternalSleepStageSegment,
} from "@/src/domain/types";
import { buildHistoricalSleepPrior } from "@/src/engine/sleepHistory/HistoricalSleepPriorBuilder";

const participantId = "participant-1";
const now = "2026-01-20T12:00:00.000Z";

function minutesAfterMidnight(iso: string): number {
  const date = new Date(iso);
  return date.getHours() * 60 + date.getMinutes();
}

function session(input: {
  id: string;
  startAt: string;
  endAt: string;
}): ExternalSleepSession {
  return {
    id: input.id,
    participantId,
    sourcePlatform: "apple_health",
    sourceRecordIdHash: input.id,
    startAt: input.startAt,
    endAt: input.endAt,
    importedAt: now,
    uploadStatus: "local_only",
  };
}

function segment(input: {
  id: string;
  sessionId: string;
  stage: ExternalSleepStage;
  startAt: string;
  endAt: string;
}): ExternalSleepStageSegment {
  return {
    id: input.id,
    externalSleepSessionId: input.sessionId,
    stage: input.stage,
    startAt: input.startAt,
    endAt: input.endAt,
    durationSeconds: Math.round(
      (Date.parse(input.endAt) - Date.parse(input.startAt)) / 1000,
    ),
  };
}

function validNight(index: number): {
  session: ExternalSleepSession;
  segments: ExternalSleepStageSegment[];
} {
  const day = String(index + 1).padStart(2, "0");
  const id = `night-${index}`;
  const startAt = `2026-01-${day}T04:00:00.000Z`;
  const onsetAt = `2026-01-${day}T04:20:00.000Z`;
  const remStartAt = `2026-01-${day}T08:30:00.000Z`;
  const remEndAt = `2026-01-${day}T08:50:00.000Z`;
  const wakeAt = `2026-01-${day}T12:00:00.000Z`;
  const endAt = `2026-01-${day}T12:10:00.000Z`;

  return {
    session: session({ id, startAt, endAt }),
    segments: [
      segment({
        id: `${id}-core`,
        sessionId: id,
        stage: "core",
        startAt: onsetAt,
        endAt: remStartAt,
      }),
      segment({
        id: `${id}-rem`,
        sessionId: id,
        stage: "rem",
        startAt: remStartAt,
        endAt: remEndAt,
      }),
      segment({
        id: `${id}-deep`,
        sessionId: id,
        stage: "deep",
        startAt: remEndAt,
        endAt: wakeAt,
      }),
      segment({
        id: `${id}-awake`,
        sessionId: id,
        stage: "awake",
        startAt: wakeAt,
        endAt,
      }),
    ],
  };
}

function buildPriorFromNightCount(count: number) {
  const nights = Array.from({ length: count }, (_, index) => validNight(index));

  return buildHistoricalSleepPrior({
    sessions: nights.map((night) => night.session),
    stageSegments: nights.flatMap((night) => night.segments),
    participantId,
    source: "apple_health",
    now,
  });
}

describe("HistoricalSleepPriorBuilder", () => {
  it("excludes invalid short sessions", () => {
    const shortSession = session({
      id: "short",
      startAt: "2026-01-01T04:00:00.000Z",
      endAt: "2026-01-01T06:00:00.000Z",
    });

    const prior = buildHistoricalSleepPrior({
      sessions: [shortSession],
      stageSegments: [
        segment({
          id: "short-core",
          sessionId: "short",
          stage: "core",
          startAt: "2026-01-01T04:10:00.000Z",
          endAt: "2026-01-01T05:50:00.000Z",
        }),
      ],
      participantId,
      source: "apple_health",
      now,
    });

    expect(prior.nightsIncluded).toBe(0);
    expect(prior.confidence).toBe("none");
    expect(prior.remWindows).toEqual([]);
  });

  it("computes sleep onset, wake, duration, REM offsets, and density", () => {
    const night = validNight(1);
    const prior = buildHistoricalSleepPrior({
      sessions: [night.session],
      stageSegments: night.segments,
      participantId,
      source: "apple_health",
      now,
    });

    expect(prior.nightsIncluded).toBe(1);
    expect(prior.confidence).toBe("low");
    expect(prior.medianSleepOnsetMinutesAfterMidnight).toBe(
      minutesAfterMidnight("2026-01-02T04:20:00.000Z"),
    );
    expect(prior.medianWakeMinutesAfterMidnight).toBe(
      minutesAfterMidnight("2026-01-02T12:00:00.000Z"),
    );
    expect(prior.medianSleepDurationMinutes).toBe(460);
    expect(prior.remDensityByMinute).toContainEqual({
      minuteAfterSleepOnset: 240,
      density: 1,
      nightsObserved: 1,
    });
    expect(prior.remWindows[0]).toMatchObject({
      startMinutesAfterSleepOnset: 240,
      endMinutesAfterSleepOnset: 270,
      confidence: 0.35,
      medianDurationMinutes: 20,
    });
  });

  it("uses confidence none/low/medium/high by usable night count", () => {
    expect(buildPriorFromNightCount(0).confidence).toBe("none");
    expect(buildPriorFromNightCount(1).confidence).toBe("low");
    expect(buildPriorFromNightCount(4).confidence).toBe("medium");
    expect(buildPriorFromNightCount(10).confidence).toBe("high");
  });
});
