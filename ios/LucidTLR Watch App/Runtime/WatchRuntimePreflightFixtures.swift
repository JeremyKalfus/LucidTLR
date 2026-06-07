import Foundation

enum WatchRuntimePreflightFixtures {
  static func allPass(plan: WatchRuntimePlanV3) -> WatchRuntimePreflightResult {
    result(for: .allPass, plan: plan)
  }

  static func lowBattery(plan: WatchRuntimePlanV3) -> WatchRuntimePreflightResult {
    result(for: .lowBattery, plan: plan)
  }

  static func lowPowerModeOn(plan: WatchRuntimePlanV3) -> WatchRuntimePreflightResult {
    result(for: .lowPowerModeOn, plan: plan)
  }

  static func missingHealthAuthorization(plan: WatchRuntimePlanV3) -> WatchRuntimePreflightResult {
    result(for: .missingHealthAuthorization, plan: plan)
  }

  static func missingWorkoutRuntime(plan: WatchRuntimePlanV3) -> WatchRuntimePreflightResult {
    result(for: .missingWorkoutRuntime, plan: plan)
  }

  static func missingMotion(plan: WatchRuntimePlanV3) -> WatchRuntimePreflightResult {
    result(for: .missingMotion, plan: plan)
  }

  static func missingCueOutput(plan: WatchRuntimePlanV3) -> WatchRuntimePreflightResult {
    result(for: .missingCueOutput, plan: plan)
  }

  static func missingHapticPreflight(plan: WatchRuntimePlanV3) -> WatchRuntimePreflightResult {
    result(for: .missingHapticPreflight, plan: plan)
  }

  static func missingAudioPreflight(plan: WatchRuntimePlanV3) -> WatchRuntimePreflightResult {
    result(for: .missingAudioPreflight, plan: audioEnabledPlan(from: plan))
  }

  static func missingAsset(plan: WatchRuntimePlanV3) -> WatchRuntimePreflightResult {
    result(for: .missingAsset, plan: plan)
  }

  static func missingModel(plan: WatchRuntimePlanV3) -> WatchRuntimePreflightResult {
    result(for: .missingModel, plan: plan)
  }

  static func noPlanCommit(plan: WatchRuntimePlanV3) -> WatchRuntimePreflightResult {
    result(for: .noPlanCommit, plan: plan)
  }

  static func result(
    for scenario: SyntheticPreflightScenario,
    plan: WatchRuntimePlanV3,
    evaluatedAt: Date = WatchSyntheticRuntimeFixtures.fixtureStartDateForStorage()
  ) -> WatchRuntimePreflightResult {
    let provider = SyntheticPreflightProvider(scenario: scenario)
    return WatchRuntimeStartGate.evaluate(
      plan: scenario == .missingAudioPreflight ? audioEnabledPlan(from: plan) : plan,
      provider: provider,
      at: evaluatedAt
    )
  }

  static func audioEnabledPlan(from plan: WatchRuntimePlanV3) -> WatchRuntimePlanV3 {
    WatchRuntimePlanV3(
      schemaVersion: plan.schemaVersion,
      sessionId: plan.sessionId,
      participantId: plan.participantId,
      sessionType: plan.sessionType,
      mode: plan.mode,
      createdAt: plan.createdAt,
      protocolVersion: plan.protocolVersion,
      watchPolicyVersion: plan.watchPolicyVersion,
      remModelVersion: plan.remModelVersion,
      planHash: plan.planHash,
      selectedCueId: plan.selectedCueId,
      cue: plan.cue,
      cueOutput: WatchRuntimeCueOutputV3(
        hapticEnabled: plan.cueOutput.hapticEnabled,
        audioEnabled: true,
        audioRequiresPreflight: true,
        preflightRequired: true,
        defaultOutput: "haptic"
      ),
      training: plan.training,
      tlrInterval: plan.tlrInterval,
      epoching: plan.epoching,
      remPolicy: plan.remPolicy,
      movement: plan.movement,
      budget: plan.budget,
      safety: plan.safety,
      assets: plan.assets,
      model: plan.model,
      privacy: plan.privacy
    )
  }
}
