import Foundation

enum SyntheticHeartRatePattern: Equatable {
  case plausibleSleep
  case missing
}

struct SyntheticHeartRateProvider: HeartRateProviding {
  let startDate: Date
  let pattern: SyntheticHeartRatePattern

  func samples(from start: Date, to end: Date) -> [WatchHeartRateSample] {
    guard pattern != .missing else {
      return []
    }

    let sampleCount = max(1, Int(end.timeIntervalSince(start) / 5.0))
    return (0..<sampleCount).map { index in
      let timestamp = start.addingTimeInterval(Double(index) * 5.0)
      let elapsedEpochs = Int(timestamp.timeIntervalSince(startDate) / 30.0)
      let value = 64.0 + Double(elapsedEpochs % 5) * 1.5

      return WatchHeartRateSample(timestamp: timestamp, beatsPerMinute: value)
    }
  }
}
