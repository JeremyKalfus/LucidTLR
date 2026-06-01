import { describe, expect, it } from "vitest";

import {
  elapsedSecondsSince,
  formatElapsedTime,
} from "@/src/components/ui/runningSessionClockTime";

describe("running session clock time", () => {
  it("formats elapsed time as minutes and seconds before one hour", () => {
    expect(formatElapsedTime(0)).toBe("00:00");
    expect(formatElapsedTime(75)).toBe("01:15");
  });

  it("formats elapsed time with hours after one hour", () => {
    expect(formatElapsedTime(3671)).toBe("1:01:11");
  });

  it("subtracts paused duration from elapsed time", () => {
    const startedAt = "2026-01-01T00:00:00.000Z";
    const nowMs = Date.parse("2026-01-01T00:01:10.000Z");

    expect(elapsedSecondsSince(startedAt, nowMs, 30_000)).toBe(40);
  });

  it("never returns negative elapsed time", () => {
    const startedAt = "2026-01-01T00:00:00.000Z";
    const nowMs = Date.parse("2026-01-01T00:00:10.000Z");

    expect(elapsedSecondsSince(startedAt, nowMs, 30_000)).toBe(0);
  });
});
