import { describe, expect, it } from "vitest";

import {
  createDefaultTlrOptions,
  mergeTlrOptionsPatch,
  normalizeTlrOptions,
  resolveAlarmFireAt,
} from "@/src/features/tlrOptions/tlrOptions";

describe("TLR options", () => {
  it("creates wake-time based alarm defaults", () => {
    const options = createDefaultTlrOptions("6:45");

    expect(options).toMatchObject({
      backgroundNoise: "none",
      skipGuidedTraining: false,
      alarm: {
        enabled: false,
        time: "06:45",
        autoShutoff: true,
        ringDurationMinutes: 5,
      },
    });
  });

  it("normalizes persisted values without accepting invalid options", () => {
    const options = normalizeTlrOptions(
      {
        backgroundNoise: "rain" as never,
        skipGuidedTraining: true,
        alarm: {
          enabled: true,
          time: "28:99",
          autoShutoff: false,
          ringDurationMinutes: 0,
        },
      },
      "06:30",
    );

    expect(options).toEqual({
      backgroundNoise: "none",
      skipGuidedTraining: true,
      alarm: {
        enabled: true,
        time: "06:30",
        autoShutoff: false,
        ringDurationMinutes: 1,
      },
    });
  });

  it("merges partial alarm patches without dropping existing alarm fields", () => {
    const options = mergeTlrOptionsPatch(createDefaultTlrOptions("07:00"), {
      alarm: {
        enabled: true,
        time: "6:05",
      },
    });

    expect(options.alarm).toEqual({
      enabled: true,
      time: "06:05",
      autoShutoff: true,
      ringDurationMinutes: 5,
    });
  });

  it("resolves alarm fire times across midnight in local clock time", () => {
    const after = "2026-01-20T23:50:00.000";
    const fireAt = new Date(
      resolveAlarmFireAt({
        alarmTime: "07:15",
        after,
      }),
    );

    expect(fireAt.getTime()).toBeGreaterThan(new Date(after).getTime());
    expect(fireAt.getDate()).toBe(21);
    expect(fireAt.getHours()).toBe(7);
    expect(fireAt.getMinutes()).toBe(15);
  });
});
