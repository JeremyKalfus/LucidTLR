import Foundation

struct WatchEpochFeatures {
  var epochIndex: Int
  var epochStart: Date
  var epochEnd: Date
  var elapsedSessionSeconds: Double
  var hrFeature: Double?
  var motionFeature: Double?
  var stableLowMovementSeconds: Double
  var sensorQuality: String
  var roughMovementIntensity: String
  var watchBatteryLevel: Double
}

struct WatchRemPrediction {
  var classifierVersion: String
  var modelAvailable: Bool
  var remProbability: Double?
  var remLabel: String
  var reason: String
}

struct WatchCueDecision {
  var shouldPlayCue: Bool
  var reason: String
  var cueingEnabled: Bool
  var consecutiveLikelyRemEpochs: Int
}

final class WatchRemModel {
  private struct RandomForestAsset {
    var version: String
    var classes: [String]
    var remClassIndex: Int
    var trees: [[[Any]]]
  }

  private let asset: RandomForestAsset?

  var modelAvailable: Bool {
    asset != nil
  }

  init(bundle: Bundle = .main) {
    guard let url = bundle.url(forResource: "mallela_rf_v1", withExtension: "json"),
      let data = try? Data(contentsOf: url)
    else {
      asset = nil
      return
    }

    asset = Self.parseRandomForestAsset(data)
  }

  func predict(features: WatchEpochFeatures, plan: WatchRuntimePlan) -> WatchRemPrediction {
    guard let asset else {
      return WatchRemPrediction(
        classifierVersion: plan.classifier.classifierVersion,
        modelAvailable: false,
        remProbability: nil,
        remLabel: "unknown",
        reason: "model_asset_missing"
      )
    }

    guard let hrFeature = features.hrFeature, let motionFeature = features.motionFeature else {
      return WatchRemPrediction(
        classifierVersion: plan.classifier.classifierVersion,
        modelAvailable: true,
        remProbability: nil,
        remLabel: "unknown",
        reason: "missing_model_features"
      )
    }

    guard let probability = Self.predictRemProbability(
      asset: asset,
      vector: [
        hrFeature,
        motionFeature,
        features.elapsedSessionSeconds / 3600,
      ]
    ) else {
      return WatchRemPrediction(
        classifierVersion: plan.classifier.classifierVersion,
        modelAvailable: true,
        remProbability: nil,
        remLabel: "unknown",
        reason: "model_inference_failed"
      )
    }

    return WatchRemPrediction(
      classifierVersion: plan.classifier.classifierVersion,
      modelAvailable: true,
      remProbability: probability,
      remLabel: probability >= plan.classifier.remThreshold ? "likely_rem" : "not_likely_rem",
      reason: "local_model"
    )
  }

  private static func parseRandomForestAsset(_ data: Data) -> RandomForestAsset? {
    guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let version = root["version"] as? String,
      let rawClasses = root["classes"] as? [Any],
      let rawTrees = root["trees"] as? [Any]
    else {
      return nil
    }

    let classes = rawClasses.map { String(describing: $0) }
    let remClass = root["remClass"].map { String(describing: $0) } ?? "5"
    guard let remClassIndex = classes.firstIndex(of: remClass) else {
      return nil
    }

    var trees: [[[Any]]] = []
    for rawTree in rawTrees {
      guard let tree = rawTree as? [[Any]], !tree.isEmpty else {
        return nil
      }
      trees.append(tree)
    }

    guard !trees.isEmpty else {
      return nil
    }

    return RandomForestAsset(
      version: version,
      classes: classes,
      remClassIndex: remClassIndex,
      trees: trees
    )
  }

  private static func predictRemProbability(
    asset: RandomForestAsset,
    vector: [Double]
  ) -> Double? {
    var totals = Array(repeating: 0.0, count: asset.classes.count)

    for tree in asset.trees {
      guard let leaf = evaluateTree(tree, vector: vector),
        leaf.count == asset.classes.count
      else {
        return nil
      }

      for (index, probability) in leaf.enumerated() {
        totals[index] += probability
      }
    }

    return totals[asset.remClassIndex] / Double(asset.trees.count)
  }

  private static func evaluateTree(_ tree: [[Any]], vector: [Double]) -> [Double]? {
    var nodeIndex = 0

    for _ in 0..<10_000 {
      guard tree.indices.contains(nodeIndex) else {
        return nil
      }

      let node = tree[nodeIndex]
      guard node.count >= 5,
        let left = intValue(node[0]),
        let right = intValue(node[1]),
        let featureIndex = intValue(node[2]),
        let threshold = doubleValue(node[3])
      else {
        return nil
      }

      if left == -1 && right == -1 {
        guard let rawProbabilities = node[4] as? [Any] else {
          return nil
        }

        return rawProbabilities.compactMap(doubleValue)
      }

      guard vector.indices.contains(featureIndex) else {
        return nil
      }

      nodeIndex = vector[featureIndex] <= threshold ? left : right
    }

    return nil
  }

