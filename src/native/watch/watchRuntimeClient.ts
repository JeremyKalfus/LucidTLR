import type {
  NativeWatchSessionPlan,
  WatchEpochRecordDraft,
  WatchRuntimeEvent,
  WatchRuntimeStatus,
} from "./WatchModeTypes";
import type {
  WatchOwnedImportPayloadV2,
  WatchOwnedSessionPlanV2,
  WatchOwnedStatusV2,
} from "./WatchOwnedTypes";
import { LUCIDCUE_WATCH_REM_CLASSIFIER_VERSION } from "@/src/engine/watchRem";

export type WatchRuntimeStopOptions = {
  reason?:
    | "user_stopped"
    | "completed"
    | "error"
    | "orphaned"
    | "replaced_by_new_session"
    | "watch_start_cancelled"
    | "watch_start_timeout";
  sessionId?: string;
};

export type WatchRuntimeDeferOptions = {
  durationSeconds?: number;
};

export interface NativeWatchRuntimeModule {
  startWatchSession: (plan: NativeWatchSessionPlan) => Promise<void>;
  prepareWatchOwnedSession?: (plan: WatchOwnedSessionPlanV2) => Promise<void>;
  requestWatchOwnedStop?: (options: WatchRuntimeStopOptions) => Promise<void>;
  getLatestWatchOwnedStatus?: () => Promise<WatchOwnedStatusV2>;
  importWatchOwnedSessionLogs?: (
    sessionId: string,
  ) => Promise<WatchOwnedImportPayloadV2>;
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
  nativeModule?: Partial<NativeWatchRuntimeModule>;
};

type NativeWatchRuntimeMethodName = keyof NativeWatchRuntimeModule;

const requiredNativeMethods: NativeWatchRuntimeMethodName[] = [
  "startWatchSession",
  "pauseWatchTlrCueing",
  "resumeWatchTlrCueing",
  "deferWatchTlrCueing",
  "stopWatchSession",
  "getWatchRuntimeStatus",
  "getWatchEpochs",
  "getWatchRuntimeLogs",
  "clearWatchRuntimeLogs",
];

function unavailableStatus(reason: string): WatchRuntimeStatus {
  return {
    available: false,
    unavailableReason: reason,
    lifecycleState: "idle",
    running: false,
    watchSessionRunning: false,
    watchReachable: false,
    watchRecentlySeen: false,
    watchStartEligible: false,
    watchHealthAuthorizationStatus: "unknown",
    audioBedRunning: false,
    cueCount: 0,
    consecutiveLikelyRemEpochs: 0,
    classifierVersion: LUCIDCUE_WATCH_REM_CLASSIFIER_VERSION,
    modelAvailable: false,
    connectivityState: "unknown",
    tlrPaused: false,
  };
}

function unavailableWatchOwnedStatus(reason: string): WatchOwnedStatusV2 {
  return {
    protocol: "watch-owned-status-v2",
    available: false,
    runtimeOwner: "watch",
    state: "failed",
    reason,
  };
}

function missingNativeMethodReason(methodName: string): string {
  return `LucidCueWatchRuntime in this iOS build does not export ${methodName}. Install a current iOS development build before using Watch Mode.`;
}

function firstMissingNativeMethod(
  nativeModule: Partial<NativeWatchRuntimeModule> | undefined,
): NativeWatchRuntimeMethodName | null {
  if (!nativeModule) {
    return null;
  }

  return (
    requiredNativeMethods.find(
      (methodName) => typeof nativeModule[methodName] !== "function",
    ) ?? null
  );
}

