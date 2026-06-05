import Foundation

struct WatchRuntimePlan: Codable, Equatable {
  // Legacy-compatible local cue asset fields. Older phone-owned Watch plans
  // called this payload iPhoneAudio; Watch-owned v2 reads cueAssetManifest and
  // uses these values only for bundled Watch-local cue delivery.
  struct IPhoneAudio: Codable, Equatable {
    var cueId: String
    var cueResourceName: String
    var cueResourceExtension: String
    var cueDurationSeconds: Double
    var startVolume: Double
  }

  struct Classifier: Codable, Equatable {
    var classifierVersion: String
    var remThreshold: Double
    var suppressAfterConsecutiveLikelyRemEpochs: Int
  }

  struct CuePolicy: Codable, Equatable {
    var minimumSecondsSinceLastCue: Double
    var stableLowMovementRequiredSeconds: Double
    var cueAssociatedMovementPauseSeconds: Double
    var maxCuesTonight: Int
  }

  struct Training: Codable, Equatable {
    struct CueScheduleEntry: Codable, Equatable {
      var markerIndex: Int
      var markerMidpointSec: Double
      var cueStartSec: Double
    }

    var enabled: Bool
    var skipped: Bool
    var trainingAssetId: String
    var resourceName: String
    var resourceExtension: String
    var durationSec: Double
    var expectedStartedAt: String?
    var expectedCompletedAt: String?
    var cueSchedule: [CueScheduleEntry]
  }

  struct TlrInterval: Codable, Equatable {
    var enabled: Bool
    var startsAt: String
    var earliestCueAt: String
    var stopAt: String
    var derivedFrom: String
    var cueDelayAfterTrainingSec: Double?
  }

  struct Safety: Codable, Equatable {
    var stopAt: String?
    var cueWindowStartAt: String?
    var requireWatchBatteryAbovePercentAtStart: Double?
  }

  struct BatteryPolicy: Codable, Equatable {
    var recommendedStartBatteryPct: Double
    var allowStartBelowPct: Double
    var requireOverrideBelowPct: Double
    var disableCueingBelowPct: Double
    var stopRuntimeBelowPct: Double
    var hardStopBelowPct: Double
  }

  var sessionId: String
  var protocolVersion: String
  var nativePolicyVersion: String
  var mode: String
  var cueMode: String
  var receivedAt: String
  var iPhoneAudio: IPhoneAudio
  var classifier: Classifier
  var cuePolicy: CuePolicy
  var training: Training
  var tlrInterval: TlrInterval
  var safety: Safety
  var batteryPolicy: BatteryPolicy

