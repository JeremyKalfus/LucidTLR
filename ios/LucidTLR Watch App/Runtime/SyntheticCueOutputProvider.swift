import Foundation

struct SyntheticCueOutputProvider: CueOutputProviding {
  let shouldDeliver: Bool

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
