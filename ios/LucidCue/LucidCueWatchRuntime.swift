import Foundation
import React
import WatchConnectivity

@objc(LucidCueWatchRuntime)
class LucidCueWatchRuntime: NSObject, WCSessionDelegate {
  private let queue = DispatchQueue(label: "com.lucidcue.watch-runtime")
  private let isoFormatter = ISO8601DateFormatter()
  private var activePlan: [String: Any]?
  private var activeLogs: [[String: Any]] = []
  private var activeEpochs: [[String: Any]] = []
  private var latestRuntimeError: String?
  private var consecutiveLikelyRemEpochs = 0
  private var cueCount = 0
  private var latestCueDecisionReason = "not_started"
  private var latestConnectivityState = "unknown"

  override init() {
    isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    super.init()
    activateWatchConnectivity()
  }

  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc(startWatchSession:resolver:rejecter:)
  func startWatchSession(
    _ planDictionary: NSDictionary,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let plan = planDictionary as? [String: Any] ?? [:]

    guard plan["mode"] as? String == "watch" else {
      reject(
        "invalid_watch_runtime_plan",
        "Watch runtime only accepts mode=watch.",
        runtimeError("Watch runtime only accepts mode=watch.")
      )
      return
    }

    guard let sessionId = plan["sessionId"] as? String, !sessionId.isEmpty else {
      reject(
        "invalid_watch_runtime_plan",
        "Watch runtime requires a sessionId.",
        runtimeError("Watch runtime requires a sessionId.")
      )
      return
    }

    queue.async {
      self.activePlan = plan
      self.activeLogs = self.loadLogs(sessionId: sessionId)
      self.activeEpochs = self.loadEpochs(sessionId: sessionId)
      self.latestRuntimeError = nil
      self.consecutiveLikelyRemEpochs = 0
      self.cueCount = 0
      self.latestCueDecisionReason = "watch_runtime_started"
      self.activateWatchConnectivity()
      self.appendEvent("watch_runtime_started", payload: [
        "nativePolicyVersion": plan["nativePolicyVersion"] as? String ?? "",
        "protocolVersion": plan["protocolVersion"] as? String ?? "",
        "classifierVersion": self.classifierVersion(plan: plan),
        "modelAvailable": self.modelAvailable(plan: plan),
        "remThreshold": self.remThreshold(plan: plan),
        "watchCueingEnabled": false,
        "reason": "native_watch_target_and_exact_feature_pipeline_pending"
      ])
      self.sendWatchCommand(command: "start", plan: plan)
      resolve(nil)
    }
  }

  @objc(stopWatchSession:resolver:rejecter:)
  func stopWatchSession(
    _ options: NSDictionary?,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let reason = options?["reason"] as? String ?? "user_stopped"

    queue.async {
      let sessionId = self.activePlan?["sessionId"] as? String
      let plan = self.activePlan

      if let plan {
        self.sendWatchCommand(command: "stop", plan: plan)
      }

      if let sessionId {
        self.appendEvent("watch_runtime_stopped", payload: [
          "reason": reason,
          "cueCount": self.cueCount,
          "consecutiveLikelyRemEpochs": self.consecutiveLikelyRemEpochs
        ])
        self.persistLogs(sessionId: sessionId)
        self.persistEpochs(sessionId: sessionId)
      }

      self.activePlan = nil
      self.activeLogs = []
      self.activeEpochs = []
      self.latestCueDecisionReason = "not_started"
      resolve(nil)
    }
  }

  @objc(getWatchRuntimeStatus:rejecter:)
  func getWatchRuntimeStatus(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async {
      resolve(self.statusPayload())
    }
  }

  @objc(getWatchEpochs:resolver:rejecter:)
  func getWatchEpochs(
    _ sessionId: NSString,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async {
      let id = sessionId as String
      resolve(id == self.activePlan?["sessionId"] as? String ? self.activeEpochs : self.loadEpochs(sessionId: id))
    }
  }

  @objc(getWatchRuntimeLogs:resolver:rejecter:)
  func getWatchRuntimeLogs(
    _ sessionId: NSString,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async {
      let id = sessionId as String
      resolve(id == self.activePlan?["sessionId"] as? String ? self.activeLogs : self.loadLogs(sessionId: id))
    }
  }

