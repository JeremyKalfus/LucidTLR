import Foundation

enum WatchHealthKitAuthorization: String, Codable, Equatable {
  case authorized
  case notDetermined = "not_determined"
  case denied
  case restricted
  case unavailable
}

struct WatchBatteryStatus: Equatable {
  let level: Double?
  let evaluatedAt: Date
}

struct WatchCueOutputCapabilities: Equatable {
  let hapticOutputAvailable: Bool
  let audioOutputAvailable: Bool
  let hapticPreflightRequired: Bool
  let hapticPreflightPassed: Bool
  let audioPreflightRequired: Bool
  let audioPreflightPassed: Bool
}

struct WatchRuntimeCapabilities: Equatable {
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
  let storageAvailable: Bool
}

protocol BatteryStatusProviding {
  func batteryStatus(at date: Date) -> WatchBatteryStatus
}

protocol HealthAuthorizationProviding {
  var healthKitAuthorization: WatchHealthKitAuthorization { get }
}

protocol WorkoutRuntimeCapabilityProviding {
  var workoutRuntimeAvailable: Bool { get }
}

protocol MotionCapabilityProviding {
  var motionAvailable: Bool { get }
}

protocol CueOutputCapabilityProviding {
  func cueOutputCapabilities(for plan: WatchRuntimePlanV3) -> WatchCueOutputCapabilities
}

protocol AssetAvailabilityProviding {
  func requiredAssetsPresent(for plan: WatchRuntimePlanV3) -> Bool
  func requiredModelPresent(for plan: WatchRuntimePlanV3) -> Bool
}

protocol PlanCommitProviding {
  var storageAvailable: Bool { get }
  func hasCommittedPlan(_ plan: WatchRuntimePlanV3) -> Bool
}

protocol WatchRuntimePreflightProviding {
  func capabilities(
    for plan: WatchRuntimePlanV3,
    at date: Date
  ) -> WatchRuntimeCapabilities
}
