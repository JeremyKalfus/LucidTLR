import Foundation

enum SyntheticMotionPattern: Equatable {
  case lowMovement
  case missing
  case spikeEpochs(Set<Int>)
}

struct SyntheticMotionProvider: MotionProviding {
  let startDate: Date
  let sampleHz: Double
  let pattern: SyntheticMotionPattern

  var isAvailable: Bool {
    pattern != .missing
  }

  func samples(from start: Date, to end: Date) -> [WatchMotionSample] {
    guard pattern != .missing else {
      return []
    }

    let sampleCount = max(1, Int(end.timeIntervalSince(start) * sampleHz))
    let epochIndex = Int(start.timeIntervalSince(startDate) / 30.0) + 1
    let spike: Bool

    switch pattern {
    case .spikeEpochs(let spikeEpochs):
      spike = spikeEpochs.contains(epochIndex)
    case .lowMovement:
      spike = false
    case .missing:
      spike = false
    }

    return (0..<sampleCount).map { index in
      let timestamp = start.addingTimeInterval(Double(index) / max(sampleHz, 1))
      let base = spike ? 1.15 : 0.07
      let variation = Double(index % 3) * 0.01

      return WatchMotionSample(timestamp: timestamp, intensity: base + variation)
    }
  }
}
