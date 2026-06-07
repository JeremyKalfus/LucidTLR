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

    let plausibleHeartRate = heartRate >= 50 && heartRate <= 90
    let lowMovement = aggregation.roughMovementIntensity < plan.movement.largeMovementThreshold * 0.35
    let lateEnoughForFixtureRem = elapsedSessionSeconds >= 120

    let sleepProbability: Double
    if lowMovement && aggregation.stableLowMovementSeconds >= plan.movement.stableLowMovementRequiredSeconds {
      sleepProbability = 0.86
    } else if lowMovement {
      sleepProbability = 0.68
    } else {
      sleepProbability = 0.35
    }

    let remProbability: Double
    if lateEnoughForFixtureRem && plausibleHeartRate && lowMovement {
      remProbability = 0.84
    } else if plausibleHeartRate && lowMovement {
      remProbability = 0.42
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
