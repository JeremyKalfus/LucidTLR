import { describe, expect, it, vi } from "vitest";

import {
  createPhoneRuntimeClient,
  type NativePhoneRuntimeModule,
} from "@/src/native/phoneRuntime/phoneRuntimeClient";

function nativeRuntimeModule(
  overrides: Partial<NativePhoneRuntimeModule> = {},
): NativePhoneRuntimeModule {
  return {
    startPhoneTlrSession: vi.fn(() => Promise.resolve()),
    startPhoneTlrSessionAfterPresleepTraining: vi.fn(() => Promise.resolve()),
    startPhoneWatchSpeakerSession: vi.fn(() => Promise.resolve()),
    skipPhonePresleepTrainingAndStartRuntime: vi.fn(() => Promise.resolve()),
    pausePhonePresleepTraining: vi.fn(() => Promise.resolve()),
    resumePhonePresleepTraining: vi.fn(() => Promise.resolve()),
    pausePhoneTlrCueing: vi.fn(() => Promise.resolve()),
    resumePhoneTlrCueing: vi.fn(() => Promise.resolve()),
    deferPhoneTlrCueing: vi.fn(() => Promise.resolve()),
    stopPhoneTlrSession: vi.fn(() => Promise.resolve()),
    getPhoneRuntimeStatus: vi.fn(() =>
      Promise.resolve({
        available: true,
        running: true,
        audioBedRunning: true,
        backgroundAudioRunning: false,
        alarmRinging: false,
        motionRunning: true,
        cueCount: 0,
        cuesInBlock: 0,
        tlrPaused: false,
      }),
    ),
    getPhoneRuntimeLogs: vi.fn(() => Promise.resolve([])),
    clearPhoneRuntimeLogs: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

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
    expect(() =>
      client.startPhoneWatchSpeakerSession({} as never),
    ).toThrow("iPhone Phone Mode native runtime is unavailable");
    expect(() => client.skipPhonePresleepTrainingAndStartRuntime()).toThrow(
      "iPhone Phone Mode native runtime is unavailable",
    );
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

  it("calls exported native TLR pause and defer controls", async () => {
    const nativeModule = nativeRuntimeModule();
    const client = createPhoneRuntimeClient({
      platform: "ios",
      nativeModule,
    });

    await client.pausePhoneTlrCueing();
    await client.deferPhoneTlrCueing({ durationSeconds: 1800 });

    expect(nativeModule.pausePhoneTlrCueing).toHaveBeenCalledOnce();
    expect(nativeModule.deferPhoneTlrCueing).toHaveBeenCalledWith({
      durationSeconds: 1800,
    });
  });

  it("calls exported native presleep skip handoff", async () => {
    const nativeModule = nativeRuntimeModule();
    const client = createPhoneRuntimeClient({
      platform: "ios",
      nativeModule,
    });

    await client.skipPhonePresleepTrainingAndStartRuntime();

    expect(
      nativeModule.skipPhonePresleepTrainingAndStartRuntime,
    ).toHaveBeenCalledOnce();
  });

  it("calls exported native Watch speaker-only session start", async () => {
    const nativeModule = nativeRuntimeModule();
    const client = createPhoneRuntimeClient({
      platform: "ios",
      nativeModule,
    });
    const plan = { sessionId: "watch-speaker-session" } as never;

    await client.startPhoneWatchSpeakerSession(plan);

    expect(nativeModule.startPhoneWatchSpeakerSession).toHaveBeenCalledWith(plan);
  });

  it("requires the native presleep skip handoff in iOS builds", async () => {
    const nativeModule = nativeRuntimeModule();
    const partialNativeModule = nativeModule as Partial<NativePhoneRuntimeModule>;

    delete partialNativeModule.skipPhonePresleepTrainingAndStartRuntime;

    const client = createPhoneRuntimeClient({
      platform: "ios",
      nativeModule,
    });
    const status = await client.getPhoneRuntimeStatus();

    expect(client.isAvailable()).toBe(false);
    expect(status).toMatchObject({
      available: false,
      running: false,
      unavailableReason: expect.stringContaining(
        "skipPhonePresleepTrainingAndStartRuntime",
      ),
    });
    expect(() => client.skipPhonePresleepTrainingAndStartRuntime()).toThrow(
      "does not export skipPhonePresleepTrainingAndStartRuntime",
    );
  });

  it("treats an iOS build missing TLR controls as an incomplete runtime", async () => {
    const nativeModule = nativeRuntimeModule();

    delete (nativeModule as Partial<NativePhoneRuntimeModule>).pausePhoneTlrCueing;

    const client = createPhoneRuntimeClient({
      platform: "ios",
      nativeModule,
    });
    const status = await client.getPhoneRuntimeStatus();

    expect(client.isAvailable()).toBe(false);
    expect(status).toMatchObject({
      available: false,
      running: false,
      unavailableReason: expect.stringContaining("pausePhoneTlrCueing"),
    });
    expect(() => client.pausePhoneTlrCueing()).toThrow(
      "does not export pausePhoneTlrCueing",
    );
  });
});
