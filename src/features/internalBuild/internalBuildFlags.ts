import Constants from "expo-constants";

import { WATCH_MODE_ENABLED } from "@/src/features/watchMode/watchModeAvailability";

export const WATCH_MODE_PUBLIC_ENABLED = WATCH_MODE_ENABLED;

export const WATCH_MODE_LAB_ENABLED =
  process.env.EXPO_PUBLIC_WATCH_MODE_LAB_ENABLED === "true" ||
  process.env.EXPO_PUBLIC_WATCH_MODE_LAB_ENABLED === "1";

export function isDevelopmentBuild(): boolean {
  return typeof __DEV__ !== "undefined" && __DEV__;
}

export function isInternalTestFlightLabBuild(): boolean {
  return !isDevelopmentBuild() && WATCH_MODE_LAB_ENABLED;
}

export function isWatchModeLabAvailable(): boolean {
  return isDevelopmentBuild() || WATCH_MODE_LAB_ENABLED;
}

export function internalLabLaneLabel(): string {
  if (isInternalTestFlightLabBuild()) {
    return "Internal TestFlight Lab";
  }

  if (isDevelopmentBuild()) {
    return "Development Lab";
  }

  return "Production";
}

export function internalLabBuildInfo(): {
  lane: string;
  version: string;
  build: string;
  labAvailable: boolean;
  publicWatchModeEnabled: boolean;
} {
  return {
    lane: internalLabLaneLabel(),
    version: Constants.expoConfig?.version ?? "unknown",
    build:
      Constants.nativeBuildVersion ??
      Constants.expoConfig?.ios?.buildNumber ??
      "unknown",
    labAvailable: isWatchModeLabAvailable(),
    publicWatchModeEnabled: WATCH_MODE_PUBLIC_ENABLED,
  };
}
