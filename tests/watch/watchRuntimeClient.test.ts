import { describe, expect, it, vi } from "vitest";

import {
  createWatchRuntimeClient,
  type NativeWatchRuntimeModule,
} from "@/src/native/watch/watchRuntimeClient";
import type { WatchOwnedSessionPlanV2 } from "@/src/native/watch/WatchOwnedTypes";

function nativeRuntimeModule(
  overrides: Partial<NativeWatchRuntimeModule> = {},
): NativeWatchRuntimeModule {
  return {
    beginWatchOwnedStartSync: vi.fn(() => Promise.resolve()),
    requestWatchOwnedLogSync: vi.fn(() => Promise.resolve()),
    acknowledgeWatchOwnedLogSync: vi.fn(() => Promise.resolve()),
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

function plan(sessionId = "session-1"): WatchOwnedSessionPlanV2 {
  return {
    protocol: "watch-session-plan-v2",
    sessionId,
    createdAt: "2026-01-01T04:00:00.000Z",
    expiresAt: "2026-01-01T12:00:00.000Z",
    earliestCueAt: "2026-01-01T08:00:00.000Z",
    stopAt: "2026-01-01T12:00:00.000Z",
    runtimeOwner: "watch",
    cueMode: "haptic_only",
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
    lowPowerModePolicy: "warn_degraded",
    remModelManifest: {
      modelId: "mallela_rf_v1",
      version: "lucidcue-watch-rem-v1",
      threshold: 0.24,
      featureConfigVersion: "mallela-approx-feature-dev",
    },
    privacyLoggingMode: "summary_only",
  };
}

describe("watch runtime client", () => {
  it("calls the Watch-owned v2 sync/import methods", async () => {
    const nativeModule = nativeRuntimeModule();
    const client = createWatchRuntimeClient({
      platform: "ios",
      nativeModule,
    });
    const startPlan = plan();

    await client.beginWatchOwnedStartSync(startPlan);
    await client.requestWatchOwnedLogSync({ sessionId: "session-1" });
    await client.acknowledgeWatchOwnedLogSync({ sessionId: "session-1" });

    await expect(client.getLatestWatchOwnedStatus()).resolves.toMatchObject({
      protocol: "watch-owned-status-v2",
      state: "ready",
    });
    await expect(client.importWatchOwnedSessionLogs("session-1")).resolves.toEqual({
      sessionId: "session-1",
      epochs: [],
      cueDeliveries: [],
    });
    expect(nativeModule.beginWatchOwnedStartSync).toHaveBeenCalledWith(startPlan);
    expect(nativeModule.requestWatchOwnedLogSync).toHaveBeenCalledWith({
      sessionId: "session-1",
    });
    expect(nativeModule.acknowledgeWatchOwnedLogSync).toHaveBeenCalledWith({
      sessionId: "session-1",
    });
  });

  it("does not expose the legacy phone-owned Watch runtime methods", () => {
    const client = createWatchRuntimeClient({
      platform: "ios",
      nativeModule: nativeRuntimeModule(),
    });

    expect("startWatchSession" in client).toBe(false);
    expect("stopWatchSession" in client).toBe(false);
    expect("getWatchRuntimeStatus" in client).toBe(false);
    expect("getWatchEpochs" in client).toBe(false);
    expect("getWatchRuntimeLogs" in client).toBe(false);
    expect("requestWatchOwnedStart" in client).toBe(false);
    expect("prepareWatchOwnedSession" in client).toBe(false);
  });

  it("requires the v2 methods for current Watch Mode availability", async () => {
    const nativeModule = nativeRuntimeModule();

    delete (nativeModule as Partial<NativeWatchRuntimeModule>)
      .beginWatchOwnedStartSync;

    const client = createWatchRuntimeClient({
      platform: "ios",
      nativeModule,
    });

    expect(client.isAvailable()).toBe(false);
    await expect(client.getLatestWatchOwnedStatus()).resolves.toMatchObject({
      available: false,
      reason: expect.stringContaining("beginWatchOwnedStartSync"),
    });
  });

  it("does not require live reachability to begin a Watch-owned v2 sync", async () => {
    const nativeModule = nativeRuntimeModule({
      getLatestWatchOwnedStatus: vi.fn(() =>
        Promise.resolve({
          protocol: "watch-owned-status-v2" as const,
          available: true,
          runtimeOwner: "watch" as const,
          state: "ready" as const,
          watchReachable: false,
          connectivityState: "delayed" as const,
        }),
      ),
    });
    const client = createWatchRuntimeClient({
      platform: "ios",
      nativeModule,
    });
    const startPlan = plan("session-delayed");

    await client.beginWatchOwnedStartSync(startPlan);

    await expect(client.getLatestWatchOwnedStatus()).resolves.toMatchObject({
      state: "ready",
      watchReachable: false,
      connectivityState: "delayed",
    });
    expect(nativeModule.beginWatchOwnedStartSync).toHaveBeenCalledWith(startPlan);
  });
});
