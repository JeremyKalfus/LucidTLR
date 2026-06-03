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
    prepareWatchOwnedSession: vi.fn(() => Promise.resolve()),
    requestWatchOwnedStart: vi.fn(() => Promise.resolve()),
    requestWatchOwnedStop: vi.fn(() => Promise.resolve()),
    getLatestWatchOwnedStatus: vi.fn(() =>
      Promise.resolve({
        protocol: "watch-owned-status-v2" as const,
        available: true,
        runtimeOwner: "watch" as const,
        state: "ready" as const,
      }),
    ),
    importWatchOwnedSessionLogs: vi.fn(() =>
      Promise.resolve({
        sessionId: "session-1",
        epochs: [],
        cueDeliveries: [],
      }),
    ),
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

  it("passes the target Watch session id when stopping", async () => {
    const nativeModule = nativeRuntimeModule();
    const client = createWatchRuntimeClient({
      platform: "ios",
      nativeModule,
    });

    await client.stopWatchSession({
      reason: "user_stopped",
      sessionId: "watch-session-1",
    });

    expect(nativeModule.stopWatchSession).toHaveBeenCalledWith({
      reason: "user_stopped",
      sessionId: "watch-session-1",
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

  it("exposes optional Watch-owned v2 methods without requiring them for availability", async () => {
    const nativeModule = nativeRuntimeModule();
    const plan = {
      protocol: "watch-session-plan-v2" as const,
      sessionId: "session-1",
      createdAt: "2026-01-01T04:00:00.000Z",
      expiresAt: "2026-01-01T12:00:00.000Z",
      earliestCueAt: "2026-01-01T08:00:00.000Z",
      stopAt: "2026-01-01T12:00:00.000Z",
      runtimeOwner: "watch" as const,
      cueMode: "audio_haptic" as const,
      cueBudget: 60,
      minInterCueIntervalSec: 20,
      suppressCueFromConsecutiveLikelyRemEpoch: 5,
      epochDurationSec: 30,
      accelerometerHz: 30,
      movementGateConfig: {
        stableLowMovementRequiredSeconds: 60,
        cueAssociatedMovementWindowSeconds: 30,
        cueAssociatedMovementPauseSeconds: 180,
      },
      batteryPolicy: {
        recommendedStartBatteryPct: 90,
        allowStartBelowPct: 70,
        requireOverrideBelowPct: 60,
        disableCueingBelowPct: 25,
        stopRuntimeBelowPct: 20,
        hardStopBelowPct: 12,
      },
      lowPowerModePolicy: "warn_degraded" as const,
      remModelManifest: {
        modelId: "mallela_rf_v1",
        version: "lucidcue-watch-rem-v1",
        threshold: 0.24,
        featureConfigVersion: "mallela-approx-feature-dev",
      },
      privacyLoggingMode: "summary_only" as const,
    };
    const client = createWatchRuntimeClient({
      platform: "ios",
      nativeModule,
    });

    await client.prepareWatchOwnedSession(plan);
    await client.requestWatchOwnedStart("session-1");
    await client.requestWatchOwnedStop({ sessionId: "session-1" });

    await expect(client.getLatestWatchOwnedStatus()).resolves.toMatchObject({
      protocol: "watch-owned-status-v2",
      state: "ready",
    });
    await expect(client.importWatchOwnedSessionLogs("session-1")).resolves.toEqual({
      sessionId: "session-1",
      epochs: [],
      cueDeliveries: [],
    });
    expect(nativeModule.prepareWatchOwnedSession).toHaveBeenCalledWith(plan);
    expect(nativeModule.requestWatchOwnedStart).toHaveBeenCalledWith({
      sessionId: "session-1",
    });
  });

  it("does not require optional Watch-owned methods for legacy runtime availability", async () => {
    const nativeModule = nativeRuntimeModule();

    delete (nativeModule as Partial<NativeWatchRuntimeModule>)
      .prepareWatchOwnedSession;
    delete (nativeModule as Partial<NativeWatchRuntimeModule>)
      .getLatestWatchOwnedStatus;

    const client = createWatchRuntimeClient({
      platform: "ios",
      nativeModule,
    });

    expect(client.isAvailable()).toBe(true);
    await expect(client.getLatestWatchOwnedStatus()).resolves.toMatchObject({
      available: false,
      reason: expect.stringContaining("getLatestWatchOwnedStatus"),
    });
  });
});
