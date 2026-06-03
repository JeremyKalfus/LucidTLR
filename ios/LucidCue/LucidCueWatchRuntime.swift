import Foundation
import React
import WatchConnectivity

@objc(LucidCueWatchRuntime)
class LucidCueWatchRuntime: NSObject, WCSessionDelegate {
  private let queue = DispatchQueue(label: "com.lucidcue.watch-runtime")
  private let isoFormatter = ISO8601DateFormatter()
  private var latestWatchOwnedPlan: [String: Any]?
  private var latestWatchOwnedPreparedAt: Date?
  private var latestWatchOwnedStatus: [String: Any]?
  private var latestWatchOwnedSyncPhase = ""
  private var watchOwnedLogPackages: [String: [[String: Any]]] = [:]
  private var latestWatchReportedSessionId = ""
  private var latestRuntimeError: String?
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

  @objc(beginWatchOwnedStartSync:resolver:rejecter:)
  func beginWatchOwnedStartSync(
    _ planDictionary: NSDictionary,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let plan = planDictionary as? [String: Any] ?? [:]

    guard plan["protocol"] as? String == "watch-session-plan-v2" else {
      reject(
        "invalid_watch_owned_plan",
        "Watch-owned session plan must use watch-session-plan-v2.",
        runtimeError("Watch-owned session plan must use watch-session-plan-v2.")
      )
      return
    }

    guard let sessionId = plan["sessionId"] as? String, !sessionId.isEmpty else {
      reject(
        "invalid_watch_owned_plan",
        "Watch-owned session plan requires a sessionId.",
        runtimeError("Watch-owned session plan requires a sessionId.")
      )
      return
    }

    queue.async {
      self.activateWatchConnectivity()
      self.latestWatchOwnedPlan = plan
      self.latestWatchOwnedPreparedAt = Date()
      self.latestWatchOwnedSyncPhase = "start"
      self.latestWatchOwnedStatus = self.makeStatus(
        state: "start_sync_waiting",
        sessionId: sessionId,
        preparedSessionId: sessionId,
        reason: "phone_waiting_for_watch_sync",
        extra: [
          "stopAt": plan["stopAt"] as? String ?? "",
          "cueMode": plan["cueMode"] as? String ?? "",
          "modelAvailable": plan["remModelManifest"] is [String: Any],
          "classifierVersion": (plan["remModelManifest"] as? [String: Any])?["version"] as? String ?? "",
          "syncPending": false
        ]
      )

      guard WCSession.isSupported() else {
        self.latestConnectivityState = "disconnected"
        reject(
          "watch_connectivity_unavailable",
          "Apple Watch connectivity is unavailable on this device.",
          self.runtimeError("Apple Watch connectivity is unavailable on this device.")
        )
        return
      }

      let session = WCSession.default
      guard session.activationState == .activated else {
        self.latestConnectivityState = "delayed"
        reject(
          "watch_connectivity_not_ready",
          "Apple Watch connectivity is still activating. Try again in a moment.",
          self.runtimeError("Apple Watch connectivity is still activating. Try again in a moment.")
        )
        return
      }

      let message: [String: Any] = [
        "schemaVersion": "watch-owned-sync-state-v2",
        "phase": "start",
        "state": "waiting_for_watch_sync",
        "sessionId": sessionId,
        "preparedAt": self.formatDate(self.latestWatchOwnedPreparedAt ?? Date())
      ]

      do {
        try session.updateApplicationContext(message)
      } catch {
        self.latestRuntimeError = error.localizedDescription
      }

      session.transferUserInfo(message)

      if session.isReachable {
        session.sendMessage(message, replyHandler: nil) { error in
          self.queue.async {
            self.latestConnectivityState = "delayed"
            self.latestRuntimeError = error.localizedDescription
          }
        }
        self.latestConnectivityState = "connected"
      } else {
        self.latestConnectivityState = "delayed"
      }

      resolve(nil)
    }
  }

  @objc(requestWatchOwnedLogSync:resolver:rejecter:)
  func requestWatchOwnedLogSync(
    _ options: NSDictionary?,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let sessionId = options?["sessionId"] as? String
      ?? latestWatchOwnedPlan?["sessionId"] as? String
      ?? latestWatchReportedSessionId

    queue.async {
      self.sendWatchOwnedCommand(command: "sync_logs", sessionId: sessionId, reason: "phone_sync_button")
      resolve(nil)
    }
  }

