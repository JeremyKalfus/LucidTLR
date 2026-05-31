import { describe, expect, it } from "vitest";

import {
  latestWatchRuntimeStopTimestamp,
  summarizeWatchRuntime,
} from "@/src/native/watch/watchRuntimeLogMapping";
import {
  type WatchRuntimeEvent,
} from "@/src/native/watch/WatchModeTypes";

const baseEvent = (
  eventType: WatchRuntimeEvent["eventType"],
  payload: Record<string, unknown> = {},
): WatchRuntimeEvent => ({
  id: `${eventType}-${Math.random().toString(16).slice(2)}`,
  sessionId: "session-1",
  timestamp: "2026-01-01T05:00:00.000Z",
  eventType,
  payload,
});

describe("watchRuntimeLogMapping", () => {
  it("summarizes watch cueing, suppressions, classifier, and stop status", () => {
    const events: WatchRuntimeEvent[] = [
      baseEvent("watch_runtime_started", {
        classifierVersion: "lucidcue-watch-rem-v1",
      }),
      baseEvent("watch_cue_played"),
      baseEvent("watch_cue_suppressed"),
      baseEvent("watch_movement_pause_started"),
      baseEvent("watch_runtime_stopped", {
        reason: "completed",
        stoppedAt: "2026-01-01T08:00:00.000Z",
      }),
    ];

    expect(
      summarizeWatchRuntime(events, [
        {
          id: "epoch-1",
          sessionId: "session-1",
          epochStart: "2026-01-01T05:00:00.000Z",
          epochEnd: "2026-01-01T05:00:30.000Z",
          elapsedSessionSeconds: 30,
          remLabel: "likely_rem",
          classifierVersion: "lucidcue-watch-rem-v1",
        },
      ]),
    ).toMatchObject({
      epochsReceived: 1,
      likelyRemEpochs: 1,
      cuesPlayed: 1,
      cueSuppressions: 1,
      movementPauses: 1,
      classifierVersions: ["lucidcue-watch-rem-v1"],
      completed: true,
    });
    expect(latestWatchRuntimeStopTimestamp(events)).toBe(
      "2026-01-01T08:00:00.000Z",
    );
  });
});
