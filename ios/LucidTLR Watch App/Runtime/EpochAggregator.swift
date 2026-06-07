import Foundation

struct WatchEpochAggregation: Equatable {
  let heartRateSampleCount: Int
  let motionSampleCount: Int
  let heartRateSummary: Double?
  let motionSummary: Double?
  let sensorQuality: WatchSensorQuality
  let stableLowMovementSeconds: Int
  let roughMovementIntensity: Double
  let largeMovement: Bool
}

struct EpochAggregator {
  private(set) var stableLowMovementSeconds = 0

  mutating func aggregate(
    plan: WatchRuntimePlanV3,
    start: Date,
    end: Date,
    heartRateSamples: [WatchHeartRateSample],
    motionSamples: [WatchMotionSample]
  ) -> WatchEpochAggregation {
    let durationSeconds = max(1.0, end.timeIntervalSince(start))
    let expectedMotionSamples = max(1, Int((durationSeconds * plan.epoching.motionSampleHz).rounded(.down)))
    let heartRateAverage = average(heartRateSamples.map(\.beatsPerMinute))
    let motionAverage = average(motionSamples.map(\.intensity))
    let roughMovementIntensity = motionSamples.map(\.intensity).max() ?? 0
    let largeMovement = roughMovementIntensity >= plan.movement.largeMovementThreshold
    let lowMovement = !largeMovement && roughMovementIntensity < plan.movement.largeMovementThreshold * 0.5

    if lowMovement {
      stableLowMovementSeconds += Int(durationSeconds)
    } else {
      stableLowMovementSeconds = 0
    }

    let quality: WatchSensorQuality
    if heartRateSamples.isEmpty || motionSamples.isEmpty {
      quality = .missing
    } else if motionSamples.count < max(1, expectedMotionSamples / 2) || heartRateSamples.count < 2 {
      quality = .degraded
    } else {
      quality = .good
    }

    return WatchEpochAggregation(
      heartRateSampleCount: heartRateSamples.count,
      motionSampleCount: motionSamples.count,
      heartRateSummary: heartRateAverage,
      motionSummary: motionAverage,
      sensorQuality: quality,
      stableLowMovementSeconds: stableLowMovementSeconds,
      roughMovementIntensity: roughMovementIntensity,
      largeMovement: largeMovement
    )
  }

  private func average(_ values: [Double]) -> Double? {
    guard !values.isEmpty else {
      return nil
    }

    return values.reduce(0, +) / Double(values.count)
  }
}
