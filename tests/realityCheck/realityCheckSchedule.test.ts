import { describe, expect, it } from "vitest";

import {
  clampRealityCheckSettings,
  computeReminderTimestamps,
  DEFAULT_REALITY_CHECK_SETTINGS,
  parseHHMM,
  type RealityCheckSettings,
} from "@/src/features/realityCheck/realityCheckSchedule";

const enabledSettings: RealityCheckSettings = {
  enabled: true,
  startTime: "10:00",
  endTime: "22:00",
  remindersPerDay: 5,
};

// Deterministic "random" that always picks the middle of each slot.
const midSlot = () => 0.5;

describe("clampRealityCheckSettings", () => {
  it("falls back to defaults for invalid values", () => {
    expect(
      clampRealityCheckSettings({
        enabled: true,
        startTime: "bad",
        endTime: "25:99",
        remindersPerDay: 999,
      }),
    ).toEqual({
      enabled: true,
      startTime: DEFAULT_REALITY_CHECK_SETTINGS.startTime,
      endTime: DEFAULT_REALITY_CHECK_SETTINGS.endTime,
      remindersPerDay: 12,
    });
  });

  it("treats a missing enabled flag as disabled", () => {
    expect(clampRealityCheckSettings(null).enabled).toBe(false);
  });
});

describe("parseHHMM", () => {
  it("parses valid times and rejects invalid ones", () => {
    expect(parseHHMM("09:30")).toEqual({ hours: 9, minutes: 30 });
    expect(parseHHMM("24:00")).toBeNull();
    expect(parseHHMM("9:30")).toBeNull();
  });
});

describe("computeReminderTimestamps", () => {
  it("returns nothing when disabled", () => {
    expect(
      computeReminderTimestamps({
        settings: { ...enabledSettings, enabled: false },
        now: new Date("2026-06-14T08:00:00"),
      }),
    ).toEqual([]);
  });

  it("returns nothing when the window is inverted", () => {
    expect(
      computeReminderTimestamps({
        settings: { ...enabledSettings, startTime: "22:00", endTime: "10:00" },
        now: new Date("2026-06-14T08:00:00"),
      }),
    ).toEqual([]);
  });

  it("schedules remindersPerDay across each future day, all within the window", () => {
    const now = new Date("2026-06-14T08:00:00");
    const times = computeReminderTimestamps({
      settings: enabledSettings,
      now,
      daysAhead: 2,
      random: midSlot,
    });

    // 5 per day across 2 days; none are in the past (now is before the window).
    expect(times).toHaveLength(10);

    for (const at of times) {
      const minutes = at.getHours() * 60 + at.getMinutes();
      expect(minutes).toBeGreaterThanOrEqual(10 * 60);
      expect(minutes).toBeLessThan(22 * 60);
      expect(at.getTime()).toBeGreaterThan(now.getTime());
    }

    // Sorted ascending.
    for (let i = 1; i < times.length; i += 1) {
      expect(times[i].getTime()).toBeGreaterThan(times[i - 1].getTime());
    }
  });

  it("drops slots earlier than now on the current day", () => {
    // 14:00 already past the first slots (window 10:00-22:00, 5 slots of 144m:
    // slot midpoints ~11:12, 13:36, 16:00, 18:24, 20:48 -> first two are past).
    const now = new Date("2026-06-14T14:00:00");
    const times = computeReminderTimestamps({
      settings: enabledSettings,
      now,
      daysAhead: 1,
      random: midSlot,
    });

    expect(times).toHaveLength(3);
    expect(times.every((at) => at.getTime() > now.getTime())).toBe(true);
  });
});