  @objc(acknowledgeWatchOwnedLogSync:resolver:rejecter:)
  func acknowledgeWatchOwnedLogSync(
    _ options: NSDictionary?,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let sessionId = options?["sessionId"] as? String
      ?? latestWatchOwnedPlan?["sessionId"] as? String
      ?? latestWatchReportedSessionId

    queue.async {
      self.sendWatchOwnedCommand(command: "ack_logs_imported", sessionId: sessionId, reason: "phone_imported_logs")
      self.latestWatchOwnedSyncPhase = ""
      if !sessionId.isEmpty {
        self.watchOwnedLogPackages[sessionId] = nil
        try? FileManager.default.removeItem(at: self.watchOwnedLogsURL(sessionId: sessionId))
      }
      self.latestWatchOwnedStatus = self.makeStatus(
        state: "completed",
        sessionId: sessionId,
        preparedSessionId: self.latestWatchOwnedPlan?["sessionId"] as? String ?? "",
        reason: "logs_imported_on_phone",
        extra: ["syncPending": false]
      )
      resolve(nil)
    }
  }

  @objc(getLatestWatchOwnedStatus:rejecter:)
  func getLatestWatchOwnedStatus(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async {
      let preparedSessionId = self.latestWatchOwnedPlan?["sessionId"] as? String ?? ""
      var status = self.latestWatchOwnedStatus ?? self.makeStatus(
        state: preparedSessionId.isEmpty ? "no_plan" : "ready",
        sessionId: preparedSessionId,
        preparedSessionId: preparedSessionId,
        reason: preparedSessionId.isEmpty ? "no_plan_on_phone" : "prepared_on_phone"
      )

      let sessionId = status["sessionId"] as? String ?? ""
      if !sessionId.isEmpty {
        status["syncPending"] = self.watchOwnedLogPackages[sessionId] != nil
      } else {
        status["syncPending"] = !self.watchOwnedLogPackages.isEmpty
      }
      if let latestRuntimeError = self.latestRuntimeError {
        status["latestRuntimeError"] = latestRuntimeError
      }
      status["watchReachable"] = WCSession.isSupported() ? WCSession.default.isReachable : false
      status["connectivityState"] = WCSession.isSupported() && WCSession.default.isReachable
        ? "connected"
        : self.latestConnectivityState

      resolve(status)
    }
  }

