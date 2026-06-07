import Foundation

struct WatchHeartRateSample: Equatable {
  let timestamp: Date
  let beatsPerMinute: Double
}

struct WatchMotionSample: Equatable {
  let timestamp: Date
  let intensity: Double
}

struct WatchBatterySnapshot: Equatable {
  let timestamp: Date
  let level: Double
}

struct WatchCueOutputResult: Equatable {
  let attempted: Bool
  let delivered: Bool
  let outputChannel: String
  let failureReason: String?
}

protocol WatchClock: AnyObject {
  var now: Date { get }
}

protocol AdjustableWatchClock: WatchClock {
  func advance(by seconds: TimeInterval)
}

protocol HeartRateProviding {
  func samples(from start: Date, to end: Date) -> [WatchHeartRateSample]
}

protocol MotionProviding {
  var isAvailable: Bool { get }
  func samples(from start: Date, to end: Date) -> [WatchMotionSample]
}

protocol BatteryProviding {
  func snapshot(at date: Date, elapsedSessionSeconds: TimeInterval) -> WatchBatterySnapshot
}

protocol PowerModeProviding {
  var isLowPowerModeEnabled: Bool { get }
}

protocol CueOutputProviding {
  func deliverCue(plan: WatchRuntimePlanV3, at date: Date) -> WatchCueOutputResult
}

protocol WatchRuntimeLogging: AnyObject {
  var events: [WatchRuntimeEventV3] { get }
  var epochRecords: [WatchEpochRecordV3] { get }
  var cueRecords: [WatchCueRecordV3] { get }
  var movementRecords: [WatchMovementRecordV3] { get }

  @discardableResult
  func appendEvent(
    _ type: WatchRuntimeEventType,
    timestamp: Date,
    monotonicOffsetSeconds: Double?,
    payload: [String: WatchRuntimeJSONValue]
  ) -> WatchRuntimeEventV3
}

protocol WatchPackageSealing {
  func seal(
    plan: WatchRuntimePlanV3,
    logStore: WatchRuntimeLogStore,
    sealReason: WatchRuntimeSealReason,
    sealedAt: Date,
    startedAt: Date,
    endedAt: Date,
    batteryStart: Double,
    batteryEnd: Double
  ) -> WatchPackageManifestV3
}
