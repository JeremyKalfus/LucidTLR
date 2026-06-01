import type {
  NativePhoneRuntimeEvent,
  NativePhoneSessionPlan,
  PhoneRuntimeStatus,
} from "./NativePhoneSessionPlan";

type RuntimeStopReason = "user_stopped" | "completed" | "error";

export type RuntimeStopOptions = {
  reason?: RuntimeStopReason;
};

export type RuntimeDeferOptions = {
  durationSeconds?: number;
};

export interface NativePhoneRuntimeModule {
  startPhoneTlrSession: (plan: NativePhoneSessionPlan) => Promise<void>;
  startPhoneTlrSessionAfterPresleepTraining: (
    plan: NativePhoneSessionPlan,
  ) => Promise<void>;
  skipPhonePresleepTrainingAndStartRuntime: () => Promise<void>;
  pausePhonePresleepTraining: () => Promise<void>;
  resumePhonePresleepTraining: () => Promise<void>;
  pausePhoneTlrCueing: () => Promise<void>;
  resumePhoneTlrCueing: () => Promise<void>;
  deferPhoneTlrCueing: (options?: RuntimeDeferOptions) => Promise<void>;
  stopPhoneTlrSession: (options?: RuntimeStopOptions) => Promise<void>;
  getPhoneRuntimeStatus: () => Promise<PhoneRuntimeStatus>;
  getPhoneRuntimeLogSessionIds?: () => Promise<string[]>;
  getPhoneRuntimeLogs: (
    sessionId: string,
  ) => Promise<NativePhoneRuntimeEvent[]>;
  clearPhoneRuntimeLogs: (sessionId: string) => Promise<void>;
}

type PhoneRuntimeClientOptions = {
  platform: string;
  nativeModule?: Partial<NativePhoneRuntimeModule>;
};

type NativePhoneRuntimeMethodName = keyof NativePhoneRuntimeModule;

const requiredNativeMethods: NativePhoneRuntimeMethodName[] = [
  "startPhoneTlrSession",
  "startPhoneTlrSessionAfterPresleepTraining",
  "skipPhonePresleepTrainingAndStartRuntime",
  "pausePhonePresleepTraining",
  "resumePhonePresleepTraining",
  "pausePhoneTlrCueing",
  "resumePhoneTlrCueing",
  "deferPhoneTlrCueing",
  "stopPhoneTlrSession",
  "getPhoneRuntimeStatus",
  "getPhoneRuntimeLogs",
  "clearPhoneRuntimeLogs",
];

function unavailableStatus(reason: string): PhoneRuntimeStatus {
  return {
    available: false,
    unavailableReason: reason,
    running: false,
    audioBedRunning: false,
    backgroundAudioRunning: false,
    alarmRinging: false,
    motionRunning: false,
    cueCount: 0,
    cuesInBlock: 0,
    tlrPaused: false,
  };
}

function missingNativeMethodReason(methodName: string): string {
  return `LucidCuePhoneRuntime in this iOS build does not export ${methodName}. Install a current iOS development build before using Phone Mode.`;
}

function firstMissingNativeMethod(
  nativeModule: Partial<NativePhoneRuntimeModule> | undefined,
): NativePhoneRuntimeMethodName | null {
  if (!nativeModule) {
    return null;
  }

  return (
    requiredNativeMethods.find(
      (methodName) => typeof nativeModule[methodName] !== "function",
    ) ?? null
  );
}

export function createPhoneRuntimeClient(options: PhoneRuntimeClientOptions) {
  const nonIosReason =
    "iPhone Phone Mode native runtime is unavailable on this platform.";
  const missingModuleReason =
    "LucidCuePhoneRuntime is only available in a custom iOS development build.";

  function requireNativeModule(): Partial<NativePhoneRuntimeModule> {
    if (options.platform !== "ios") {
      throw new Error(nonIosReason);
    }

    if (!options.nativeModule) {
      throw new Error(missingModuleReason);
    }

    return options.nativeModule;
  }

  function requireNativeMethod<
    MethodName extends NativePhoneRuntimeMethodName,
  >(methodName: MethodName): NativePhoneRuntimeModule[MethodName] {
    const nativeModule = requireNativeModule();
    const nativeMethod = nativeModule[methodName];

    if (typeof nativeMethod !== "function") {
      throw new Error(missingNativeMethodReason(methodName));
    }

    return nativeMethod.bind(nativeModule) as NativePhoneRuntimeModule[MethodName];
  }

  return {
    isAvailable() {
      return (
        options.platform === "ios" &&
        Boolean(options.nativeModule) &&
        firstMissingNativeMethod(options.nativeModule) === null
      );
    },

    startPhoneTlrSession(plan: NativePhoneSessionPlan) {
      return requireNativeMethod("startPhoneTlrSession")(plan);
    },

    startPhoneTlrSessionAfterPresleepTraining(plan: NativePhoneSessionPlan) {
      return requireNativeMethod("startPhoneTlrSessionAfterPresleepTraining")(
        plan,
      );
    },

    skipPhonePresleepTrainingAndStartRuntime() {
      return requireNativeMethod("skipPhonePresleepTrainingAndStartRuntime")();
    },

    pausePhonePresleepTraining() {
      return requireNativeMethod("pausePhonePresleepTraining")();
    },

    resumePhonePresleepTraining() {
      return requireNativeMethod("resumePhonePresleepTraining")();
    },

    pausePhoneTlrCueing() {
      return requireNativeMethod("pausePhoneTlrCueing")();
    },

    resumePhoneTlrCueing() {
      return requireNativeMethod("resumePhoneTlrCueing")();
    },

    deferPhoneTlrCueing(deferOptions?: RuntimeDeferOptions) {
      return requireNativeMethod("deferPhoneTlrCueing")(deferOptions);
    },

    stopPhoneTlrSession(stopOptions?: RuntimeStopOptions) {
      return requireNativeMethod("stopPhoneTlrSession")(stopOptions);
    },

    getPhoneRuntimeStatus() {
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

      return requireNativeMethod("getPhoneRuntimeStatus")();
    },

    getPhoneRuntimeLogSessionIds() {
      if (options.platform !== "ios" || !options.nativeModule) {
        return Promise.resolve([]);
      }

      return (
        options.nativeModule.getPhoneRuntimeLogSessionIds?.() ??
        Promise.resolve([])
      );
    },

    getPhoneRuntimeLogs(sessionId: string) {
      return requireNativeMethod("getPhoneRuntimeLogs")(sessionId);
    },

    clearPhoneRuntimeLogs(sessionId?: string) {
      return requireNativeMethod("clearPhoneRuntimeLogs")(sessionId ?? "");
    },
  };
}
