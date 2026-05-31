import type {
  NativeWatchSessionPlan,
  WatchEpochRecordDraft,
  WatchRuntimeEvent,
  WatchRuntimeStatus,
} from "./WatchModeTypes";

export type WatchRuntimeStopOptions = {
  reason?: "user_stopped" | "completed" | "error";
};

export interface NativeWatchRuntimeModule {
  startWatchSession: (plan: NativeWatchSessionPlan) => Promise<void>;
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
    classifierVersion: "mallela-feature-pipeline-no-model",
    modelAvailable: false,
    connectivityState: "unknown",
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
