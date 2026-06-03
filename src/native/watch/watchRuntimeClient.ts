import type {
  WatchOwnedImportPayloadV2,
  WatchOwnedSessionPlanV2,
  WatchOwnedStatusV2,
} from "./WatchOwnedTypes";

export interface NativeWatchRuntimeModule {
  beginWatchOwnedStartSync: (plan: WatchOwnedSessionPlanV2) => Promise<void>;
  requestWatchOwnedLogSync: (options: { sessionId: string }) => Promise<void>;
  acknowledgeWatchOwnedLogSync: (options: { sessionId: string }) => Promise<void>;
  getLatestWatchOwnedStatus: () => Promise<WatchOwnedStatusV2>;
  importWatchOwnedSessionLogs: (
    sessionId: string,
  ) => Promise<WatchOwnedImportPayloadV2>;
}

type WatchRuntimeClientOptions = {
  platform: string;
  nativeModule?: Partial<NativeWatchRuntimeModule>;
};

type NativeWatchRuntimeMethodName = keyof NativeWatchRuntimeModule;

const requiredNativeMethods: NativeWatchRuntimeMethodName[] = [
  "beginWatchOwnedStartSync",
  "requestWatchOwnedLogSync",
  "acknowledgeWatchOwnedLogSync",
  "getLatestWatchOwnedStatus",
  "importWatchOwnedSessionLogs",
];

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

    beginWatchOwnedStartSync(plan: WatchOwnedSessionPlanV2) {
      return requireNativeMethod("beginWatchOwnedStartSync")(plan);
    },

    requestWatchOwnedLogSync(options: { sessionId: string }) {
      return requireNativeMethod("requestWatchOwnedLogSync")(options);
    },

    acknowledgeWatchOwnedLogSync(options: { sessionId: string }) {
      return requireNativeMethod("acknowledgeWatchOwnedLogSync")(options);
    },

    getLatestWatchOwnedStatus() {
      if (options.platform !== "ios") {
        return Promise.resolve(unavailableWatchOwnedStatus(nonIosReason));
      }

      if (!options.nativeModule) {
        return Promise.resolve(unavailableWatchOwnedStatus(missingModuleReason));
      }

      const missingMethod = firstMissingNativeMethod(options.nativeModule);

      if (missingMethod) {
        return Promise.resolve(
          unavailableWatchOwnedStatus(
            missingNativeMethodReason(missingMethod),
          ),
        );
      }

      return requireNativeMethod("getLatestWatchOwnedStatus")();
    },

    importWatchOwnedSessionLogs(sessionId: string) {
      return requireNativeMethod("importWatchOwnedSessionLogs")(sessionId);
    },
  };
}
