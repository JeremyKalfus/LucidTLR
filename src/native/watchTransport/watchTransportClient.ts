import type {
  NativeWatchTransportModule,
  NativeWatchTransportStatus,
  WatchTransportClient,
  WatchTransportUnavailableOptions,
} from "./NativeWatchTransportTypes";

type NativeWatchTransportMethodName = keyof NativeWatchTransportModule;

const requiredNativeMethods: NativeWatchTransportMethodName[] = [
  "activateTransport",
  "getTransportStatus",
  "stageSyntheticPlan",
  "requestWatchStatus",
  "getLatestReceivedSyntheticPackage",
  "sendAckForImportedPackage",
  "clearLabTransportStatus",
];

function unavailableStatus(reason: string): NativeWatchTransportStatus {
  return {
    available: false,
    unavailableReason: reason,
    activationState: "unavailable",
    paired: false,
    watchAppInstalled: false,
    reachable: false,
    isReachableInformationalOnly: true,
    lastError: reason,
  };
}

function missingNativeMethodReason(methodName: string): string {
  return `LucidTLRWatchTransport in this iOS build does not export ${methodName}. Install a current Internal TestFlight Lab or iOS development build before using the synthetic WatchConnectivity lab.`;
}

function firstMissingNativeMethod(
  nativeModule: Partial<NativeWatchTransportModule> | undefined,
): NativeWatchTransportMethodName | null {
  if (!nativeModule) {
    return null;
  }

  return (
    requiredNativeMethods.find(
      (methodName) => typeof nativeModule[methodName] !== "function",
    ) ?? null
  );
}

export function createWatchTransportClient(
  options: WatchTransportUnavailableOptions,
): WatchTransportClient {
  const nonIosReason =
    "Synthetic WatchConnectivity transport is unavailable on this platform.";
  const missingModuleReason =
    "LucidTLRWatchTransport is only available in a custom iOS development build or Internal TestFlight Lab build.";

  function requireNativeModule(): Partial<NativeWatchTransportModule> {
    if (options.platform !== "ios") {
      throw new Error(nonIosReason);
    }

    if (!options.nativeModule) {
      throw new Error(missingModuleReason);
    }

    return options.nativeModule;
  }

  function requireNativeMethod<
    MethodName extends NativeWatchTransportMethodName,
  >(methodName: MethodName): NativeWatchTransportModule[MethodName] {
    const nativeModule = requireNativeModule();
    const nativeMethod = nativeModule[methodName];

    if (typeof nativeMethod !== "function") {
      throw new Error(missingNativeMethodReason(methodName));
    }

    return nativeMethod.bind(
      nativeModule,
    ) as NativeWatchTransportModule[MethodName];
  }

  function statusOrUnavailable(): Promise<NativeWatchTransportStatus> {
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

    return requireNativeMethod("getTransportStatus")();
  }

  return {
    isAvailable() {
      return (
        options.platform === "ios" &&
        Boolean(options.nativeModule) &&
        firstMissingNativeMethod(options.nativeModule) === null
      );
    },

    activateTransport() {
      return requireNativeMethod("activateTransport")();
    },

    getTransportStatus() {
      return statusOrUnavailable();
    },

    stageSyntheticPlan(message) {
      return requireNativeMethod("stageSyntheticPlan")(message);
    },

    requestWatchStatus(message) {
      return requireNativeMethod("requestWatchStatus")(message);
    },

    getLatestReceivedSyntheticPackage() {
      if (options.platform !== "ios" || !options.nativeModule) {
        return Promise.resolve(null);
      }

      return requireNativeMethod("getLatestReceivedSyntheticPackage")();
    },

    sendAckForImportedPackage(message) {
      return requireNativeMethod("sendAckForImportedPackage")(message);
    },

    clearLabTransportStatus() {
      return requireNativeMethod("clearLabTransportStatus")();
    },
  };
}
