import Foundation

struct RealWatchRuntimePreflightProvider: WatchRuntimePreflightProviding {
  let batteryProvider: RealBatteryProvider
  let powerModeProvider: RealPowerModeProvider
  let heartRateProvider: HealthKitHeartRateProvider
  let motionProvider: CoreMotionProvider
  let cueOutputProvider: RealCueOutputProvider
  let planCommitted: Bool
  let storageAvailable: Bool
  let bundle: Bundle

  init(
    batteryProvider: RealBatteryProvider,
    powerModeProvider: RealPowerModeProvider,
    heartRateProvider: HealthKitHeartRateProvider,
    motionProvider: CoreMotionProvider,
    cueOutputProvider: RealCueOutputProvider,
    planCommitted: Bool,
    storageAvailable: Bool,
    bundle: Bundle = .main
  ) {
    self.batteryProvider = batteryProvider
    self.powerModeProvider = powerModeProvider
    self.heartRateProvider = heartRateProvider
    self.motionProvider = motionProvider
    self.cueOutputProvider = cueOutputProvider
    self.planCommitted = planCommitted
    self.storageAvailable = storageAvailable
    self.bundle = bundle
  }

  func capabilities(
    for plan: WatchRuntimePlanV3,
    at date: Date
  ) -> WatchRuntimeCapabilities {
    let battery = batteryProvider.batteryStatus(at: date)
    let cueCapabilities = cueOutputProvider.cueOutputCapabilities(for: plan)

    return WatchRuntimeCapabilities(
      batteryLevel: battery.level,
      lowPowerModeEnabled: powerModeProvider.isLowPowerModeEnabled,
      healthKitAuthorization: heartRateProvider.healthKitAuthorization,
      workoutRuntimeAvailable: heartRateProvider.workoutRuntimeAvailable,
      motionAvailable: motionProvider.motionAvailable,
      hapticOutputAvailable: cueCapabilities.hapticOutputAvailable,
      audioOutputAvailable: cueCapabilities.audioOutputAvailable,
      audioPreflightRequired: cueCapabilities.audioPreflightRequired,
      audioPreflightPassed: cueCapabilities.audioPreflightPassed,
      hapticPreflightRequired: cueCapabilities.hapticPreflightRequired,
      hapticPreflightPassed: cueCapabilities.hapticPreflightPassed,
      requiredAssetsPresent: requiredAssetsPresent(for: plan),
      requiredModelPresent: requiredModelPresent(for: plan),
      planCommitted: planCommitted,
      storageAvailable: storageAvailable
    )
  }

  private func requiredAssetsPresent(for plan: WatchRuntimePlanV3) -> Bool {
    plan.assets.filter { $0.owner == "watch" }.allSatisfy { asset in
      switch asset.kind {
      case "cue":
        return bundle.url(
          forResource: asset.resourceName,
          withExtension: asset.resourceExtension
        ) != nil
      case "training":
        return bundle.url(
          forResource: asset.resourceName,
          withExtension: asset.resourceExtension
        ) != nil
      case "model":
        return plan.model.sha256 == nil || bundle.url(
          forResource: asset.resourceName,
          withExtension: asset.resourceExtension
        ) != nil
      default:
        return true
      }
    }
  }

  private func requiredModelPresent(for plan: WatchRuntimePlanV3) -> Bool {
    !plan.model.modelId.isEmpty && !plan.model.modelVersion.isEmpty
  }
}
