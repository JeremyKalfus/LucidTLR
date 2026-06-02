import { describe, expect, it, vi } from "vitest";

import {
  createWatchRuntimeClient,
  type NativeWatchRuntimeModule,
} from "@/src/native/watch/watchRuntimeClient";

function nativeRuntimeModule(
  overrides: Partial<NativeWatchRuntimeModule> = {},
): NativeWatchRuntimeModule {
  return {
    startWatchSession: vi.fn(() => Promise.resolve()),
    pauseWatchTlrCueing: vi.fn(() => Promise.resolve()),
    resumeWatchTlrCueing: vi.fn(() => Promise.resolve()),
    deferWatchTlrCueing: vi.fn(() => Promise.resolve()),
    stopWatchSession: vi.fn(() => Promise.resolve()),
    getWatchRuntimeStatus: vi.fn(() =>
      Promise.resolve({
        available: true,
        running: true,
        watchSessionRunning: true,
        watchReachable: true,
        audioBedRunning: true,
        cueCount: 0,
        consecutiveLikelyRemEpochs: 0,
        classifierVersion: "lucidcue-watch-rem-v1",
        modelAvailable: true,
        connectivityState: "connected" as const,
        watchHealthAuthorizationStatus: "authorized" as const,
        tlrPaused: false,
      }),
    ),
    getWatchEpochs: vi.fn(() => Promise.resolve([])),
    getWatchRuntimeLogs: vi.fn(() => Promise.resolve([])),
    clearWatchRuntimeLogs: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

describe("watch runtime client", () => {
  it("calls exported native TLR pause and defer controls", async () => {
    const nativeModule = nativeRuntimeModule();
    const client = createWatchRuntimeClient({
      platform: "ios",
      nativeModule,
    });

    await client.pauseWatchTlrCueing();
    await client.deferWatchTlrCueing({ durationSeconds: 1800 });

    expect(nativeModule.pauseWatchTlrCueing).toHaveBeenCalledOnce();
    expect(nativeModule.deferWatchTlrCueing).toHaveBeenCalledWith({
      durationSeconds: 1800,
    });
  });

  it("treats an iOS build missing TLR controls as an incomplete runtime", async () => {
    const nativeModule = nativeRuntimeModule();

    delete (nativeModule as Partial<NativeWatchRuntimeModule>).pauseWatchTlrCueing;

    const client = createWatchRuntimeClient({
      platform: "ios",
      nativeModule,
    });
    const status = await client.getWatchRuntimeStatus();

    expect(client.isAvailable()).toBe(false);
    expect(status).toMatchObject({
      available: false,
      running: false,
      unavailableReason: expect.stringContaining("pauseWatchTlrCueing"),
    });
    expect(() => client.pauseWatchTlrCueing()).toThrow(
      "does not export pauseWatchTlrCueing",
    );
  });

  it("preserves Watch HealthKit authorization status from native status", async () => {
    const nativeModule = nativeRuntimeModule({
      getWatchRuntimeStatus: vi.fn(() =>
        Promise.resolve({
          available: true,
          running: false,
          watchSessionRunning: false,
          watchReachable: true,
          audioBedRunning: false,
          cueCount: 0,
          consecutiveLikelyRemEpochs: 0,
          classifierVersion: "lucidcue-watch-rem-v1",
          modelAvailable: true,
          connectivityState: "connected" as const,
          watchHealthAuthorizationStatus: "denied" as const,
        }),
      ),
    });
    const client = createWatchRuntimeClient({
      platform: "ios",
      nativeModule,
    });

    await expect(client.getWatchRuntimeStatus()).resolves.toMatchObject({
      watchHealthAuthorizationStatus: "denied",
    });
  });
});
