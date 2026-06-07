import Foundation

struct WatchRuntimeStartGateError: Error, Equatable {
  let result: WatchRuntimePreflightResult
}

enum WatchRuntimeStartGate {
  static func evaluate(
    plan: WatchRuntimePlanV3,
    provider: WatchRuntimePreflightProviding,
    at date: Date
  ) -> WatchRuntimePreflightResult {
    WatchRuntimePreflight.evaluate(
      plan: plan,
      capabilities: provider.capabilities(for: plan, at: date),
      evaluatedAt: date
    )
  }

  @discardableResult
  static func requirePassingPreflight(
    plan: WatchRuntimePlanV3,
    provider: WatchRuntimePreflightProviding,
    at date: Date
  ) throws -> WatchRuntimePreflightResult {
    let result = evaluate(plan: plan, provider: provider, at: date)
    guard result.canStart else {
      throw WatchRuntimeStartGateError(result: result)
    }
    return result
  }
}

struct WatchRuntimeProviderBackedPreflightProvider: WatchRuntimePreflightProviding {
  let batteryProvider: BatteryProviding
  let powerModeProvider: PowerModeProviding
  let motionProvider: MotionProviding
  let cueOutputProvider: CueOutputProviding
  let planCommitted: Bool
  let storageAvailable: Bool

  func capabilities(
    for plan: WatchRuntimePlanV3,
    at date: Date
  ) -> WatchRuntimeCapabilities {
    let battery = batteryProvider.snapshot(at: date, elapsedSessionSeconds: 0)
    let cueCapabilities = (cueOutputProvider as? CueOutputCapabilityProviding)?
      .cueOutputCapabilities(for: plan) ?? defaultCueCapabilities(for: plan)

    return WatchRuntimeCapabilities(
      batteryLevel: battery.level,
      lowPowerModeEnabled: powerModeProvider.isLowPowerModeEnabled,
      healthKitAuthorization: .authorized,
      workoutRuntimeAvailable: true,
      motionAvailable: motionProvider.isAvailable,
      hapticOutputAvailable: cueCapabilities.hapticOutputAvailable,
      audioOutputAvailable: cueCapabilities.audioOutputAvailable,
      audioPreflightRequired: cueCapabilities.audioPreflightRequired,
      audioPreflightPassed: cueCapabilities.audioPreflightPassed,
      hapticPreflightRequired: cueCapabilities.hapticPreflightRequired,
      hapticPreflightPassed: cueCapabilities.hapticPreflightPassed,
      requiredAssetsPresent: !plan.assets.isEmpty,
      requiredModelPresent: !plan.model.modelId.isEmpty && !plan.model.modelVersion.isEmpty,
      planCommitted: planCommitted,
      storageAvailable: storageAvailable
    )
  }

  private func defaultCueCapabilities(for plan: WatchRuntimePlanV3) -> WatchCueOutputCapabilities {
    WatchCueOutputCapabilities(
      hapticOutputAvailable: plan.cueOutput.hapticEnabled,
      audioOutputAvailable: false,
      hapticPreflightRequired: plan.cueOutput.hapticEnabled,
      hapticPreflightPassed: plan.cueOutput.hapticEnabled,
      audioPreflightRequired: plan.cueOutput.audioEnabled && plan.cueOutput.audioRequiresPreflight,
      audioPreflightPassed: !plan.cueOutput.audioEnabled
    )
  }
}
