import type {
  CueSuppressionReason,
  WatchEpoch,
  WatchSensorQuality,
} from "@/src/domain/types";

export type WatchConnectivityState = "connected" | "delayed" | "disconnected" | "unknown";

export type WatchMovementIntensity = "still" | "light" | "moderate" | "large";

export type WatchHealthAuthorizationStatus =
  | "unknown"
  | "authorized"
  | "denied"
  | "unavailable";

export type WatchRuntimeLifecycleState =
  | "idle"
  | "startPending"
  | "watchConfirmed"
  | "running"
  | "stopping"
  | "stopped"
  | "failedStart"
  | "orphanDetected";

export type WatchEpochMessage = {
  schemaVersion: "watch-epoch-v1";
  sessionId: string;
  watchSessionId: string;
  epochIndex: number;
  epochStart: string;
  epochEnd: string;
  elapsedSessionSeconds: number;
  heartRate: {
    sampleCount: number;
    meanBpm?: number;
    minBpm?: number;
    maxBpm?: number;
    lastBpm?: number;
    hrEma?: number;
    hrFeature?: number;
  };
  motion: {
    sampleCount: number;
    meanMagnitude?: number;
    maxMagnitude?: number;
    activityCountMagnitudeSum?: number;
    motionEma?: number;
    motionFeature?: number;
    stableLowMovementSeconds?: number;
    roughMovementIntensity?: WatchMovementIntensity;
  };
  modelFeatures: {
    hrFeature?: number;
    motionFeature?: number;
    timeFeatureHours: number;
  };
  battery: {
    level?: number;
    state?: string;
    lowPowerMode?: boolean;
  };
  sensorQuality: WatchSensorQuality;
  missingReasons?: string[];
  connectivityState?: WatchConnectivityState;
  receivedAt?: string;
};

export type NativeWatchSessionPlan = {
  sessionId: string;
  protocolVersion: string;
  nativePolicyVersion: string;
  mode: "watch";
  startedAt: string;
  trainingStartedAt: string;
  trainingEndedAt: string;
  iPhoneAudio: {
    audioBedRequired: true;
    audioBedAssetId: string;
    audioBedVolume: number;
    cueAssetId: string;
    cueId: string;
    cueResourceName: string;
    cueResourceExtension: "mp3" | "wav";
    cueDurationSeconds: number;
    startVolume: number;
    rampPerCue: number;
    capVolume: number;
  };
  watch: {
    epochSeconds: 30;
    requireHeartRate: true;
    requireMotion: true;
    motionTargetHz: 30;
    enableWaterLock: boolean;
  };
  classifier: {
    classifierVersion: string;
    modelAvailable: boolean;
    remThreshold: number;
    minimumSleepProbability?: number;
    suppressAfterConsecutiveLikelyRemEpochs: number;
  };
  cuePolicy: {
    minimumSecondsSinceLastCue: number;
    stableLowMovementRequiredSeconds: number;
    cueAssociatedMovementWindowSeconds: number;
    cueAssociatedMovementPauseSeconds: number;
    maxCuesTonight: number;
    maxCuesPerBlock: number;
    maxBlockDurationMinutes: number;
    minRestBetweenBlocksMinutes: number;
  };
  safety: {
    expectedWakeAt?: string;
    stopAt?: string;
    requireIPhoneAudioBed: true;
    stopIfWatchDisconnectedMinutes?: number;
    requireWatchBatteryAbovePercentAtStart?: number;
  };
};

export type WatchStartedReply = {
  schemaVersion: "watch-started-v1";
  commandId: string;
  sessionId: string;
  watchSessionId: string;
  startedAt: string;
  isRunning: true;
  healthAuthorizationStatus?: WatchHealthAuthorizationStatus;
  stopAt?: string;
};

export type WatchRuntimeStatus = {
  available: boolean;
  unavailableReason?: string;
  lifecycleState?: WatchRuntimeLifecycleState;
  running: boolean;
  sessionId?: string;
  watchSessionRunning: boolean;
  watchReachable: boolean;
  watchAppInstalled?: boolean;
  watchRecentlySeen?: boolean;
  watchStartEligible?: boolean;
  watchLastSeenAt?: string;
  watchStatusReason?: string;
  watchHealthAuthorizationStatus?: WatchHealthAuthorizationStatus;
  watchStartConfirmedAt?: string;
  watchFirstEpochConfirmedAt?: string;
  watchStartFailureReason?: string;
  latestWatchSessionId?: string;
  latestWatchSessionStartedAt?: string;
  latestWatchStopAt?: string;
  audioBedRunning: boolean;
  cueCount: number;
  consecutiveLikelyRemEpochs: number;
  latestEpochAt?: string;
  latestHeartRate?: number;
  latestMotionSummary?: number;
  latestRemProbability?: number;
  latestSensorQuality?: WatchSensorQuality;
  latestCueDecisionReason?: string;
  classifierVersion: string;
  modelAvailable: boolean;
  watchBatteryLevel?: number;
  connectivityState: WatchConnectivityState;
  latestRuntimeError?: string;
  tlrPaused?: boolean;
  tlrDeferredUntil?: string;
};

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
  played: boolean;
  suppressionReason: CueSuppressionReason;
};