  static func fromDictionary(
    _ rawPlan: [String: Any],
    fallbackSessionId: String,
    receivedAt: Date,
    formatter: ISO8601DateFormatter
  ) throws -> WatchRuntimePlan {
    let audio = rawPlan.dictionaryValue("iPhoneAudio")
      ?? rawPlan.dictionaryValue("cue")
      ?? [:]
    let cueAsset = rawPlan.dictionaryValue("cueAssetManifest") ?? [:]
    let cueResourceParts = splitResourceFileName(cueAsset.stringValue("fileName"))
    let classifier = rawPlan.dictionaryValue("classifier") ?? [:]
    let model = rawPlan.dictionaryValue("remModelManifest") ?? [:]
    let policy = rawPlan.dictionaryValue("cuePolicy")
      ?? rawPlan.dictionaryValue("pauses")
      ?? [:]
    let movementGate = rawPlan.dictionaryValue("movementGateConfig") ?? [:]
    let training = rawPlan.dictionaryValue("training") ?? [:]
    let tlrInterval = rawPlan.dictionaryValue("tlrInterval") ?? [:]
    let safety = rawPlan.dictionaryValue("safety") ?? [:]
    let timing = rawPlan.dictionaryValue("timing") ?? [:]
    let batteryPolicy = rawPlan.dictionaryValue("batteryPolicy") ?? [:]
    let trainingSchedule = (training["cueSchedule"] as? [[String: Any]] ?? []).map { entry in
      Training.CueScheduleEntry(
        markerIndex: entry.intValue("markerIndex") ?? 0,
        markerMidpointSec: entry.doubleValue("markerMidpointSec")
          ?? entry.doubleValue("markerMidpointSeconds")
          ?? 0,
        cueStartSec: entry.doubleValue("cueStartSec")
          ?? entry.doubleValue("cueStartSeconds")
          ?? 0
      )
    }

    let sessionId = rawPlan.stringValue("sessionId") ?? fallbackSessionId
    guard !sessionId.isEmpty else {
      throw WatchRuntimePlanError.missingSessionId
    }

    let mode = rawPlan.stringValue("mode") ?? "watch"
    guard mode == "watch" else {
      throw WatchRuntimePlanError.unsupportedMode(mode)
    }

    return WatchRuntimePlan(
      sessionId: sessionId,
      protocolVersion: rawPlan.stringValue("protocol")
        ?? rawPlan.stringValue("protocolVersion")
        ?? "watch-v2-local",
      nativePolicyVersion: rawPlan.stringValue("nativePolicyVersion") ?? "watchos-local-runtime-v2",
      mode: mode,
      cueMode: rawPlan.stringValue("cueMode") ?? "audio_haptic",
      receivedAt: formatter.string(from: receivedAt),
      iPhoneAudio: IPhoneAudio(
        cueId: cueAsset.stringValue("cueAssetId") ?? audio.stringValue("cueId") ?? "default",
        cueResourceName: cueResourceParts.name
          ?? audio.stringValue("cueResourceName")
          ?? audio.stringValue("resourceName")
          ?? "",
        cueResourceExtension: cueResourceParts.extension
          ?? audio.stringValue("cueResourceExtension")
          ?? audio.stringValue("resourceExtension")
          ?? "mp3",
        cueDurationSeconds: cueAsset.doubleValue("durationMs").map { $0 / 1000 }
          ?? audio.doubleValue("cueDurationSeconds")
          ?? audio.doubleValue("durationSeconds")
          ?? 3,
        startVolume: cueAsset.doubleValue("volumeHint") ?? audio.doubleValue("startVolume") ?? 0.2
      ),
      classifier: Classifier(
        classifierVersion: model.stringValue("version")
          ?? classifier.stringValue("classifierVersion")
          ?? "lucidcue-watch-rem-v1",
        remThreshold: model.doubleValue("threshold") ?? classifier.doubleValue("remThreshold") ?? 0.24,
        suppressAfterConsecutiveLikelyRemEpochs: rawPlan.intValue("suppressCueFromConsecutiveLikelyRemEpoch")
          ?? classifier.intValue("suppressAfterConsecutiveLikelyRemEpochs")
          ?? 5
      ),
      cuePolicy: CuePolicy(
        minimumSecondsSinceLastCue: rawPlan.doubleValue("minInterCueIntervalSec")
          ?? policy.doubleValue("minimumSecondsSinceLastCue")
          ?? 30,
        stableLowMovementRequiredSeconds: movementGate.doubleValue("stableLowMovementRequiredSeconds")
          ?? policy.doubleValue("stableLowMovementRequiredSeconds")
          ?? 30,
        cueAssociatedMovementPauseSeconds: movementGate.doubleValue("cueAssociatedMovementPauseSeconds")
          ?? policy.doubleValue("cueAssociatedMovementPauseSeconds")
          ?? 120,
        maxCuesTonight: rawPlan.intValue("cueBudget") ?? policy.intValue("maxCuesTonight") ?? 24
      ),
      training: Training(
        enabled: training.boolValue("enabled") ?? false,
        skipped: training.boolValue("skipped") ?? true,
        trainingAssetId: training.stringValue("trainingAssetId") ?? "",
        resourceName: training.stringValue("resourceName") ?? "",
        resourceExtension: training.stringValue("resourceExtension") ?? "mp3",
        durationSec: training.doubleValue("durationSec") ?? 0,
        expectedStartedAt: training.stringValue("expectedStartedAt"),
        expectedCompletedAt: training.stringValue("expectedCompletedAt"),
        cueSchedule: trainingSchedule
      ),
      tlrInterval: TlrInterval(
        enabled: tlrInterval.boolValue("enabled") ?? rawPlan.boolValue("tlrEnabled") ?? true,
        startsAt: tlrInterval.stringValue("startsAt") ?? rawPlan.stringValue("validAfter") ?? "",
        earliestCueAt: tlrInterval.stringValue("earliestCueAt")
          ?? rawPlan.stringValue("earliestCueAt")
          ?? "",
        stopAt: tlrInterval.stringValue("stopAt") ?? rawPlan.stringValue("stopAt") ?? "",
        derivedFrom: tlrInterval.stringValue("derivedFrom") ?? "session_start",
        cueDelayAfterTrainingSec: tlrInterval.doubleValue("cueDelayAfterTrainingSec")
      ),
      safety: Safety(
        stopAt: rawPlan.stringValue("stopAt") ?? safety.stringValue("stopAt"),
        cueWindowStartAt: rawPlan.stringValue("earliestCueAt")
          ?? tlrInterval.stringValue("earliestCueAt")
          ?? safety.stringValue("cueWindowStartAt")
          ?? timing.stringValue("earliestCueAt"),
        requireWatchBatteryAbovePercentAtStart: batteryPolicy.doubleValue("requireOverrideBelowPct")
          ?? safety.doubleValue("requireWatchBatteryAbovePercentAtStart")
      ),
      batteryPolicy: BatteryPolicy(
        recommendedStartBatteryPct: batteryPolicy.doubleValue("recommendedStartBatteryPct") ?? 90,
        allowStartBelowPct: batteryPolicy.doubleValue("allowStartBelowPct") ?? 70,
        requireOverrideBelowPct: batteryPolicy.doubleValue("requireOverrideBelowPct") ?? 60,
        disableCueingBelowPct: batteryPolicy.doubleValue("disableCueingBelowPct") ?? 25,
        stopRuntimeBelowPct: batteryPolicy.doubleValue("stopRuntimeBelowPct") ?? 20,
        hardStopBelowPct: batteryPolicy.doubleValue("hardStopBelowPct") ?? 12
      )
    )
  }

