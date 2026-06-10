import CoreMotion
import Foundation

enum CoreMotionProviderError: Error, Equatable {
  case accelerometerUnavailable
}

final class CoreMotionProvider: MotionProviding, MotionCapabilityProviding {
  private let motionManager = CMMotionManager()
  private let operationQueue = OperationQueue()
  private let stateQueue = DispatchQueue(label: "com.lucidtlr.watch.coreMotionProvider")
  private var bufferedSamples: [WatchMotionSample] = []
  private var previousAcceleration: CMAcceleration?
  private var latestSampleAt: Date?
  private var latestIntensityValue: Double = 0

  init() {
    operationQueue.name = "LucidTLR Watch CoreMotion"
    operationQueue.qualityOfService = .utility
  }

  var isAvailable: Bool {
    motionManager.isAccelerometerAvailable
  }

  var motionAvailable: Bool {
    isAvailable
  }

  var latestIntensity: Double {
    stateQueue.sync { latestIntensityValue }
  }

  func lastSampleFreshnessSeconds(at date: Date) -> TimeInterval? {
    stateQueue.sync {
      latestSampleAt.map { max(0, date.timeIntervalSince($0)) }
    }
  }

  func start(sampleHz: Double) throws {
    guard motionManager.isAccelerometerAvailable else {
      throw CoreMotionProviderError.accelerometerUnavailable
    }

    motionManager.accelerometerUpdateInterval = 1.0 / max(sampleHz, 0.2)
    motionManager.startAccelerometerUpdates(to: operationQueue) { [weak self] data, _ in
      guard let self, let data else {
        return
      }

      let acceleration = data.acceleration
      let timestamp = Date()

      stateQueue.async {
        let intensity: Double
        if let previous = self.previousAcceleration {
          let dx = acceleration.x - previous.x
          let dy = acceleration.y - previous.y
          let dz = acceleration.z - previous.z
          intensity = sqrt(dx * dx + dy * dy + dz * dz)
        } else {
          intensity = 0
        }

        self.previousAcceleration = acceleration
        self.latestSampleAt = timestamp
        self.latestIntensityValue = intensity
        self.bufferedSamples.append(
          WatchMotionSample(timestamp: timestamp, intensity: intensity)
        )
        self.pruneSamples(before: timestamp.addingTimeInterval(-12 * 60 * 60))
      }
    }
  }

  func stop() {
    motionManager.stopAccelerometerUpdates()
  }

  func samples(from start: Date, to end: Date) -> [WatchMotionSample] {
    stateQueue.sync {
      bufferedSamples.filter { $0.timestamp >= start && $0.timestamp < end }
    }
  }

  private func pruneSamples(before cutoff: Date) {
    bufferedSamples.removeAll { $0.timestamp < cutoff }
  }
}
