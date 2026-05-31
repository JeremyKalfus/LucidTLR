import type { WatchRuntimeStatus } from "./WatchModeTypes";

export function watchTlrStartBlockReason(
  status: WatchRuntimeStatus | null,
): string | null {
  if (!status) {
    return "Watch connection has not been checked yet.";
  }

  if (!status.available) {
    return status.unavailableReason || "Watch Mode is unavailable on this device.";
  }

  if (status.watchAppInstalled === false) {
    return "The LucidCue Watch app is not detected.";
  }

  if (
    !status.watchReachable ||
    status.connectivityState === "disconnected" ||
    status.connectivityState === "delayed" ||
    status.connectivityState === "unknown"
  ) {
    return "Apple Watch is not connected. Open LucidCue on the watch and keep it reachable before starting Watch Mode.";
  }

  return null;
}