  func stopAtDate(formatter: ISO8601DateFormatter) -> Date? {
    safety.stopAt.flatMap(formatter.date)
  }

  func cueWindowStartDate(formatter: ISO8601DateFormatter) -> Date? {
    safety.cueWindowStartAt.flatMap(formatter.date)
  }

  func trainingExpectedCompletedDate(formatter: ISO8601DateFormatter) -> Date? {
    training.expectedCompletedAt.flatMap(formatter.date)
  }

  private static func splitResourceFileName(_ fileName: String?) -> (name: String?, extension: String?) {
    guard let fileName, !fileName.isEmpty else {
      return (nil, nil)
    }

    let url = URL(fileURLWithPath: fileName)
    let resourceName = url.deletingPathExtension().lastPathComponent
    let resourceExtension = url.pathExtension

    return (
      resourceName.isEmpty ? nil : resourceName,
      resourceExtension.isEmpty ? nil : resourceExtension
    )
  }
}

enum WatchRuntimePlanError: Error {
  case missingSessionId
  case unsupportedMode(String)
}

final class WatchRuntimePlanStore {
  private let fileManager: FileManager
  private let planURL: URL

  init(fileManager: FileManager = .default) {
    self.fileManager = fileManager
    let directory = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("LucidCueWatchRuntime", isDirectory: true)
    planURL = directory.appendingPathComponent("watch-runtime-plan-v2.json")
  }

  func load() -> WatchRuntimePlan? {
    guard let data = try? Data(contentsOf: planURL) else {
      return nil
    }

    return try? JSONDecoder().decode(WatchRuntimePlan.self, from: data)
  }

  func save(_ plan: WatchRuntimePlan) throws {
    try fileManager.createDirectory(
      at: planURL.deletingLastPathComponent(),
      withIntermediateDirectories: true
    )
    let data = try JSONEncoder().encode(plan)
    try data.write(to: planURL, options: .atomic)
  }
}

private extension Dictionary where Key == String, Value == Any {
  func dictionaryValue(_ key: String) -> [String: Any]? {
    self[key] as? [String: Any]
  }

  func stringValue(_ key: String) -> String? {
    guard let value = self[key] as? String, !value.isEmpty else {
      return nil
    }

    return value
  }

  func doubleValue(_ key: String) -> Double? {
    if let value = self[key] as? Double {
      return value
    }

    if let value = self[key] as? Int {
      return Double(value)
    }

    if let value = self[key] as? NSNumber {
      return value.doubleValue
    }

    return nil
  }

  func boolValue(_ key: String) -> Bool? {
    if let value = self[key] as? Bool {
      return value
    }

    if let value = self[key] as? NSNumber {
      return value.boolValue
    }

    return nil
  }

  func intValue(_ key: String) -> Int? {
    if let value = self[key] as? Int {
      return value
    }

    if let value = self[key] as? Double {
      return Int(value)
    }

    if let value = self[key] as? NSNumber {
      return value.intValue
    }

    return nil
  }
}
