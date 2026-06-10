import Foundation

struct WatchCuePolicyDecision: Equatable {
  let shouldAttemptCue: Bool
  let reason: WatchCueDecisionReason
  let outputChannel: String
}

struct CuePolicyEngine {
  private var remWindow: [Bool] = []
  private(set) var lastUserInteractionAt: Date?
  private(set) var lastCueAttemptAt: Date?
  private(set) var cuesAttempted = 0
  private(set) var cuesDelivered = 0
  private(set) var cueFailures = 0

  mutating func noteUserInteraction(at date: Date) {
    lastUserInteractionAt = date
  }

  mutating func noteCueAttempt(at date: Date, delivered: Bool) {
    cuesAttempted += 1
    lastCueAttemptAt = date

    if delivered {
      cuesDelivered += 1
    } else {
      cueFailures += 1
    }
  }

  mutating func evaluate(
    plan: WatchRuntimePlanV3,
    runtimeState: WatchRuntimeState,
    epochStart: Date,
    aggregation: WatchEpochAggregation,
    remEvaluation: WatchRemEvaluation,
    movementPauseActive: Bool,
    cueAssociatedMovementPauseActive: Bool,
    forcedCueDue: Bool = false
  ) -> WatchCuePolicyDecision {
    if plan.sessionType == "sleep_log" {
      return decision(false, .sleepLogCueingDisabled, outputChannel: "none")
    }

    if runtimeState != .tlrActive {
      return decision(false, .beforeTlrInterval, outputChannel: "none")
    }

    if forcedCueDue && aggregation.motionSampleCount == 0 {
      return decision(false, .sensorQualityNotGood, outputChannel: "none")
    }

    if !forcedCueDue && aggregation.sensorQuality.rawValue != plan.remPolicy.sensorQualityRequired {
      return decision(false, .sensorQualityNotGood, outputChannel: "none")
    }

    if aggregation.largeMovement || movementPauseActive {
      return decision(false, .movementGateActive, outputChannel: "none")
    }

    if cueAssociatedMovementPauseActive {
      return decision(false, .cueAssociatedMovementPauseActive, outputChannel: "none")
    }

    if let lastUserInteractionAt,
      epochStart.timeIntervalSince(lastUserInteractionAt) <
      TimeInterval(plan.movement.userInteractionSuppressionSeconds) {
      return decision(false, .recentUserInteraction, outputChannel: "none")
    }

    if let lastCueAttemptAt,
      epochStart.timeIntervalSince(lastCueAttemptAt) <
      TimeInterval(plan.budget.minimumSecondsSinceLastCue) {
      return decision(false, .cueRefractoryActive, outputChannel: "none")
    }

    if cuesAttempted >= plan.budget.maxCuesTonight {
      return decision(false, .cueBudgetExhausted, outputChannel: "none")
    }

    if forcedCueDue {
      return decision(true, .forcedCueDue, outputChannel: outputChannel(for: plan))
    }

    let remPassed =
      (remEvaluation.remProbability ?? 0) >= plan.remPolicy.threshold &&
      (remEvaluation.sleepProbability ?? 0) >= plan.remPolicy.minimumSleepProbability
    remWindow.append(remPassed)
    remWindow = Array(remWindow.suffix(3))

    guard persistencePasses(rule: plan.remPolicy.persistenceRule) else {
      return decision(false, .remPersistenceNotMet, outputChannel: "none")
    }

    return decision(true, .remPersistencePassed, outputChannel: outputChannel(for: plan))
  }

  private func persistencePasses(rule: String) -> Bool {
    switch rule {
    case "2_of_last_3":
      return remWindow.count >= 3 && remWindow.filter { $0 }.count >= 2
    default:
      return false
    }
  }

  private func decision(
    _ shouldAttemptCue: Bool,
    _ reason: WatchCueDecisionReason,
    outputChannel: String
  ) -> WatchCuePolicyDecision {
    WatchCuePolicyDecision(
      shouldAttemptCue: shouldAttemptCue,
      reason: reason,
      outputChannel: outputChannel
    )
  }

  private func outputChannel(for plan: WatchRuntimePlanV3) -> String {
    if plan.cueOutput.hapticEnabled && plan.cueOutput.defaultOutput == "haptic" {
      return "haptic"
    }

    if plan.cueOutput.audioEnabled && plan.cueOutput.defaultOutput == "audio" {
      return "audio"
    }

    if plan.cueOutput.hapticEnabled {
      return "haptic"
    }

    if plan.cueOutput.audioEnabled {
      return "audio"
    }

    return "none"
  }
}