  @objc(importWatchOwnedSessionLogs:resolver:rejecter:)
  func importWatchOwnedSessionLogs(
    _ sessionId: NSString,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async {
      let id = sessionId as String
      let packages = self.watchOwnedLogPackages[id] ?? self.loadWatchOwnedLogPackages(sessionId: id)
      resolve(self.mergeWatchOwnedLogPackages(sessionId: id, packages: packages))
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

  private func sendWatchOwnedCommand(command: String, sessionId: String, reason: String) {
    let message: [String: Any] = [
      "schemaVersion": "watch-owned-command-v2",
      "command": command,
      "sessionId": sessionId,
      "reason": reason,
      "createdAt": formatDate(Date())
    ]

    guard WCSession.isSupported() else {
      latestConnectivityState = "disconnected"
      latestRuntimeError = "WatchConnectivity is unavailable."
      return
    }

    let session = WCSession.default
    guard session.activationState == .activated else {
      latestConnectivityState = "delayed"
      latestRuntimeError = "WatchConnectivity is not activated."
      return
    }

    if session.isReachable {
      session.sendMessage(message, replyHandler: nil) { [weak self] error in
        self?.queue.async {
          self?.latestRuntimeError = error.localizedDescription
          self?.latestConnectivityState = "delayed"
          session.transferUserInfo(message)
        }
      }
      latestConnectivityState = "connected"
    } else {
      session.transferUserInfo(message)
      latestConnectivityState = "delayed"
    }
  }

  private func handleIncomingWatchOwnedStatus(_ rawMessage: [String: Any], delayed: Bool) {
    var status = rawMessage
    status["protocol"] = "watch-owned-status-v2"
    status["available"] = true
    status["runtimeOwner"] = "watch"
    status["watchReachable"] = WCSession.isSupported() ? WCSession.default.isReachable : false
    status["connectivityState"] = delayed ? "delayed" : "connected"
    latestWatchOwnedStatus = sanitizePayload(status) as? [String: Any] ?? status
    latestConnectivityState = delayed ? "delayed" : "connected"

    if let sessionId = rawMessage["sessionId"] as? String, !sessionId.isEmpty {
      latestWatchReportedSessionId = sessionId
    }
  }

  private func handleIncomingWatchOwnedLogPackage(_ rawMessage: [String: Any]) {
    guard let sessionId = rawMessage["sessionId"] as? String, !sessionId.isEmpty else {
      latestRuntimeError = "watch_owned_log_package_missing_session"
      return
    }

    var packages = watchOwnedLogPackages[sessionId] ?? loadWatchOwnedLogPackages(sessionId: sessionId)
    packages.append(sanitizePayload(rawMessage) as? [String: Any] ?? rawMessage)
    watchOwnedLogPackages[sessionId] = packages
    writeJson(packages, to: watchOwnedLogsURL(sessionId: sessionId))
    latestWatchOwnedStatus = makeStatus(
      state: "sync_pending",
      sessionId: sessionId,
      preparedSessionId: latestWatchOwnedPlan?["sessionId"] as? String ?? "",
      reason: "logs_received_on_phone",
      extra: ["syncPending": true]
    )
  }

  private func handleIncomingWatchOwnedSyncRequest(_ rawMessage: [String: Any]) -> [String: Any] {
    let phase = rawMessage["phase"] as? String ?? ""
    let sessionId = rawMessage["sessionId"] as? String ?? ""

    if phase == "start" {
      guard
        latestWatchOwnedSyncPhase == "start",
        let plan = latestWatchOwnedPlan,
        let planSessionId = plan["sessionId"] as? String,
        !planSessionId.isEmpty,
        sessionId.isEmpty || sessionId == planSessionId
      else {
        return [
          "schemaVersion": "watch-owned-start-sync-v2",
          "accepted": false,
          "reason": "phone_not_waiting_for_watch_sync"
        ]
      }

      latestWatchOwnedSyncPhase = ""
      latestWatchOwnedStatus = makeStatus(
        state: "starting",
        sessionId: planSessionId,
        preparedSessionId: planSessionId,
        reason: "watch_sync_requested",
        extra: ["syncPending": false]
      )

      return [
        "schemaVersion": "watch-owned-start-sync-v2",
        "accepted": true,
        "sessionId": planSessionId,
        "plan": sanitizePayload(plan)
      ]
    }

    return [
      "schemaVersion": "watch-owned-sync-rejected-v2",
      "accepted": false,
      "reason": "unsupported_sync_phase"
    ]
  }

  private func makeStatus(
    state: String,
    sessionId: String,
    preparedSessionId: String,
    reason: String,
    extra: [String: Any] = [:]
  ) -> [String: Any] {
    var status: [String: Any] = [
      "protocol": "watch-owned-status-v2",
      "available": WCSession.isSupported(),
      "runtimeOwner": "watch",
      "state": state,
      "sessionId": sessionId,
      "preparedSessionId": preparedSessionId,
      "reason": reason,
      "watchReachable": WCSession.isSupported() ? WCSession.default.isReachable : false,
      "connectivityState": WCSession.isSupported() && WCSession.default.isReachable
        ? "connected"
        : latestConnectivityState
    ]

    extra.forEach { status[$0.key] = $0.value }
    return status
  }

  private func mergeWatchOwnedLogPackages(
    sessionId: String,
    packages: [[String: Any]]
  ) -> [String: Any] {
    var epochs: [[String: Any]] = []
    var cueDeliveries: [[String: Any]] = []
    var summary: [String: Any]?

    for package in packages {
      if let packageEpochs = package["epochs"] as? [[String: Any]] {
        epochs.append(contentsOf: packageEpochs)
      }
      if let deliveries = package["cueDeliveries"] as? [[String: Any]] {
        cueDeliveries.append(contentsOf: deliveries)
      }
      if let packageSummary = package["summary"] as? [String: Any] {
        summary = packageSummary
      }
    }

    var payload: [String: Any] = [
      "sessionId": sessionId,
      "epochs": dedupeRecords(epochs),
      "cueDeliveries": dedupeRecords(cueDeliveries)
    ]

    if let summary {
      payload["summary"] = summary
    }

    return payload
  }

  private func dedupeRecords(_ records: [[String: Any]]) -> [[String: Any]] {
    var seen = Set<String>()
    var result: [[String: Any]] = []

    for record in records {
      let id = record["id"] as? String
        ?? record["requestedAt"] as? String
        ?? record["endedAt"] as? String
        ?? UUID().uuidString

      guard !seen.contains(id) else {
        continue
      }

      seen.insert(id)
      result.append(record)
    }

    return result
  }

  private func loadWatchOwnedLogPackages(sessionId: String) -> [[String: Any]] {
    loadJsonArray(from: watchOwnedLogsURL(sessionId: sessionId))
  }

  private func writeJson(_ value: [[String: Any]], to url: URL) {
    do {
      let data = try JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted])
      try ensureStorageDirectory()
      try data.write(to: url, options: [.atomic])
    } catch {
      latestRuntimeError = error.localizedDescription
      NSLog("LucidCue watch-owned runtime write failed: \(error.localizedDescription)")
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

  private func watchOwnedLogsURL(sessionId: String) -> URL {
    storageDirectory().appendingPathComponent("\(sessionId)-watch-owned-log-packages.json")
  }

  private func storageDirectory() -> URL {
    FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("LucidCueWatchOwnedRuntime", isDirectory: true)
  }

  private func ensureStorageDirectory() throws {
    try FileManager.default.createDirectory(
      at: storageDirectory(),
      withIntermediateDirectories: true
    )
  }

  private func sanitizePayload(_ value: Any) -> Any {
    if JSONSerialization.isValidJSONObject(["value": value]) {
      return value
    }

    return String(describing: value)
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
      } else {
        self.latestConnectivityState = activationState == .activated
          ? (session.isReachable ? "connected" : "unknown")
          : "unknown"
      }
    }
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    queue.async {
      if message["schemaVersion"] as? String == "watch-owned-status-v2" {
        self.handleIncomingWatchOwnedStatus(message, delayed: false)
      } else if message["schemaVersion"] as? String == "watch-owned-log-package-v2" {
        self.handleIncomingWatchOwnedLogPackage(message)
      } else if message["schemaVersion"] as? String == "watch-owned-sync-request-v2" {
        _ = self.handleIncomingWatchOwnedSyncRequest(message)
      }
    }
  }

