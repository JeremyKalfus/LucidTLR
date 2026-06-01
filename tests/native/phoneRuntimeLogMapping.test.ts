import { describe, expect, it } from "vitest";

import type { NativePhoneRuntimeEvent } from "@/src/native/phoneRuntime/NativePhoneSessionPlan";
import {
  buildPhoneNightCalibrationNightFromRuntimeLogs,
  latestPhoneRuntimeStopTimestamp,
  summarizePhoneRuntimeEvents,
} from "@/src/native/phoneRuntime/phoneRuntimeLogMapping";

describe("phone runtime log mapping", () => {
  it("does not treat replacement stops followed by a restart as terminal", () => {
    const events: NativePhoneRuntimeEvent[] = [
      {
        id: "event-1",
        sessionId: "session-1",
        timestamp: "2026-01-20T09:55:00.000Z",
        eventType: "training_started",
        payload: {},
      },
      {
        id: "event-2",
        sessionId: "session-1",
        timestamp: "2026-01-20T10:00:00.000Z",
        eventType: "runtime_stopped",
        payload: {
          reason: "replaced_by_new_session",
          stoppedAt: "2026-01-20T10:00:00.000Z",
        },
      },
      {
        id: "event-3",
        sessionId: "session-1",
        timestamp: "2026-01-20T10:00:01.000Z",
        eventType: "runtime_started",
        payload: {},
      },
    ];

    expect(summarizePhoneRuntimeEvents(events)).toMatchObject({
      stopped: false,
      completed: false,
      errored: false,
    });
    expect(latestPhoneRuntimeStopTimestamp(events)).toBeNull();
  });

  it("summarizes stopped native runtime logs and exposes the native stop time", () => {
    const events: NativePhoneRuntimeEvent[] = [
      {
        id: "event-1",
        sessionId: "session-1",
        timestamp: "2026-01-20T10:00:00.000Z",
        eventType: "runtime_started",
        payload: {},
      },
      {
        id: "event-2",
        sessionId: "session-1",
        timestamp: "2026-01-20T11:00:00.000Z",
        eventType: "runtime_stopped",
        payload: {
          reason: "completed",
          stoppedAt: "2026-01-20T11:00:05.000Z",
        },
      },
    ];

    expect(summarizePhoneRuntimeEvents(events)).toMatchObject({
      stopped: true,
      completed: true,
      errored: false,
    });
    expect(latestPhoneRuntimeStopTimestamp(events)).toBe(
      "2026-01-20T11:00:05.000Z",
    );
  });

  it("summarizes user-stopped native runtime logs as stopped but not completed", () => {
    const events: NativePhoneRuntimeEvent[] = [
      {
        id: "event-1",
        sessionId: "session-1",
        timestamp: "2026-01-20T10:00:00.000Z",
        eventType: "runtime_started",
        payload: {},
      },
      {
        id: "event-2",
        sessionId: "session-1",
        timestamp: "2026-01-20T11:00:00.000Z",
        eventType: "runtime_stopped",
        payload: {
          reason: "user_stopped",
        },
      },
    ];

    expect(summarizePhoneRuntimeEvents(events)).toMatchObject({
      stopped: true,
      completed: false,
      errored: false,
    });
  });

  it("derives a local phone-night calibration record from runtime logs", () => {
    const events: NativePhoneRuntimeEvent[] = [
      {
        id: "event-1",
        sessionId: "session-1",
        timestamp: "2026-01-01T23:00:00.000Z",
        eventType: "training_completed",
        payload: {
          actualTrainingEndedAt: "2026-01-01T23:00:00.000Z",
        },
      },
      {
        id: "event-2",
        sessionId: "session-1",
        timestamp: "2026-01-01T23:00:00.000Z",
        eventType: "runtime_started",
        payload: {},
      },
      ...Array.from({ length: 12 }, (_, index) => ({
        id: `motion-${index}`,
        sessionId: "session-1",
        timestamp: new Date(
          Date.parse("2026-01-01T23:20:00.000Z") + index * 5000,
        ).toISOString(),
        eventType: "motion_summary" as const,
        payload: {
          roughMovementIntensity: "still",
        },
      })),
      {
        id: "event-3",
        sessionId: "session-1",
        timestamp: "2026-01-02T05:01:00.000Z",
        eventType: "cue_played",
        payload: {},
      },
      {
        id: "event-4",
        sessionId: "session-1",
        timestamp: "2026-01-02T06:00:00.000Z",
        eventType: "budget_exhausted",
        payload: {},
      },
      {
        id: "event-5",
        sessionId: "session-1",
        timestamp: "2026-01-02T07:15:00.000Z",
        eventType: "runtime_stopped",
        payload: {
          reason: "user_stopped",
          stoppedAt: "2026-01-02T07:15:00.000Z",
        },
      },
    ];

    expect(buildPhoneNightCalibrationNightFromRuntimeLogs(events)).toMatchObject({
      sessionId: "session-1",
      runtimeDurationMinutes: 495,
      observedEndMinutesAfterTraining: 495,
      quietStartMinutesAfterTraining: 20,
      quietRuntimeRatio: 1,
      cueCount: 1,
      cueBudgetExhausted: true,
      errored: false,
    });
  });
});
