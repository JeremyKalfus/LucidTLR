import Foundation

enum WatchRuntimePlanV3Schema {
  static let schemaVersion = "watch-runtime-plan-v3"
}

struct WatchRuntimePlanV3: Codable, Equatable {
  let schemaVersion: String
  let sessionId: String
  let participantId: String
  let sessionType: String
  let mode: String
  let createdAt: String
  let protocolVersion: String
  let watchPolicyVersion: String
  let remModelVersion: String
  let planHash: String
  let selectedCueId: String
  let cue: WatchRuntimeCueV3
  let cueOutput: WatchRuntimeCueOutputV3
  let training: WatchRuntimeTrainingV3
  let tlrInterval: WatchRuntimeTlrIntervalV3
  let epoching: WatchRuntimeEpochingV3
  let remPolicy: WatchRuntimeRemPolicyV3
  let movement: WatchRuntimeMovementV3
  let budget: WatchRuntimeBudgetV3
  let safety: WatchRuntimeSafetyV3
  let assets: [WatchRuntimeAssetV3]
  let model: WatchRuntimeModelV3
  let privacy: WatchRuntimePrivacyV3

  func validationErrors() -> [String] {
    var errors: [String] = []

    if schemaVersion != WatchRuntimePlanV3Schema.schemaVersion {
      errors.append("Watch plan schemaVersion must be watch-runtime-plan-v3.")
    }

    if mode != "watch" {
      errors.append("Watch runtime plan mode must be watch.")
    }

    if sessionType != "tlr" && sessionType != "sleep_log" {
      errors.append("Watch runtime plan sessionType must be tlr or sleep_log.")
    }

    if planHash.isEmpty {
      errors.append("Watch runtime planHash must be present.")
    }

    if epoching.epochSeconds != 30 {
      errors.append("Watch plans must use 30-second epochs.")
    }

    if !safety.requireWorkoutSession {
      errors.append("Watch plans must require a workout session.")
    }

    if !safety.requireLowPowerModeOff {
      errors.append("Watch plans must block start when Low Power Mode is on.")
    }

    if sessionType == "tlr" && !cueOutput.hapticEnabled && !cueOutput.audioEnabled {
      errors.append("TLR Watch plans require haptic or audio cue output.")
    }

    if cueOutput.audioEnabled && !cueOutput.audioRequiresPreflight {
      errors.append("Audio-enabled Watch plans require same-night audio preflight.")
    }

    if cueOutput.audioEnabled && !cueOutput.preflightRequired {
      errors.append("Audio-enabled Watch plans require cue output preflight.")
    }

    if cue.sha256.isEmpty {
      errors.append("Watch plans must include the cue asset sha256.")
    }

    if !assets.contains(where: { $0.id == cue.assetId && $0.sha256 == cue.sha256 }) {
      errors.append("Watch plan cue asset must be present in the required asset list.")
    }

    if training.enabled && training.sha256.isEmpty {
      errors.append("Enabled Watch training requires a bundled training asset sha256.")
    }

    if model.modelVersion.isEmpty || remModelVersion.isEmpty {
      errors.append("Watch plans must include explicit REM model versions.")
    }

    if sessionType == "sleep_log" &&
      (cueOutput.hapticEnabled || cueOutput.audioEnabled || tlrInterval.enabled) {
      errors.append("Sleep log Watch plans must keep cue delivery disabled.")
    }

    if !privacy.noGps || !privacy.noSensorKit || !privacy.noLiveAppleSleepStages ||
      !privacy.noSpO2 || !privacy.noRespiratoryRate || !privacy.noWristTemperature {
      errors.append("Watch plans must preserve the v3 privacy exclusions.")
    }

    if assets.contains(where: { $0.id.isEmpty || $0.fileName.isEmpty || $0.sha256.isEmpty || $0.byteLength <= 0 }) {
      errors.append("Watch plan required assets must include id, filename, byteLength, and sha256.")
    }

    // TODO: Recompute planHash after choosing the native SHA-256 implementation
    // and canonical JSON strategy for the Watch runtime.
    return errors
  }
}

struct WatchRuntimeCueV3: Codable, Equatable {
  let cueId: String
  let assetId: String
  let resourceName: String
  let resourceExtension: String
  let durationSeconds: Double
  let sha256: String
}

struct WatchRuntimeCueOutputV3: Codable, Equatable {
  let hapticEnabled: Bool
  let audioEnabled: Bool
  let audioRequiresPreflight: Bool
  let preflightRequired: Bool
  let defaultOutput: String
}

struct WatchRuntimeTrainingCueScheduleEntryV3: Codable, Equatable {
  let markerIndex: Int
  let markerMidpointSeconds: Double
  let cueStartSeconds: Double
}

struct WatchRuntimeTrainingV3: Codable, Equatable {
  let enabled: Bool
  let skipped: Bool
  let audioResourceName: String
  let audioResourceExtension: String
  let durationSeconds: Double
  let cueSchedule: [WatchRuntimeTrainingCueScheduleEntryV3]
  let sha256: String
}

struct WatchRuntimeTlrIntervalV3: Codable, Equatable {
  let enabled: Bool
  let earliestCueAt: String
  let latestCueAt: String
  let derivedFrom: String
}

struct WatchRuntimeEpochingV3: Codable, Equatable {
  let epochSeconds: Int
  let motionSampleHz: Double
  let rawMotionPersistence: Bool
}

struct WatchRuntimeRemPolicyV3: Codable, Equatable {
  let classifierVersion: String
  let threshold: Double
  let persistenceRule: String
  let minimumSleepProbability: Double
  let sensorQualityRequired: String
}

struct WatchRuntimeMovementV3: Codable, Equatable {
  let stableLowMovementRequiredSeconds: Int
  let largeMovementThreshold: Double
  let cueAssociatedMovementWindowSeconds: Int
  let cueAssociatedMovementPauseSeconds: Int
  let userInteractionSuppressionSeconds: Int
}

struct WatchRuntimeBudgetV3: Codable, Equatable {
  let maxCuesTonight: Int
  let minimumSecondsSinceLastCue: Int
}

struct WatchRuntimeSafetyV3: Codable, Equatable {
  let requireWorkoutSession: Bool
  let requireHealthKitAuthorization: Bool
  let requireMotion: Bool
  let requireLowPowerModeOff: Bool
  let minimumStartBatteryLevel: Double
  let lowBatteryWarningLevel: Double
  let safeSealBatteryLevel: Double
  let emergencyStopBatteryLevel: Double
}

struct WatchRuntimeAssetV3: Codable, Equatable {
  let id: String
  let kind: String
  let fileName: String
  let resourceName: String
  let resourceExtension: String
  let sha256: String
  let byteLength: Int
}

struct WatchRuntimeModelV3: Codable, Equatable {
  let modelId: String
  let modelVersion: String
  let sha256: String?
  let evaluatorType: String
}

struct WatchRuntimePrivacyV3: Codable, Equatable {
  let noGps: Bool
  let noSensorKit: Bool
  let noLiveAppleSleepStages: Bool
  let noSpO2: Bool
  let noRespiratoryRate: Bool
  let noWristTemperature: Bool
}
