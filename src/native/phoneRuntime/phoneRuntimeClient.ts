import type {
  NativePhoneRuntimeEvent,
  NativePhoneSessionPlan,
  PhoneRuntimeStatus,
} from "./NativePhoneSessionPlan";

type RuntimeStopReason = "user_stopped" | "completed" | "error";

export type RuntimeStopOptions = {
  reason?: RuntimeStopReason;
};

export interface NativePhoneRuntimeModule {
  startPhoneTlrSession: (plan: NativePhoneSessionPlan) => Promise<void>;
  stopPhoneTlrSession: (options?: RuntimeStopOptions) => Promise<void>;
  getPhoneRuntimeStatus: () => Promise<PhoneRuntimeStatus>;
  getPhoneRuntimeLogs: (
    sessionId: string,
  ) => Promise<NativePhoneRuntimeEvent[]>;
  clearPhoneRuntimeLogs: (sessionId: string) => Promise<void>;
}

type PhoneRuntimeClientOptions = {
  platform: string;
  nativeModule?: NativePhoneRuntimeModule;
};

function unavailableStatus(reason: string): PhoneRuntimeStatus {
  return {
    available: false,
    unavailableReason: reason,
    running: false,
    audioBedRunning: false,
    motionRunning: false,
    cueCount: 0,
    cuesInBlock: 0,
  };
}

export function createPhoneRuntimeClient(options: PhoneRuntimeClientOptions) {
  const nonIosReason =
    "iPhone Phone Mode native runtime is unavailable on this platform.";
  const missingModuleReason =
    "LucidCuePhoneRuntime is only available in a custom iOS development build.";

  function requireNativeModule(): NativePhoneRuntimeModule {
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

    startPhoneTlrSession(plan: NativePhoneSessionPlan) {
      return requireNativeModule().startPhoneTlrSession(plan);
    },

    stopPhoneTlrSession(stopOptions?: RuntimeStopOptions) {
      return requireNativeModule().stopPhoneTlrSession(stopOptions);
    },

    getPhoneRuntimeStatus() {
      if (options.platform !== "ios") {
        return Promise.resolve(unavailableStatus(nonIosReason));
      }

      if (!options.nativeModule) {
        return Promise.resolve(unavailableStatus(missingModuleReason));
      }

      return options.nativeModule.getPhoneRuntimeStatus();
    },

    getPhoneRuntimeLogs(sessionId: string) {
      return requireNativeModule().getPhoneRuntimeLogs(sessionId);
    },

    clearPhoneRuntimeLogs(sessionId?: string) {
      return requireNativeModule().clearPhoneRuntimeLogs(sessionId ?? "");
    },
  };
}
