import Foundation

enum SyntheticPreflightScenario: String, CaseIterable, Identifiable {
  case allPass
  case lowBattery
  case lowPowerModeOn
  case missingHealthAuthorization
  case missingWorkoutRuntime
  case missingMotion
  case missingCueOutput
  case missingHapticPreflight
  case missingAudioPreflight
  case missingAsset
  case missingModel
  case noPlanCommit

  var id: String { rawValue }

  var label: String {
    switch self {
    case .allPass:
      return "all-pass preflight"
    case .lowBattery:
      return "low battery"
    case .lowPowerModeOn:
      return "Low Power Mode"
    case .missingHealthAuthorization:
      return "missing HealthKit"
    case .missingWorkoutRuntime:
      return "missing workout runtime"
    case .missingMotion:
      return "missing motion"
    case .missingCueOutput:
      return "missing cue output"
    case .missingHapticPreflight:
      return "missing haptic preflight"
    case .missingAudioPreflight:
      return "missing audio preflight"
    case .missingAsset:
      return "missing required asset"
    case .missingModel:
      return "missing required model"
    case .noPlanCommit:
      return "no local plan commit"
    }
  }
}

struct SyntheticPreflightProvider: WatchRuntimePreflightProviding,
  BatteryStatusProviding,
  PowerModeProviding,
  HealthAuthorizationProviding,
  WorkoutRuntimeCapabilityProviding,
  MotionCapabilityProviding,
  CueOutputCapabilityProviding,
  AssetAvailabilityProviding,
  PlanCommitProviding {
  let scenario: SyntheticPreflightScenario
  let batteryLevel: Double

  init(
    scenario: SyntheticPreflightScenario = .allPass,
    batteryLevel: Double = 0.9
  ) {
    self.scenario = scenario
    self.batteryLevel = scenario == .lowBattery ? 0.12 : batteryLevel
  }

  func batteryStatus(at date: Date) -> WatchBatteryStatus {
    WatchBatteryStatus(level: batteryLevel, evaluatedAt: date)
  }

  var isLowPowerModeEnabled: Bool {
    scenario == .lowPowerModeOn
  }

  var healthKitAuthorization: WatchHealthKitAuthorization {
    scenario == .missingHealthAuthorization ? .denied : .authorized
  }

  var workoutRuntimeAvailable: Bool {
    scenario != .missingWorkoutRuntime
  }

  var motionAvailable: Bool {
    scenario != .missingMotion
  }

  var storageAvailable: Bool {
    true
  }

  func hasCommittedPlan(_ plan: WatchRuntimePlanV3) -> Bool {
    scenario != .noPlanCommit
  }

  func requiredAssetsPresent(for plan: WatchRuntimePlanV3) -> Bool {
    scenario != .missingAsset
  }

  func requiredModelPresent(for plan: WatchRuntimePlanV3) -> Bool {
    scenario != .missingModel
  }

  func cueOutputCapabilities(for plan: WatchRuntimePlanV3) -> WatchCueOutputCapabilities {
    let cueOutputMissing = scenario == .missingCueOutput
    let hapticPreflightMissing = scenario == .missingHapticPreflight
    let audioPreflightMissing = scenario == .missingAudioPreflight

    return WatchCueOutputCapabilities(
      hapticOutputAvailable: plan.cueOutput.hapticEnabled && !cueOutputMissing,
      audioOutputAvailable: plan.cueOutput.audioEnabled && !cueOutputMissing,
      hapticPreflightRequired: plan.cueOutput.hapticEnabled,
      hapticPreflightPassed: plan.cueOutput.hapticEnabled && !hapticPreflightMissing,
      audioPreflightRequired: plan.cueOutput.audioEnabled && plan.cueOutput.audioRequiresPreflight,
      audioPreflightPassed: plan.cueOutput.audioEnabled && !audioPreflightMissing
    )
  }

  func capabilities(
    for plan: WatchRuntimePlanV3,
    at date: Date
  ) -> WatchRuntimeCapabilities {
    let battery = batteryStatus(at: date)
    let cueCapabilities = cueOutputCapabilities(for: plan)

    return WatchRuntimeCapabilities(
      batteryLevel: battery.level,
      lowPowerModeEnabled: isLowPowerModeEnabled,
      healthKitAuthorization: healthKitAuthorization,
      workoutRuntimeAvailable: workoutRuntimeAvailable,
      motionAvailable: motionAvailable,
      hapticOutputAvailable: cueCapabilities.hapticOutputAvailable,
      audioOutputAvailable: cueCapabilities.audioOutputAvailable,
      audioPreflightRequired: cueCapabilities.audioPreflightRequired,
      audioPreflightPassed: cueCapabilities.audioPreflightPassed,
      hapticPreflightRequired: cueCapabilities.hapticPreflightRequired,
      hapticPreflightPassed: cueCapabilities.hapticPreflightPassed,
      requiredAssetsPresent: requiredAssetsPresent(for: plan),
      requiredModelPresent: requiredModelPresent(for: plan),
      planCommitted: hasCommittedPlan(plan),
      storageAvailable: storageAvailable
    )
  }
}