  func session(
    _ session: WCSession,
    didReceiveMessage message: [String: Any],
    replyHandler: @escaping ([String: Any]) -> Void
  ) {
    queue.async {
      if message["schemaVersion"] as? String == "watch-owned-status-v2" {
        self.handleIncomingWatchOwnedStatus(message, delayed: false)
        replyHandler(["schemaVersion": "watch-owned-ack-v2"])
        return
      }

      if message["schemaVersion"] as? String == "watch-owned-log-package-v2" {
        self.handleIncomingWatchOwnedLogPackage(message)
        replyHandler(["schemaVersion": "watch-owned-ack-v2"])
        return
      }

      if message["schemaVersion"] as? String == "watch-owned-sync-request-v2" {
        replyHandler(self.handleIncomingWatchOwnedSyncRequest(message))
        return
      }

      replyHandler(["schemaVersion": "watch-owned-ack-v2"])
    }
  }

  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
    queue.async {
      if userInfo["schemaVersion"] as? String == "watch-owned-status-v2" {
        self.handleIncomingWatchOwnedStatus(userInfo, delayed: true)
      } else if userInfo["schemaVersion"] as? String == "watch-owned-log-package-v2" {
        self.handleIncomingWatchOwnedLogPackage(userInfo)
      }
    }
  }

  func sessionReachabilityDidChange(_ session: WCSession) {
    queue.async {
      self.latestConnectivityState = session.isReachable ? "connected" : "unknown"
    }
  }

  func sessionDidBecomeInactive(_ session: WCSession) {
    latestConnectivityState = session.isReachable ? "connected" : "unknown"
  }

  func sessionDidDeactivate(_ session: WCSession) {
    latestConnectivityState = session.isReachable ? "connected" : "unknown"
    session.activate()
  }
}
