import { NativeModules, Platform } from "react-native";

export type FeasibilityEventType =
  | "session_started"
  | "audio_session_configured"
  | "audio_bed_started"
  | "audio_bed_failed"
  | "audio_bed_paused"
  | "audio_bed_resumed"
  | "audio_bed_volume_changed"
  | "audio_modulation_sequence_started"
  | "audio_modulation_step_scheduled"
  | "audio_segment_preloaded"
  | "audio_segment_play_attempted"
  | "audio_segment_played"
  | "audio_segment_completed"
  | "audio_segment_failed"
  | "native_audio_decision_made"
  | "app_foregrounded"
  | "app_backgrounded"
  | "app_will_terminate"
  | "protected_data_available"
  | "protected_data_unavailable"
  | "cue_scheduled"
  | "cue_play_attempted"
  | "cue_played"
  | "cue_failed"
  | "motion_started"
  | "motion_summary"
  | "motion_stopped"
  | "mic_permission_requested"
  | "mic_permission_denied"
  | "mic_summary"
  | "notification_scheduled"
  | "notification_fired"
  | "audio_interruption_started"
  | "audio_interruption_ended"
  | "audio_route_changed"
  | "battery_summary"
  | "thermal_state_changed"
  | "session_restored"
  | "session_stopped"
  | "session_error";

export type FeasibilityEvent = {
  id: string;
  timestamp: string;
  eventType: FeasibilityEventType;
  payload: Record<string, unknown>;
};

export type FeasibilitySessionOptions = {
  sessionId: string;
  testName: string;
  cueAfterSeconds: number;
  testDurationSeconds: number;
  playAudioBed: boolean;
  audioBedVolume: number;
  enableMotionLogging: boolean;
  enableDebugMicFeatures: boolean;
  enableNotificationFallback?: boolean;
  enableKitchenSinkAudioTest?: boolean;
};

export type IPhonePhoneModeRuntime =
  | "unknown"
  | "locked_audio_motion_supported"
  | "locked_audio_only_supported"
  | "foreground_only"
  | "timed_only";

interface NativeFeasibilityModule {
  startFeasibilitySession: (
    options: FeasibilitySessionOptions,
  ) => Promise<void>;
  stopFeasibilitySession: () => Promise<void>;
  getFeasibilityLogs: () => Promise<FeasibilityEvent[]>;
  clearFeasibilityLogs: () => Promise<void>;
}

const nativeModule = NativeModules.LucidTLROvernightFeasibility as
  | NativeFeasibilityModule
  | undefined;

export function isIPhoneFeasibilityModuleAvailable(): boolean {
  return Platform.OS === "ios" && Boolean(nativeModule?.startFeasibilitySession);
}

function requireNativeModule(): NativeFeasibilityModule {
  if (!isIPhoneFeasibilityModuleAvailable() || !nativeModule) {
    throw new Error(
      "LucidTLROvernightFeasibility is only available in a custom iOS development build.",
    );
  }

  return nativeModule;
}

export const iPhoneFeasibilityHarness = {
  startFeasibilitySession(options: FeasibilitySessionOptions) {
    return requireNativeModule().startFeasibilitySession(options);
  },

  stopFeasibilitySession() {
    return requireNativeModule().stopFeasibilitySession();
  },

  getFeasibilityLogs() {
    return requireNativeModule().getFeasibilityLogs();
  },

  clearFeasibilityLogs() {
    return requireNativeModule().clearFeasibilityLogs();
  },
};
