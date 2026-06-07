import Foundation

enum WatchRuntimeState: String, Codable, Equatable {
  case idle
  case preflight
  case planCommitted
  case training
  case waitingForTlrInterval
  case tlrActive
  case logOnly
  case paused
  case sealing
  case sealedWaitingForPhone
  case importedAcknowledged
  case failedSafeSealed
}

enum WatchRuntimeEventType: String, Codable, Equatable {
  case runtimePreflightStarted = "runtime_preflight_started"
  case runtimePreflightPassed = "runtime_preflight_passed"
  case runtimePreflightFailed = "runtime_preflight_failed"
  case runtimePlanCommitted = "runtime_plan_committed"
  case runtimeStarted = "runtime_started"
  case trainingStarted = "training_started"
  case trainingCompleted = "training_completed"
  case tlrIntervalStarted = "tlr_interval_started"
  case logOnlyStarted = "log_only_started"
  case epochProcessed = "epoch_processed"
  case cueDecision = "cue_decision"
  case cueSuppressed = "cue_suppressed"
  case cuePlayAttempted = "cue_play_attempted"
  case cuePlayed = "cue_played"
  case cueFailed = "cue_failed"
  case movementPauseStarted = "movement_pause_started"
  case movementPauseEnded = "movement_pause_ended"
  case cueAssociatedMovementPauseStarted = "cue_associated_movement_pause_started"
  case userInteractionLogged = "user_interaction_logged"
  case lowBatterySafeSealStarted = "low_battery_safe_seal_started"
  case packageSealed = "package_sealed"
  case runtimeStopped = "runtime_stopped"
  case runtimeError = "runtime_error"
}

enum WatchRuntimeSealReason: String, Codable, Equatable {
  case completed
  case userWake = "user_wake"
  case safeLowBattery = "safe_low_battery"
  case runtimeError = "runtime_error"
  case manualForceSeal = "manual_force_seal"
}

enum WatchSensorQuality: String, Codable, Equatable {
  case good
  case degraded
  case missing
  case bad
}

enum WatchRemLabel: String, Codable, Equatable {
  case likelyRem = "likely_rem"
  case unlikelyRem = "unlikely_rem"
  case unknown
}

enum WatchCueDecisionReason: String, Codable, Equatable {
  case sleepLogCueingDisabled = "sleep_log_cueing_disabled"
  case beforeTlrInterval = "before_tlr_interval"
  case sensorQualityNotGood = "sensor_quality_not_good"
  case movementGateActive = "movement_gate_active"
  case cueAssociatedMovementPauseActive = "cue_associated_movement_pause_active"
  case recentUserInteraction = "recent_user_interaction"
  case cueRefractoryActive = "cue_refractory_active"
  case cueBudgetExhausted = "cue_budget_exhausted"
  case remPersistenceNotMet = "rem_persistence_not_met"
  case remPersistencePassed = "rem_persistence_passed"
}

struct WatchSyntheticRunResult: Equatable {
  let finalState: WatchRuntimeState
  let manifest: WatchPackageManifestV3
  let events: [WatchRuntimeEventV3]
  let epochs: [WatchEpochRecordV3]
  let cueRecords: [WatchCueRecordV3]
  let movementRecords: [WatchMovementRecordV3]
}