  @objc(clearWatchRuntimeLogs:resolver:rejecter:)
  func clearWatchRuntimeLogs(
    _ sessionId: NSString,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async {
      let id = sessionId as String

      if id.isEmpty {
        self.activeLogs = []
        self.activeEpochs = []
        try? FileManager.default.removeItem(at: self.storageDirectory())
      } else {
        if id == self.activePlan?["sessionId"] as? String {
          self.activeLogs = []
          self.activeEpochs = []
        }

        try? FileManager.default.removeItem(at: self.logsURL(sessionId: id))
        try? FileManager.default.removeItem(at: self.epochsURL(sessionId: id))
      }

      resolve(nil)
    }
  }

  private func activateWatchConnectivity() {
    guard WCSession.isSupported() else {
      latestConnectivityState = "disconnected"
      return
    }

    let session = WCSession.default
    session.delegate = self
    session.activate()
  }

  private func sendWatchCommand(command: String, plan: [String: Any]) {
    guard WCSession.isSupported() else {
      appendEvent("watch_command_failed", payload: [
        "command": command,
        "reason": "watch_connectivity_unavailable"
      ])
      return
    }

    let session = WCSession.default
    let message: [String: Any] = [
      "schemaVersion": "watch-command-v1",
      "command": command,
      "sessionId": plan["sessionId"] as? String ?? "",
      "plan": sanitizePayload(plan)
    ]

    guard session.activationState == .activated, session.isReachable else {
      session.transferUserInfo(message)
      latestConnectivityState = "delayed"
      appendEvent("watch_command_sent", payload: [
        "command": command,
        "delivery": "transferUserInfo"
      ])
      return
    }

    session.sendMessage(message, replyHandler: nil) { [weak self] error in
      self?.queue.async {
        self?.latestConnectivityState = "delayed"
        self?.appendEvent("watch_command_failed", payload: [
          "command": command,
          "error": error.localizedDescription,
          "fallback": "transferUserInfo"
        ])
        session.transferUserInfo(message)
      }
    }
    latestConnectivityState = "connected"
    appendEvent("watch_command_sent", payload: [
      "command": command,
      "delivery": "sendMessage"
    ])
  }

  private func handleIncomingEpoch(_ rawMessage: [String: Any], delayed: Bool) {
    guard let sessionId = rawMessage["sessionId"] as? String else {
      appendEvent("watch_runtime_error", payload: [
        "operation": "receive_epoch",
        "error": "missing sessionId"
      ])
      return
    }

    let epochId = stableEpochId(rawMessage)

    if activeEpochs.contains(where: { $0["id"] as? String == epochId }) {
      appendEvent("watch_epoch_duplicate", payload: [
        "epochId": epochId,
        "delayed": delayed
      ])
      return
    }

    var epoch = mapEpoch(rawMessage, epochId: epochId, delayed: delayed)
    epoch["classifierVersion"] = classifierVersion(plan: activePlan)
    epoch["remLabel"] = "unknown"
    epoch["processedAt"] = formatDate(Date())
    activeEpochs.append(epoch)
    latestConnectivityState = delayed ? "delayed" : "connected"
    latestCueDecisionReason = modelAvailable(plan: activePlan)
      ? "native_classifier_not_wired"
      : "classifier_unavailable"

    appendEvent(delayed ? "watch_epoch_delayed" : "watch_epoch_received", payload: [
      "epochId": epochId,
      "epochStart": epoch["epochStart"] as? String ?? "",
      "sensorQuality": epoch["sensorQuality"] as? String ?? "",
      "classifierVersion": epoch["classifierVersion"] as? String ?? "",
      "cueingEnabled": false,
      "reason": latestCueDecisionReason
    ])
    appendEvent("watch_cue_suppressed", payload: [
      "epochId": epochId,
      "reason": latestCueDecisionReason
    ])
    persistEpochs(sessionId: sessionId)
  }

