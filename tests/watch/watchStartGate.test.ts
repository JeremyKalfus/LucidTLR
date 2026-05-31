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
    ...overrides,
  };
}

describe("watchTlrStartBlockReason", () => {
  it("allows Watch Mode start only when the watch is reachable and connected", () => {
    expect(watchTlrStartBlockReason(status())).toBeNull();
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

  it("blocks when the watch is registered as unconnected", () => {
    for (const connectivityState of ["disconnected", "delayed", "unknown"] as const) {
      expect(
        watchTlrStartBlockReason(
          status({
            watchReachable: false,
            connectivityState,
          }),
        ),
      ).toContain("Apple Watch is not connected");
    }
  });
});
