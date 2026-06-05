import { NativeModules, Platform } from "react-native";

import type {
  ExternalSleepSession,
  ExternalSleepSource,
  ExternalSleepStageSegment,
} from "@/src/domain/types";

export type HealthHistoryPermissionStatus =
  | "unknown"
  | "granted"
  | "denied"
  | "unavailable";

export interface HealthHistoryAdapter {
  isAvailable(): Promise<boolean>;
  requestPermission(): Promise<"granted" | "denied" | "unavailable">;
  importSleepHistory(options: {
    participantId: string;
    lookbackDays: number;
  }): Promise<{
    sessions: ExternalSleepSession[];
    stageSegments: ExternalSleepStageSegment[];
  }>;
  getLastImportStatus(): Promise<{
    available: boolean;
    permission: HealthHistoryPermissionStatus;
    lastImportedAt?: string;
    importedNightCount?: number;
  }>;
}

interface NativeHealthHistoryModule {
  isAvailable?: () => Promise<boolean>;
  requestPermission?: () => Promise<"granted" | "denied" | "unavailable">;
  importSleepHistory?: (options: {
    participantId: string;
    lookbackDays: number;
  }) => Promise<{
    sessions: ExternalSleepSession[];
    stageSegments: ExternalSleepStageSegment[];
  }>;
  getLastImportStatus?: () => Promise<{
    available: boolean;
    permission: HealthHistoryPermissionStatus;
    lastImportedAt?: string;
    importedNightCount?: number;
  }>;
}

const nativeHealthHistoryModule =
  (NativeModules.LucidTLRHealthHistory ??
    NativeModules.LucidCueHealthHistory ??
    NativeModules.HealthHistoryAdapter) as NativeHealthHistoryModule | undefined;

function platformSupportsHealthHistory(): boolean {
  return Platform.OS === "ios" || Platform.OS === "android";
}

export function getDefaultExternalSleepSource(): ExternalSleepSource | null {
  if (Platform.OS === "ios") {
    return "apple_health";
  }

  if (Platform.OS === "android") {
    return "health_connect";
  }

  return null;
}

export const defaultHealthHistoryAdapter: HealthHistoryAdapter = {
  async isAvailable() {
    if (!platformSupportsHealthHistory() || !nativeHealthHistoryModule?.isAvailable) {
      return false;
    }

    return nativeHealthHistoryModule.isAvailable();
  },

  async requestPermission() {
    if (
      !platformSupportsHealthHistory() ||
      !nativeHealthHistoryModule?.requestPermission
    ) {
      return "unavailable";
    }

    return nativeHealthHistoryModule.requestPermission();
  },

  async importSleepHistory(options) {
    if (
      !platformSupportsHealthHistory() ||
      !nativeHealthHistoryModule?.importSleepHistory
    ) {
      throw new Error(
        "Sleep history import is unavailable in this build. Native HealthKit/Health Connect wiring is still TODO.",
      );
    }

    return nativeHealthHistoryModule.importSleepHistory(options);
  },

  async getLastImportStatus() {
    if (
      !platformSupportsHealthHistory() ||
      !nativeHealthHistoryModule?.getLastImportStatus
    ) {
      return {
        available: false,
        permission: "unavailable",
      };
    }

    return nativeHealthHistoryModule.getLastImportStatus();
  },
};