  private func mapEpoch(
    _ rawMessage: [String: Any],
    epochId: String,
    delayed: Bool
  ) -> [String: Any] {
    let heartRate = rawMessage["heartRate"] as? [String: Any] ?? [:]
    let motion = rawMessage["motion"] as? [String: Any] ?? [:]
    let modelFeatures = rawMessage["modelFeatures"] as? [String: Any] ?? [:]
    let battery = rawMessage["battery"] as? [String: Any] ?? [:]
    let heartRateSampleCount = doubleValue(heartRate["sampleCount"]) ?? 0
    let motionSampleCount = doubleValue(motion["sampleCount"]) ?? 0
    let motionSummary = doubleValue(motion["activityCountMagnitudeSum"])
      ?? doubleValue(motion["meanMagnitude"])
    let now = formatDate(Date())

    return [
      "id": epochId,
      "sessionId": rawMessage["sessionId"] as? String ?? "",
      "epochStart": rawMessage["epochStart"] as? String ?? "",
      "epochEnd": rawMessage["epochEnd"] as? String ?? "",
      "heartRateSummary": nullableDouble(heartRate["meanBpm"]),
      "motionSummary": motionSummary ?? NSNull(),
      "sensorQuality": rawMessage["sensorQuality"] as? String ?? "missing",
      "elapsedSessionSeconds": doubleValue(rawMessage["elapsedSessionSeconds"]) ?? 0,
      "watchBatteryLevel": nullableDouble(battery["level"]),
      "watchConnectivityState": delayed ? "delayed" : "connected",
      "sampleCountsJson": jsonString([
        "heartRate": heartRateSampleCount,
        "motion": motionSampleCount
      ]),
      "epochFeaturesJson": jsonString(modelFeatures),
      "heartRateSampleCount": heartRateSampleCount,
      "motionSampleCount": motionSampleCount,
      "hrFeature": nullableDouble(modelFeatures["hrFeature"]),
      "motionFeature": nullableDouble(modelFeatures["motionFeature"]),
      "motionEma": nullableDouble(motion["motionEma"]),
      "timeFeature": nullableDouble(modelFeatures["timeFeatureHours"]),
      "rawEpochAvailable": false,
      "epochReceivedAt": rawMessage["receivedAt"] as? String ?? now
    ]
  }

  private func stableEpochId(_ rawMessage: [String: Any]) -> String {
    let sessionId = rawMessage["sessionId"] as? String ?? "unknown-session"
    let watchSessionId = rawMessage["watchSessionId"] as? String ?? "unknown-watch"
    let epochIndex = rawMessage["epochIndex"] ?? rawMessage["epochStart"] ?? UUID().uuidString

    return "\(sessionId):\(watchSessionId):\(epochIndex)"
  }

  private func statusPayload() -> [String: Any] {
    let plan = activePlan
    let latestEpoch = activeEpochs.last
    let classifierVersion = classifierVersion(plan: plan)
    let modelAvailable = modelAvailable(plan: plan)

    return [
      "available": WCSession.isSupported(),
      "unavailableReason": WCSession.isSupported() ? "" : "WatchConnectivity is unavailable.",
      "running": plan != nil,
      "sessionId": plan?["sessionId"] as? String ?? "",
      "watchSessionRunning": plan != nil,
      "watchReachable": WCSession.isSupported() ? WCSession.default.isReachable : false,
      "watchAppInstalled": WCSession.isSupported() ? WCSession.default.isWatchAppInstalled : false,
      "audioBedRunning": false,
      "cueCount": cueCount,
      "consecutiveLikelyRemEpochs": consecutiveLikelyRemEpochs,
      "latestEpochAt": latestEpoch?["epochEnd"] as? String ?? "",
      "latestHeartRate": latestEpoch?["heartRateSummary"] ?? NSNull(),
      "latestMotionSummary": latestEpoch?["motionSummary"] ?? NSNull(),
      "latestRemProbability": latestEpoch?["remProbability"] ?? NSNull(),
      "latestSensorQuality": latestEpoch?["sensorQuality"] as? String ?? "",
      "latestCueDecisionReason": latestCueDecisionReason,
      "classifierVersion": classifierVersion,
      "modelAvailable": modelAvailable,
      "watchBatteryLevel": latestEpoch?["watchBatteryLevel"] ?? NSNull(),
      "connectivityState": latestConnectivityState,
      "latestRuntimeError": latestRuntimeError ?? ""
    ]
  }

  private func appendEvent(_ eventType: String, payload: [String: Any]) {
    guard let sessionId = activePlan?["sessionId"] as? String else {
      return
    }

    let event: [String: Any] = [
      "id": UUID().uuidString,
      "sessionId": sessionId,
      "timestamp": formatDate(Date()),
      "eventType": eventType,
      "payload": sanitizePayload(payload)
    ]

    activeLogs.append(event)
    persistLogs(sessionId: sessionId)
  }

  private func classifierVersion(plan: [String: Any]?) -> String {
    let classifier = plan?["classifier"] as? [String: Any]
    return classifier?["classifierVersion"] as? String
      ?? "mallela-feature-pipeline-no-model"
  }

  private func modelAvailable(plan: [String: Any]?) -> Bool {
    let classifier = plan?["classifier"] as? [String: Any]
    return classifier?["modelAvailable"] as? Bool ?? false
  }

