import Foundation

struct WatchRemEvaluation: Equatable {
  let remProbability: Double?
  let sleepProbability: Double?
  let remLabel: WatchRemLabel
  let classifierVersion: String
  let modelVersion: String
}

struct RemProbabilityEvaluator {
  func evaluate(
    plan: WatchRuntimePlanV3,
    elapsedSessionSeconds: Int,
    aggregation: WatchEpochAggregation
  ) -> WatchRemEvaluation {
    guard aggregation.sensorQuality == .good,
      let heartRate = aggregation.heartRateSummary else {
      return WatchRemEvaluation(
        remProbability: nil,
        sleepProbability: nil,
        remLabel: .unknown,
        classifierVersion: plan.remPolicy.classifierVersion,
        modelVersion: plan.model.modelVersion
      )
    }

    let plausibleHeartRate = heartRate >= 45 && heartRate <= 110
    let lowMovement = aggregation.roughMovementIntensity < plan.movement.largeMovementThreshold * 0.35
    let stableLowMovement = aggregation.stableLowMovementSeconds >= plan.movement.stableLowMovementRequiredSeconds
    let lateEnoughForFixtureRem = elapsedSessionSeconds >= 120

    let sleepProbability: Double
    if lowMovement && stableLowMovement {
      sleepProbability = 0.86
    } else if lowMovement {
      sleepProbability = 0.68
    } else {
      sleepProbability = 0.35
    }

    let remProbability: Double
    if plausibleHeartRate && lowMovement {
      let stabilityBonus = stableLowMovement ? 0.24 : 0.08
      let elapsedBonus = lateEnoughForFixtureRem ? 0.24 : 0.04
      remProbability = min(0.86, 0.28 + stabilityBonus + elapsedBonus)
    } else {
      remProbability = 0.18
    }

    let label: WatchRemLabel =
      remProbability >= plan.remPolicy.threshold &&
      sleepProbability >= plan.remPolicy.minimumSleepProbability
      ? .likelyRem
      : .unlikelyRem

    return WatchRemEvaluation(
      remProbability: remProbability,
      sleepProbability: sleepProbability,
      remLabel: label,
      classifierVersion: plan.remPolicy.classifierVersion,
      modelVersion: plan.model.modelVersion
    )
  }
}
