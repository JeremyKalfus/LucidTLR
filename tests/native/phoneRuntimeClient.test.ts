import { describe, expect, it } from "vitest";

import { createPhoneRuntimeClient } from "@/src/native/phoneRuntime/phoneRuntimeClient";

describe("phone runtime client", () => {
  it("fails clearly on non-iOS instead of faking success", async () => {
    const client = createPhoneRuntimeClient({ platform: "android" });
    const status = await client.getPhoneRuntimeStatus();

    expect(status).toMatchObject({
      available: false,
      running: false,
      unavailableReason:
        "iPhone Phone Mode native runtime is unavailable on this platform.",
    });
    expect(() =>
      client.stopPhoneTlrSession({ reason: "user_stopped" }),
    ).toThrow("iPhone Phone Mode native runtime is unavailable");
    expect(() =>
      client.startPhoneTlrSessionAfterPresleepTraining({} as never),
    ).toThrow("iPhone Phone Mode native runtime is unavailable");
    expect(() => client.pausePhoneTlrCueing()).toThrow(
      "iPhone Phone Mode native runtime is unavailable",
    );
    expect(() => client.resumePhoneTlrCueing()).toThrow(
      "iPhone Phone Mode native runtime is unavailable",
    );
    expect(() => client.deferPhoneTlrCueing()).toThrow(
      "iPhone Phone Mode native runtime is unavailable",
    );
  });
});