export function createWatchRuntimeClient(options: WatchRuntimeClientOptions) {
  const nonIosReason =
    "Watch Mode native runtime is unavailable on this platform.";
  const missingModuleReason =
    "LucidCueWatchRuntime is only available in a custom iOS development build with the watch target.";

  function requireNativeModule(): Partial<NativeWatchRuntimeModule> {
    if (options.platform !== "ios") {
      throw new Error(nonIosReason);
    }

    if (!options.nativeModule) {
      throw new Error(missingModuleReason);
    }

    return options.nativeModule;
  }

  function requireNativeMethod<
    MethodName extends NativeWatchRuntimeMethodName,
  >(methodName: MethodName): NativeWatchRuntimeModule[MethodName] {
    const nativeModule = requireNativeModule();
    const nativeMethod = nativeModule[methodName];

    if (typeof nativeMethod !== "function") {
      throw new Error(missingNativeMethodReason(methodName));
    }

    return nativeMethod.bind(nativeModule) as NativeWatchRuntimeModule[MethodName];
  }

  return {
    isAvailable() {
      return (
        options.platform === "ios" &&
        Boolean(options.nativeModule) &&
        firstMissingNativeMethod(options.nativeModule) === null
      );
    },

    startWatchSession(plan: NativeWatchSessionPlan) {
      return requireNativeMethod("startWatchSession")(plan);
    },

    prepareWatchOwnedSession(plan: WatchOwnedSessionPlanV2) {
      const nativeModule = requireNativeModule();

      if (typeof nativeModule.prepareWatchOwnedSession !== "function") {
        throw new Error(missingNativeMethodReason("prepareWatchOwnedSession"));
      }

      return nativeModule.prepareWatchOwnedSession(plan);
    },

    requestWatchOwnedStop(stopOptions?: WatchRuntimeStopOptions) {
      const nativeModule = requireNativeModule();

      if (typeof nativeModule.requestWatchOwnedStop !== "function") {
        throw new Error(missingNativeMethodReason("requestWatchOwnedStop"));
      }

      return nativeModule.requestWatchOwnedStop(stopOptions ?? {});
    },

    getLatestWatchOwnedStatus() {
      if (options.platform !== "ios") {
        return Promise.resolve(unavailableWatchOwnedStatus(nonIosReason));
      }

      if (!options.nativeModule) {
        return Promise.resolve(unavailableWatchOwnedStatus(missingModuleReason));
      }

      if (typeof options.nativeModule.getLatestWatchOwnedStatus !== "function") {
        return Promise.resolve(
          unavailableWatchOwnedStatus(
            missingNativeMethodReason("getLatestWatchOwnedStatus"),
          ),
        );
      }

      return options.nativeModule.getLatestWatchOwnedStatus();
    },

    importWatchOwnedSessionLogs(sessionId: string) {
      const nativeModule = requireNativeModule();

      if (typeof nativeModule.importWatchOwnedSessionLogs !== "function") {
        throw new Error(missingNativeMethodReason("importWatchOwnedSessionLogs"));
      }

      return nativeModule.importWatchOwnedSessionLogs(sessionId);
    },

    pauseWatchTlrCueing() {
      return requireNativeMethod("pauseWatchTlrCueing")();
    },

    resumeWatchTlrCueing() {
      return requireNativeMethod("resumeWatchTlrCueing")();
    },

    deferWatchTlrCueing(deferOptions?: WatchRuntimeDeferOptions) {
      return requireNativeMethod("deferWatchTlrCueing")(deferOptions);
    },

    stopWatchSession(stopOptions?: WatchRuntimeStopOptions) {
      return requireNativeMethod("stopWatchSession")(stopOptions);
    },

    getWatchRuntimeStatus() {
      if (options.platform !== "ios") {
        return Promise.resolve(unavailableStatus(nonIosReason));
      }

      if (!options.nativeModule) {
        return Promise.resolve(unavailableStatus(missingModuleReason));
      }

      const missingMethod = firstMissingNativeMethod(options.nativeModule);

      if (missingMethod) {
        return Promise.resolve(
          unavailableStatus(missingNativeMethodReason(missingMethod)),
        );
      }

      return requireNativeMethod("getWatchRuntimeStatus")();
    },

    getWatchEpochs(sessionId: string) {
      return requireNativeMethod("getWatchEpochs")(sessionId);
    },

    getWatchRuntimeLogs(sessionId: string) {
      return requireNativeMethod("getWatchRuntimeLogs")(sessionId);
    },

    clearWatchRuntimeLogs(sessionId?: string) {
      return requireNativeMethod("clearWatchRuntimeLogs")(sessionId ?? "");
    },
  };
}
