import Foundation

enum WatchPreflightBlockingReason: String, Codable, Equatable, CaseIterable {
  case lowBattery = "low_battery"
  case lowPowerModeEnabled = "low_power_mode_enabled"
  case healthKitNotAuthorized = "healthkit_not_authorized"
  case workoutRuntimeUnavailable = "workout_runtime_unavailable"
  case motionUnavailable = "motion_unavailable"
  case noCueOutputAvailable = "no_cue_output_available"
  case hapticPreflightMissing = "haptic_preflight_missing"
  case audioPreflightMissing = "audio_preflight_missing"
  case missingRequiredAsset = "missing_required_asset"
  case missingRequiredModel = "missing_required_model"
  case planNotCommitted = "plan_not_committed"
  case invalidPlan = "invalid_plan"
  case storageUnavailable = "storage_unavailable"
}

enum WatchPreflightWarning: String, Codable, Equatable, CaseIterable {
  case lowBatteryWarning = "low_battery_warning"
  case audioOutputUnavailableButDisabled = "audio_output_unavailable_but_disabled"
  case modelHashUnavailableButNotRequired = "model_hash_unavailable_but_not_required"
}

struct WatchRuntimePreflightResult: Equatable {
  let canStart: Bool
  let blockingReasons: [WatchPreflightBlockingReason]
  let warnings: [WatchPreflightWarning]
  let batteryLevel: Double?
  let lowPowerModeEnabled: Bool
  let healthKitAuthorization: WatchHealthKitAuthorization
  let workoutRuntimeAvailable: Bool
  let motionAvailable: Bool
  let hapticOutputAvailable: Bool
  let audioOutputAvailable: Bool
  let audioPreflightRequired: Bool
  let audioPreflightPassed: Bool
  let hapticPreflightRequired: Bool
  let hapticPreflightPassed: Bool
  let requiredAssetsPresent: Bool
  let requiredModelPresent: Bool
  let planCommitted: Bool
  let evaluatedAt: Date
}

enum WatchRuntimePreflight {
  static func evaluate(
    plan: WatchRuntimePlanV3,
    capabilities: WatchRuntimeCapabilities,
    evaluatedAt: Date
  ) -> WatchRuntimePreflightResult {
    var blockingReasons: [WatchPreflightBlockingReason] = []
    var warnings: [WatchPreflightWarning] = []

    if !plan.validationErrors().isEmpty {
      blockingReasons.append(.invalidPlan)
    }

    if !capabilities.storageAvailable {
      blockingReasons.append(.storageUnavailable)
    }

    if !capabilities.planCommitted {
      blockingReasons.append(.planNotCommitted)
    }

    if let batteryLevel = capabilities.batteryLevel {
      if batteryLevel < plan.safety.minimumStartBatteryLevel {
        blockingReasons.append(.lowBattery)
      } else if batteryLevel <= plan.safety.lowBatteryWarningLevel {
        warnings.append(.lowBatteryWarning)
      }
    } else {
      blockingReasons.append(.lowBattery)
    }

    if plan.safety.requireLowPowerModeOff && capabilities.lowPowerModeEnabled {
      blockingReasons.append(.lowPowerModeEnabled)
    }

    if plan.safety.requireHealthKitAuthorization &&
      capabilities.healthKitAuthorization != .authorized {
      blockingReasons.append(.healthKitNotAuthorized)
    }

    if plan.safety.requireWorkoutSession && !capabilities.workoutRuntimeAvailable {
      blockingReasons.append(.workoutRuntimeUnavailable)
    }

    if plan.safety.requireMotion && !capabilities.motionAvailable {
      blockingReasons.append(.motionUnavailable)
    }

    let cueOutputRequired = plan.cueOutput.hapticEnabled || plan.cueOutput.audioEnabled
    let hapticCanCarryCue = plan.cueOutput.hapticEnabled && capabilities.hapticOutputAvailable
    let audioCanCarryCue = plan.cueOutput.audioEnabled && capabilities.audioOutputAvailable

    if cueOutputRequired && !hapticCanCarryCue && !audioCanCarryCue {
      blockingReasons.append(.noCueOutputAvailable)
    }

    if plan.cueOutput.hapticEnabled &&
      capabilities.hapticPreflightRequired &&
      !capabilities.hapticPreflightPassed {
      blockingReasons.append(.hapticPreflightMissing)
    }

    if plan.cueOutput.audioEnabled &&
      capabilities.audioPreflightRequired &&
      !capabilities.audioPreflightPassed {
      blockingReasons.append(.audioPreflightMissing)
    }

    if !plan.cueOutput.audioEnabled && !capabilities.audioOutputAvailable {
      warnings.append(.audioOutputUnavailableButDisabled)
    }

    if !capabilities.requiredAssetsPresent {
      blockingReasons.append(.missingRequiredAsset)
    }

    if !capabilities.requiredModelPresent {
      blockingReasons.append(.missingRequiredModel)
    }

    if plan.model.sha256 == nil && capabilities.requiredModelPresent {
      warnings.append(.modelHashUnavailableButNotRequired)
    }

    let uniqueBlockingReasons = unique(blockingReasons)
    let uniqueWarnings = unique(warnings)

    return WatchRuntimePreflightResult(
      canStart: uniqueBlockingReasons.isEmpty,
      blockingReasons: uniqueBlockingReasons,
      warnings: uniqueWarnings,
      batteryLevel: capabilities.batteryLevel,
      lowPowerModeEnabled: capabilities.lowPowerModeEnabled,
      healthKitAuthorization: capabilities.healthKitAuthorization,
      workoutRuntimeAvailable: capabilities.workoutRuntimeAvailable,
      motionAvailable: capabilities.motionAvailable,
      hapticOutputAvailable: capabilities.hapticOutputAvailable,
      audioOutputAvailable: capabilities.audioOutputAvailable,
      audioPreflightRequired: capabilities.audioPreflightRequired,
      audioPreflightPassed: capabilities.audioPreflightPassed,
      hapticPreflightRequired: capabilities.hapticPreflightRequired,
      hapticPreflightPassed: capabilities.hapticPreflightPassed,
      requiredAssetsPresent: capabilities.requiredAssetsPresent,
      requiredModelPresent: capabilities.requiredModelPresent,
      planCommitted: capabilities.planCommitted,
      evaluatedAt: evaluatedAt
    )
  }

  private static func unique<T: Equatable>(_ values: [T]) -> [T] {
    values.reduce(into: []) { result, value in
      if !result.contains(value) {
        result.append(value)
      }
    }
  }
}