  private func remThreshold(plan: [String: Any]?) -> Double {
    let classifier = plan?["classifier"] as? [String: Any]
    return classifier?["remThreshold"] as? Double ?? 0.24
  }

  private func persistLogs(sessionId: String) {
    writeJson(activeLogs, to: logsURL(sessionId: sessionId))
  }

  private func persistEpochs(sessionId: String) {
    writeJson(activeEpochs, to: epochsURL(sessionId: sessionId))
  }

  private func loadLogs(sessionId: String) -> [[String: Any]] {
    loadJsonArray(from: logsURL(sessionId: sessionId))
  }

  private func loadEpochs(sessionId: String) -> [[String: Any]] {
    loadJsonArray(from: epochsURL(sessionId: sessionId))
  }

  private func writeJson(_ value: [[String: Any]], to url: URL) {
    do {
      let data = try JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted])
      try ensureStorageDirectory()
      try data.write(to: url, options: [.atomic])
    } catch {
      latestRuntimeError = error.localizedDescription
      NSLog("LucidCue watch runtime write failed: \(error.localizedDescription)")
    }
  }

  private func loadJsonArray(from url: URL) -> [[String: Any]] {
    guard
      let data = try? Data(contentsOf: url),
      let decoded = try? JSONSerialization.jsonObject(with: data),
      let array = decoded as? [[String: Any]]
    else {
      return []
    }

    return array
  }

  private func logsURL(sessionId: String) -> URL {
    storageDirectory().appendingPathComponent("\(sessionId)-events.json")
  }

  private func epochsURL(sessionId: String) -> URL {
    storageDirectory().appendingPathComponent("\(sessionId)-epochs.json")
  }

  private func storageDirectory() -> URL {
    FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("LucidCueWatchRuntime", isDirectory: true)
  }

  private func ensureStorageDirectory() throws {
    try FileManager.default.createDirectory(
      at: storageDirectory(),
      withIntermediateDirectories: true
    )
  }

  private func jsonString(_ value: Any) -> String {
    guard
      JSONSerialization.isValidJSONObject(value),
      let data = try? JSONSerialization.data(withJSONObject: value, options: []),
      let string = String(data: data, encoding: .utf8)
    else {
      return "{}"
    }

    return string
  }

  private func sanitizePayload(_ value: Any) -> Any {
    if JSONSerialization.isValidJSONObject(["value": value]) {
      return value
    }

    return String(describing: value)
  }

  private func nullableDouble(_ value: Any?) -> Any {
    doubleValue(value) ?? NSNull()
  }

  private func doubleValue(_ value: Any?) -> Double? {
    if let double = value as? Double {
      return double
    }

    if let int = value as? Int {
      return Double(int)
    }

    if let number = value as? NSNumber {
      return number.doubleValue
    }

    return nil
  }

  private func runtimeError(_ message: String) -> NSError {
    NSError(
      domain: "LucidCueWatchRuntime",
      code: -1,
      userInfo: [NSLocalizedDescriptionKey: message]
    )
  }

  private func formatDate(_ date: Date) -> String {
    isoFormatter.string(from: date)
  }

  func session(
    _ session: WCSession,
    activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {
    queue.async {
      if let error {
        self.latestConnectivityState = "disconnected"
        self.latestRuntimeError = error.localizedDescription
        self.appendEvent("watch_connectivity_failed", payload: [
          "activationState": activationState.rawValue,
          "error": error.localizedDescription
        ])
        return
      }

      self.latestConnectivityState = activationState == .activated
        ? (session.isReachable ? "connected" : "disconnected")
        : "unknown"
      self.appendEvent("watch_connectivity_activated", payload: [
        "activationState": activationState.rawValue,
        "isReachable": session.isReachable,
        "isWatchAppInstalled": session.isWatchAppInstalled
      ])
    }
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    queue.async {
      if message["schemaVersion"] as? String == "watch-epoch-v1" {
        self.handleIncomingEpoch(message, delayed: false)
      }
    }
  }

  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
    queue.async {
      if userInfo["schemaVersion"] as? String == "watch-epoch-v1" {
        self.handleIncomingEpoch(userInfo, delayed: true)
      }
    }
  }

  func sessionDidBecomeInactive(_ session: WCSession) {
    latestConnectivityState = "disconnected"
  }

  func sessionDidDeactivate(_ session: WCSession) {
    latestConnectivityState = "disconnected"
    session.activate()
  }
}
