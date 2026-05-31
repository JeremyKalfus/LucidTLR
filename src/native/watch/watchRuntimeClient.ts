import type {
  NativeWatchSessionPlan,
  WatchEpochRecordDraft,
  WatchRuntimeEvent,
  WatchRuntimeStatus,
} from "./WatchModeTypes";
import { LUCIDCUE_WATCH_REM_CLASSIFIER_VERSION } from "@/src/engine/watchRem";

export type WatchRuntimeStopOptions = {
  reason?: "user_stopped" | "completed" | "error";
};

export type WatchRuntimeDeferOptions = {
  durationSeconds?: number;
};

export interface NativeWatchRuntimeModule {
  startWatchSession: (plan: NativeWatchSessionPlan) => Promise<void>;
  pauseWatchTlrCueing: () => Promise<void>;
  resumeWatchTlrCueing: () => Promise<void>;
  deferWatchTlrCueing: (options?: WatchRuntimeDeferOptions) => Promise<void>;
  stopWatchSession: (options?: WatchRuntimeStopOptions) => Promise<void>;
  getWatchRuntimeStatus: () => Promise<WatchRuntimeStatus>;
  getWatchEpochs: (sessionId: string) => Promise<WatchEpochRecordDraft[]>;
  getWatchRuntimeLogs: (sessionId: string) => Promise<WatchRuntimeEvent[]>;
  clearWatchRuntimeLogs: (sessionId: string) => Promise<void>;
}

type WatchRuntimeClientOptions = {
  platform: string;
  nativeModule?: NativeWatchRuntimeModule;
};

function unavailableStatus(reason: string): WatchRuntimeStatus {
  return {
    available: false,
    unavailableReason: reason,
    running: false,
    watchSessionRunning: false,
    watchReachable: false,
    audioBedRunning: false,
    cueCount: 0,
    consecutiveLikelyRemEpochs: 0,
    classifierVersion: LUCIDCUE_WATCH_REM_CLASSIFIER_VERSION,
    modelAvailable: false,
    connectivityState: "unknown",
    tlrPaused: false,
  };
}

export function createWatchRuntimeClient(options: WatchRuntimeClientOptions) {
  const nonIosReason =
    "Watch Mode native runtime is unavailable on this platform.";
  const missingModuleReason =
    "LucidCueWatchRuntime is only available in a custom iOS development build with the watch target.";

  function requireNativeModule(): NativeWatchRuntimeModule {
    if (options.platform !== "ios") {
      throw new Error(nonIosReason);
    }

    if (!options.nativeModule) {
      throw new Error(missingModuleReason);
    }

    return options.nativeModule;
  }

  return {
    isAvailable() {
      return options.platform === "ios" && Boolean(options.nativeModule);
    },

    startWatchSession(plan: NativeWatchSessionPlan) {
      return requireNativeModule().startWatchSession(plan);
    },

    pauseWatchTlrCueing() {
      return requireNativeModule().pauseWatchTlrCueing();
    },

    resumeWatchTlrCueing() {
      return requireNativeModule().resumeWatchTlrCueing();
    },

    deferWatchTlrCueing(deferOptions?: WatchRuntimeDeferOptions) {
      return requireNativeModule().deferWatchTlrCueing(deferOptions);
    },

    stopWatchSession(stopOptions?: WatchRuntimeStopOptions) {
      return requireNativeModule().stopWatchSession(stopOptions);
    },

    getWatchRuntimeStatus() {
      if (options.platform !== "ios") {
        return Promise.resolve(unavailableStatus(nonIosReason));
      }

      if (!options.nativeModule) {
        return Promise.resolve(unavailableStatus(missingModuleReason));
      }

      return options.nativeModule.getWatchRuntimeStatus();
    },

    getWatchEpochs(sessionId: string) {
      return requireNativeModule().getWatchEpochs(sessionId);
    },

    getWatchRuntimeLogs(sessionId: string) {
      return requireNativeModule().getWatchRuntimeLogs(sessionId);
    },

    clearWatchRuntimeLogs(sessionId?: string) {
      return requireNativeModule().clearWatchRuntimeLogs(sessionId ?? "");
    },
  };
}
