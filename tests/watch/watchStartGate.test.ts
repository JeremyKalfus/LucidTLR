import { describe, expect, it } from "vitest";

import type { WatchRuntimeStatus } from "@/src/native/watch/WatchModeTypes";
import { watchTlrStartBlockReason } from "@/src/native/watch/watchStartGate";

function status(
  overrides: Partial<WatchRuntimeStatus> = {},
): WatchRuntimeStatus {
  return {
    available: true,
    running: false,
    watchSessionRunning: false,
    watchReachable: true,
    watchAppInstalled: true,
    audioBedRunning: false,
    cueCount: 0,
    consecutiveLikelyRemEpochs: 0,
    classifierVersion: "lucidcue-watch-rem-v1",
    modelAvailable: true,
    connectivityState: "connected",
    watchHealthAuthorizationStatus: "authorized",
    ...overrides,
  };
}

describe("watchTlrStartBlockReason", () => {
  it("allows Watch Mode start when the watch is reachable and connected", () => {
    expect(watchTlrStartBlockReason(status())).toBeNull();
  });

  it("allows Watch Mode start when the watch app checked in recently", () => {
    expect(
      watchTlrStartBlockReason(
        status({
          watchReachable: false,
          watchRecentlySeen: true,
          connectivityState: "unknown",
        }),
      ),
    ).toBeNull();
  });

  it("blocks when watch status is unavailable or the watch app is missing", () => {
    expect(
      watchTlrStartBlockReason(
        status({
          available: false,
          unavailableReason: "WatchConnectivity is unavailable.",
          watchReachable: false,
        }),
      ),
    ).toBe("WatchConnectivity is unavailable.");
    expect(
      watchTlrStartBlockReason(status({ watchAppInstalled: false })),
    ).toBe("The LucidCue Watch app is not detected.");
  });

  it("blocks when the watch has no fresh presence signal", () => {
    for (const connectivityState of ["disconnected", "delayed", "unknown"] as const) {
      expect(
        watchTlrStartBlockReason(
          status({
            watchReachable: false,
            watchRecentlySeen: false,
            connectivityState,
          }),
        ),
      ).toContain("Apple Watch is not connected");
    }
  });

  it("blocks when HealthKit heart-rate status is known denied or unavailable", () => {
    expect(
      watchTlrStartBlockReason(
        status({
          watchHealthAuthorizationStatus: "denied",
        }),
      ),
    ).toContain("HealthKit heart-rate access is denied");
    expect(
      watchTlrStartBlockReason(
        status({
          watchHealthAuthorizationStatus: "unavailable",
        }),
      ),
    ).toContain("HealthKit heart-rate access is unavailable");
  });

  it("does not block on unknown HealthKit heart-rate status", () => {
    expect(
      watchTlrStartBlockReason(
        status({
          watchHealthAuthorizationStatus: "unknown",
        }),
      ),
    ).toBeNull();
  });
});
