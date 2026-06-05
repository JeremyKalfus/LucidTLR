import type {
  CueSuppressionReason,
  WatchEpoch,
} from "@/src/domain/types";

export type WatchConnectivityState =
  | "connected"
  | "delayed"
  | "disconnected"
  | "unknown";

export type WatchMovementIntensity = "still" | "light" | "moderate" | "large";

export type WatchRuntimeEvent = {
  id: string;
  sessionId: string;
  timestamp: string;
  eventType:
    | "watch_runtime_start_requested"
    | "watch_start_command_sent"
    | "watch_start_confirmed"
    | "watch_start_timeout"
    | "watch_start_failed"
    | "watch_first_epoch_confirmed"
    | "watch_orphan_detected"
    | "watch_runtime_started"
    | "watch_runtime_stopped"
    | "watch_training_started"
    | "watch_training_cue_marker_reached"
    | "watch_training_cue_played"
    | "watch_training_cue_failed"
    | "watch_training_completed"
    | "watch_training_failed"
    | "watch_tlr_interval_started"
    | "watch_connectivity_activated"
    | "watch_connectivity_failed"
    | "watch_command_sent"
    | "watch_command_failed"
    | "watch_epoch_received"
    | "watch_epoch_delayed"
    | "watch_epoch_duplicate"
    | "watch_epoch_ignored"
    | "watch_epoch_processed"
    | "watch_cue_decision"
    | "watch_cue_played"
    | "watch_cue_failed"
    | "watch_cue_suppressed"
    | "watch_audio_bed_started"
    | "watch_audio_bed_failed"
    | "watch_audio_bed_stopped"
    | "watch_movement_pause_started"
    | "watch_runtime_error";
  payload: Record<string, unknown>;
};

export type WatchEpochRecordDraft = WatchEpoch & {
  epochFeaturesJson?: string;
  watchBatteryLevel?: number;
  watchConnectivityState?: WatchConnectivityState;
  sampleCountsJson?: string;
  stageProbabilitiesJson?: string;
  stageLabel?: string;
  epochReceivedAt?: string;
  processedAt?: string;
  heartRateSampleCount?: number;
  motionSampleCount?: number;
  hrFeature?: number;
  motionFeature?: number;
  motionEma?: number;
  timeFeature?: number;
  rawEpochAvailable?: boolean;
  stableLowMovementSeconds?: number;
  roughMovementIntensity?: WatchMovementIntensity;
  cueDecisionReason?: string;
};

export type WatchCueRecordDraft = {
  id: string;
  sessionId: string;
  timestamp: string;
  cueId: string;
  volumeLevel: number;
  deliveryDevice?: "phone" | "watch";
  played: boolean;
  suppressionReason: CueSuppressionReason;
};

