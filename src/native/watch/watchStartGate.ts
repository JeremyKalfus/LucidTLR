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

  if (status.watchHealthAuthorizationStatus === "denied") {
    return "HealthKit heart-rate access is denied. Enable heart-rate access for LucidCue on the Apple Watch before starting Watch Mode.";
  }

  if (status.watchHealthAuthorizationStatus === "unavailable") {
    return "HealthKit heart-rate access is unavailable on this Apple Watch.";
  }

  const hasFreshWatchPresence =
    status.watchReachable || status.watchRecentlySeen === true;

  if (!hasFreshWatchPresence) {
    return "Apple Watch is not connected. Open LucidCue on the watch and keep it reachable before starting Watch Mode.";
  }

  return null;
}