  private static func doubleValue(_ value: Any) -> Double? {
    if let value = value as? Double {
      return value
    }
    if let value = value as? Int {
      return Double(value)
    }
    if let value = value as? NSNumber {
      return value.doubleValue
    }
    return nil
  }

  private static func intValue(_ value: Any) -> Int? {
    if let value = value as? Int {
      return value
    }
    if let value = value as? Double {
      return Int(value)
    }
    if let value = value as? NSNumber {
      return value.intValue
    }
    return nil
  }
}

final class WatchCuePolicy {
  func decide(
    now: Date,
    plan: WatchRuntimePlan,
    features: WatchEpochFeatures,
    prediction: WatchRemPrediction,
    consecutiveLikelyRemEpochs: Int,
    cueCountTonight: Int,
    lastCueAt: Date?,
    formatter: ISO8601DateFormatter
  ) -> WatchCueDecision {
    if isLowBattery(features.watchBatteryLevel, plan: plan) {
      return WatchCueDecision(
        shouldPlayCue: false,
        reason: "low_battery",
        cueingEnabled: false,
        consecutiveLikelyRemEpochs: consecutiveLikelyRemEpochs
      )
    }

    if plan.cueMode == "none" {
      return WatchCueDecision(
        shouldPlayCue: false,
        reason: "cueing_disabled_sleep_log",
        cueingEnabled: false,
        consecutiveLikelyRemEpochs: consecutiveLikelyRemEpochs
      )
    }

    if let cueWindowStart = plan.cueWindowStartDate(formatter: formatter), now < cueWindowStart {
      return WatchCueDecision(
        shouldPlayCue: false,
        reason: "cue_window_pending",
        cueingEnabled: false,
        consecutiveLikelyRemEpochs: consecutiveLikelyRemEpochs
      )
    }

    guard prediction.modelAvailable else {
      return WatchCueDecision(
        shouldPlayCue: false,
        reason: prediction.reason,
        cueingEnabled: false,
        consecutiveLikelyRemEpochs: 0
      )
    }

    guard prediction.remLabel == "likely_rem" else {
      return WatchCueDecision(
        shouldPlayCue: false,
        reason: prediction.reason,
        cueingEnabled: true,
        consecutiveLikelyRemEpochs: 0
      )
    }

    let nextConsecutive = consecutiveLikelyRemEpochs + 1
    if nextConsecutive >= plan.classifier.suppressAfterConsecutiveLikelyRemEpochs {
      return WatchCueDecision(
        shouldPlayCue: false,
        reason: "persistent_rem_suppression",
        cueingEnabled: true,
        consecutiveLikelyRemEpochs: nextConsecutive
      )
    }

    if features.sensorQuality == "missing" {
      return WatchCueDecision(
        shouldPlayCue: false,
        reason: "sensor_quality_missing",
        cueingEnabled: true,
        consecutiveLikelyRemEpochs: nextConsecutive
      )
    }

    if features.roughMovementIntensity == "large" || features.roughMovementIntensity == "moderate" {
      return WatchCueDecision(
        shouldPlayCue: false,
        reason: "movement_pause",
        cueingEnabled: true,
        consecutiveLikelyRemEpochs: nextConsecutive
      )
    }

    if features.stableLowMovementSeconds < plan.cuePolicy.stableLowMovementRequiredSeconds {
      return WatchCueDecision(
        shouldPlayCue: false,
        reason: "waiting_for_stable_low_movement",
        cueingEnabled: true,
        consecutiveLikelyRemEpochs: nextConsecutive
      )
    }

    if let lastCueAt,
      now.timeIntervalSince(lastCueAt) < plan.cuePolicy.minimumSecondsSinceLastCue
    {
      return WatchCueDecision(
        shouldPlayCue: false,
        reason: "minimum_seconds_since_last_cue",
        cueingEnabled: true,
        consecutiveLikelyRemEpochs: nextConsecutive
      )
    }

    if cueCountTonight >= plan.cuePolicy.maxCuesTonight {
      return WatchCueDecision(
        shouldPlayCue: false,
        reason: "cue_budget_exhausted",
        cueingEnabled: true,
        consecutiveLikelyRemEpochs: nextConsecutive
      )
    }

    return WatchCueDecision(
      shouldPlayCue: true,
      reason: "likely_rem",
      cueingEnabled: true,
      consecutiveLikelyRemEpochs: nextConsecutive
    )
  }

  private func isLowBattery(_ level: Double, plan: WatchRuntimePlan) -> Bool {
    guard level >= 0 else {
      return false
    }

    return level * 100 < plan.batteryPolicy.disableCueingBelowPct
  }
}
