import Foundation

struct SyntheticCueOutputProvider: CueOutputProviding, CueOutputCapabilityProviding {
  let shouldDeliver: Bool

  func cueOutputCapabilities(for plan: WatchRuntimePlanV3) -> WatchCueOutputCapabilities {
    WatchCueOutputCapabilities(
      hapticOutputAvailable: plan.cueOutput.hapticEnabled && shouldDeliver,
      audioOutputAvailable: plan.cueOutput.audioEnabled && shouldDeliver,
      hapticPreflightRequired: plan.cueOutput.hapticEnabled,
      hapticPreflightPassed: plan.cueOutput.hapticEnabled && shouldDeliver,
      audioPreflightRequired: plan.cueOutput.audioEnabled && plan.cueOutput.audioRequiresPreflight,
      audioPreflightPassed: plan.cueOutput.audioEnabled && shouldDeliver
    )
  }

  func deliverCue(plan: WatchRuntimePlanV3, at date: Date) -> WatchCueOutputResult {
    guard plan.cueOutput.hapticEnabled || plan.cueOutput.audioEnabled else {
      return WatchCueOutputResult(
        attempted: false,
        delivered: false,
        outputChannel: "none",
        failureReason: "cue_output_disabled"
      )
    }

    guard shouldDeliver else {
      return WatchCueOutputResult(
        attempted: true,
        delivered: false,
        outputChannel: "haptic",
        failureReason: "synthetic_delivery_failure"
      )
    }

    return WatchCueOutputResult(
      attempted: true,
      delivered: true,
      outputChannel: "haptic",
      failureReason: nil
    )
  }
}
