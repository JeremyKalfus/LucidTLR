import { describe, expect, it } from "vitest";

import type { NativePhoneRuntimeEvent } from "@/src/native/phoneRuntime/NativePhoneSessionPlan";
import {
  latestPhoneRuntimeStopTimestamp,
  summarizePhoneRuntimeEvents,
} from "@/src/native/phoneRuntime/phoneRuntimeLogMapping";

describe("phone runtime log mapping", () => {
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
});
