import AVFoundation
import Foundation
import React
import WatchConnectivity

private enum WatchRuntimeLifecycleState: String {
  case idle
  case startPending
  case watchConfirmed
  case running
  case stopping
  case stopped
  case failedStart
  case orphanDetected
}

@objc(LucidCueWatchRuntime)
class LucidCueWatchRuntime: NSObject, WCSessionDelegate {
  private let queue = DispatchQueue(label: "com.lucidcue.watch-runtime")
  private let isoFormatter = ISO8601DateFormatter()
  private let startAckTimeoutSeconds: TimeInterval = 60
  private var activePlan: [String: Any]?
  private var activeLogs: [[String: Any]] = []
  private var activeEpochs: [[String: Any]] = []
  private var lifecycleState: WatchRuntimeLifecycleState = .idle
  private var pendingStartCommandId: String?
  private var pendingStartExpiresAt: Date?
  private var watchStartConfirmedAt: Date?
  private var firstEpochConfirmedAt: Date?
  private var watchStartFailureReason = ""
  private var latestWatchReportedSessionId = ""
  private var latestWatchSessionId = ""
  private var latestWatchSessionStartedAt: Date?
  private var latestWatchStopAt: Date?
  private var latestWatchIsRunning = false
  private var latestRuntimeError: String?
  private var consecutiveLikelyRemEpochs = 0
  private var cueCount = 0
  private var cuesInBlock = 0
  private var blockStartedAt: Date?
  private var blockRestUntil: Date?
  private var lastCueAt: Date?
  private var cueAssociatedMovementPauseUntil: Date?
  private var userPaused = false
  private var userDeferredUntil: Date?
  private var latestCueDecisionReason = "not_started"
  private var latestConnectivityState = "unknown"
  private var latestWatchStatusAt: Date?
  private var latestWatchStatusReason = ""
  private var latestWatchHealthAuthorizationStatus = "unknown"
  private let watchPresenceFreshnessSeconds: TimeInterval = 120
  private var classifier: WatchRandomForestModel?
  private var classifierLoadError: String?
  private var audioEngine: AVAudioEngine?
  private var audioBedPlayer: AVAudioPlayerNode?
  private var cuePlayer: AVAudioPlayerNode?
#if DEBUG
  private var debugAudioBedRunningOverride = false
  private var debugCuePlaybackOverride = false
#endif

  override init() {
    isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    super.init()
    activateWatchConnectivity()
  }

  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }

#if DEBUG
  static func runDebugSelfTest() {
    let runtime = LucidCueWatchRuntime()

    runtime.queue.async {
      let plan = runtime.debugSelfTestPlan()
      let sessionId = plan["sessionId"] as? String ?? "debug-watch-runtime-self-test"
      NSLog("LucidCue Watch runtime self-test started.")

      runtime.stopRuntime(reason: "debug_self_test_reset", logEvent: true)
      runtime.activePlan = plan
      runtime.activeLogs = []
      runtime.activeEpochs = []
      runtime.latestRuntimeError = nil
      runtime.consecutiveLikelyRemEpochs = 0
      runtime.cueCount = 0
      runtime.cuesInBlock = 0
      runtime.blockStartedAt = nil
      runtime.blockRestUntil = nil
      runtime.lastCueAt = nil
      runtime.cueAssociatedMovementPauseUntil = nil
      runtime.userPaused = false
      runtime.userDeferredUntil = nil
      runtime.latestCueDecisionReason = "debug_self_test_started"

      do {
        runtime.classifier = try runtime.loadClassifier()
        runtime.classifierLoadError = nil
        NSLog("LucidCue Watch runtime self-test loaded classifier.")
#if DEBUG
        runtime.debugAudioBedRunningOverride = true
        runtime.debugCuePlaybackOverride = true
#endif
        runtime.appendEvent("watch_audio_bed_started", payload: [
          "reason": "debug_self_test",
          "assetId": "lucidcue-audible-bed-white-noise",
          "volume": 0.03,
          "debugSynthetic": true
        ])
        runtime.appendEvent("watch_runtime_started", payload: [
          "reason": "debug_self_test",
          "classifierVersion": runtime.classifierVersion(plan: plan),
          "modelAvailable": runtime.modelAvailable(plan: plan),
          "remThreshold": runtime.remThreshold(plan: plan)
        ])
        runtime.handleIncomingEpoch(
          runtime.debugSelfTestEpoch(sessionId: sessionId),
          delayed: false
        )
        NSLog("LucidCue Watch runtime self-test injected epoch.")
        runtime.stopRuntime(reason: "debug_self_test_complete", logEvent: true)
      } catch {
        runtime.latestRuntimeError = error.localizedDescription
        NSLog("LucidCue Watch runtime self-test failed: \(error.localizedDescription)")
        runtime.appendEvent("watch_runtime_error", payload: [
          "operation": "debug_self_test",
          "error": error.localizedDescription
        ])
        runtime.persistLogs(sessionId: sessionId)
        runtime.persistEpochs(sessionId: sessionId)
        runtime.stopRuntime(reason: "error", logEvent: true)
      }

      NSLog("LucidCue Watch runtime self-test finished.")
    }
  }
#endif

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
      if let previousPlan = self.activePlan {
        self.sendWatchCommand(command: "stop", plan: previousPlan, reason: "replaced_by_new_session")
        self.stopRuntime(reason: "replaced_by_new_session", logEvent: true)
      } else if self.latestWatchIsRunning,
        !self.latestWatchReportedSessionId.isEmpty,
        self.latestWatchReportedSessionId != sessionId {
        self.sendStopCommand(
          sessionId: self.latestWatchReportedSessionId,
          reason: "replaced_by_new_session"
        )
      }

      self.activePlan = plan
      self.activeLogs = self.loadLogs(sessionId: sessionId)
      self.activeEpochs = self.loadEpochs(sessionId: sessionId)
      self.lifecycleState = .startPending
      self.pendingStartCommandId = nil
      self.pendingStartExpiresAt = nil
      self.watchStartConfirmedAt = nil
      self.firstEpochConfirmedAt = nil
      self.watchStartFailureReason = ""
      self.latestRuntimeError = nil
      self.consecutiveLikelyRemEpochs = 0
      self.cueCount = 0
      self.cuesInBlock = 0
      self.blockStartedAt = nil
      self.blockRestUntil = nil
      self.lastCueAt = nil
      self.cueAssociatedMovementPauseUntil = nil
      self.userPaused = false
      self.userDeferredUntil = nil
      self.latestCueDecisionReason = "watch_runtime_start_requested"
      self.activateWatchConnectivity()
      self.appendEvent("watch_runtime_start_requested", payload: [
        "nativePolicyVersion": plan["nativePolicyVersion"] as? String ?? "",
        "protocolVersion": plan["protocolVersion"] as? String ?? ""
      ])

      guard WCSession.isSupported() else {
        self.failPendingStart(
          sessionId: sessionId,
          reason: "watch_connectivity_unavailable",
          reject: reject,
          code: "watch_start_not_reachable"
        )
        return
      }

      let session = WCSession.default
      guard session.activationState == .activated, session.isReachable else {
        self.latestConnectivityState = "disconnected"
        self.failPendingStart(
          sessionId: sessionId,
          reason: "watch_start_not_reachable",
          reject: reject,
          code: "watch_start_not_reachable"
        )
        return
      }

      guard self.latestWatchHealthAuthorizationStatus != "denied",
        self.latestWatchHealthAuthorizationStatus != "unavailable"
      else {
        self.failPendingStart(
          sessionId: sessionId,
          reason: "watch_health_authorization_\(self.latestWatchHealthAuthorizationStatus)",
          reject: reject,
          code: "watch_start_health_unavailable"
        )
        return
      }

      do {
        self.classifier = try self.loadClassifier()
        self.classifierLoadError = nil
      } catch {
        self.classifier = nil
        self.classifierLoadError = error.localizedDescription
      }

      let commandId = UUID().uuidString
      let createdAt = Date()
      let expiresAt = createdAt.addingTimeInterval(self.startAckTimeoutSeconds)
      self.pendingStartCommandId = commandId
      self.pendingStartExpiresAt = expiresAt

      let message: [String: Any] = [
        "schemaVersion": "watch-command-v1",
        "command": "start",
        "commandId": commandId,
        "createdAt": self.formatDate(createdAt),
        "expiresAt": self.formatDate(expiresAt),
        "sessionId": sessionId,
        "plan": self.sanitizePayload(plan)
      ]

      func finishStartFailure(code: String, reason: String, eventType: String = "watch_start_failed") {
        guard self.pendingStartCommandId == commandId else {
          return
        }

        self.latestRuntimeError = reason
        self.watchStartFailureReason = reason
        self.lifecycleState = .failedStart
        self.pendingStartCommandId = nil
        self.pendingStartExpiresAt = nil
        self.latestCueDecisionReason = reason
        self.appendEvent(eventType, payload: [
          "commandId": commandId,
          "reason": reason
        ])
        if eventType != "watch_start_failed" {
          self.appendEvent("watch_start_failed", payload: [
            "commandId": commandId,
            "reason": reason
          ])
        }
        self.sendStopCommand(sessionId: sessionId, reason: "watch_start_cancelled")
        self.persistLogs(sessionId: sessionId)
        self.persistEpochs(sessionId: sessionId)
        self.stopRuntime(reason: reason, logEvent: false)
        reject(code, reason, self.runtimeError(reason))
      }

      func finishStartSuccess(reply: [String: Any]) {
        guard self.pendingStartCommandId == commandId else {
          return
        }

        guard reply["schemaVersion"] as? String == "watch-started-v1" else {
          let reason = reply["reason"] as? String ?? "watch_start_reply_invalid"
          finishStartFailure(code: "watch_start_rejected", reason: reason)
          return
        }

        guard reply["commandId"] as? String == commandId,
          reply["sessionId"] as? String == sessionId,
          reply["isRunning"] as? Bool == true
        else {
          finishStartFailure(code: "watch_start_rejected", reason: "watch_start_reply_mismatch")
          return
        }

        if Date() >= expiresAt {
          finishStartFailure(code: "watch_start_timeout", reason: "watch_start_timeout")
          return
        }

        self.lifecycleState = .watchConfirmed
        self.watchStartConfirmedAt = Date()
        self.latestWatchIsRunning = true
        self.latestWatchReportedSessionId = sessionId
        self.latestWatchSessionId = reply["watchSessionId"] as? String ?? self.latestWatchSessionId
        self.latestWatchSessionStartedAt = (reply["startedAt"] as? String).flatMap {
          self.parseDate($0)
        }
        self.latestWatchStopAt = (reply["stopAt"] as? String).flatMap {
          self.parseDate($0)
        }
        if let status = reply["healthAuthorizationStatus"] as? String,
          ["unknown", "authorized", "denied", "unavailable"].contains(status) {
          self.latestWatchHealthAuthorizationStatus = status
        }
        if self.latestWatchHealthAuthorizationStatus == "denied"
          || self.latestWatchHealthAuthorizationStatus == "unavailable" {
          finishStartFailure(
            code: "watch_start_health_unavailable",
            reason: "watch_health_authorization_\(self.latestWatchHealthAuthorizationStatus)"
          )
          return
        }
        self.latestConnectivityState = "connected"
        self.latestCueDecisionReason = "watch_start_confirmed"
        self.appendEvent("watch_start_confirmed", payload: [
          "commandId": commandId,
          "watchSessionId": self.latestWatchSessionId,
          "watchStartedAt": reply["startedAt"] as? String ?? "",
          "stopAt": reply["stopAt"] as? String ?? ""
        ])

        do {
          try self.configureAudioSession()
          try self.startAudioBed(plan: plan)
          self.appendEvent("watch_runtime_started", payload: [
            "nativePolicyVersion": plan["nativePolicyVersion"] as? String ?? "",
            "protocolVersion": plan["protocolVersion"] as? String ?? "",
            "classifierVersion": self.classifierVersion(plan: plan),
            "modelAvailable": self.modelAvailable(plan: plan),
            "remThreshold": self.remThreshold(plan: plan),
            "watchCueingEnabled": self.modelAvailable(plan: plan),
            "classifierLoadError": self.classifierLoadError ?? "",
            "commandId": commandId,
            "watchSessionId": self.latestWatchSessionId
          ])
          self.pendingStartCommandId = nil
          self.pendingStartExpiresAt = nil
          resolve(nil)
        } catch {
          self.appendEvent("watch_runtime_error", payload: [
            "operation": "start_watch_runtime_audio",
            "error": error.localizedDescription
          ])
          finishStartFailure(code: "watch_runtime_start_failed", reason: error.localizedDescription)
        }
      }

      session.sendMessage(message) { reply in
        self.queue.async {
          finishStartSuccess(reply: reply)
        }
      } errorHandler: { error in
        self.queue.async {
          self.latestConnectivityState = "delayed"
          self.appendEvent("watch_command_failed", payload: [
            "command": "start",
            "commandId": commandId,
            "error": error.localizedDescription
          ])
          finishStartFailure(code: "watch_start_not_reachable", reason: error.localizedDescription)
        }
      }

      self.latestConnectivityState = "connected"
      self.appendEvent("watch_start_command_sent", payload: [
        "commandId": commandId,
        "delivery": "sendMessage",
        "createdAt": self.formatDate(createdAt),
        "expiresAt": self.formatDate(expiresAt)
      ])

      self.queue.asyncAfter(deadline: .now() + self.startAckTimeoutSeconds) {
        finishStartFailure(
          code: "watch_start_timeout",
          reason: "watch_start_timeout",
          eventType: "watch_start_timeout"
        )
      }
    }
  }

  @objc(stopWatchSession:resolver:rejecter:)
  func stopWatchSession(
    _ options: NSDictionary?,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let reason = options?["reason"] as? String ?? "user_stopped"
    let requestedSessionId = options?["sessionId"] as? String

    queue.async {
      let sessionId = self.activePlan?["sessionId"] as? String
        ?? requestedSessionId
        ?? (self.latestWatchReportedSessionId.isEmpty ? nil : self.latestWatchReportedSessionId)
      let plan = self.activePlan

      if let plan {
        self.sendWatchCommand(command: "stop", plan: plan, reason: reason)
      } else if let sessionId, !sessionId.isEmpty {
        self.sendStopCommand(sessionId: sessionId, reason: reason)
      }

      if let sessionId {
        let payload: [String: Any] = [
          "reason": reason,
          "stoppedAt": self.formatDate(Date()),
          "cueCount": self.cueCount,
          "consecutiveLikelyRemEpochs": self.consecutiveLikelyRemEpochs
        ]
        if plan != nil {
          self.appendEvent("watch_runtime_stopped", payload: payload)
        } else {
          self.appendDetachedEvent(
            sessionId: sessionId,
            eventType: "watch_runtime_stopped",
            payload: payload
          )
        }
        self.persistEpochs(sessionId: sessionId)
      }

      self.stopRuntime(reason: reason, logEvent: false)
      resolve(nil)
    }
  }

  @objc(pauseWatchTlrCueing:rejecter:)
  func pauseWatchTlrCueing(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async {
      guard self.activePlan != nil else {
        reject(
          "watch_tlr_pause_failed",
          "No active Watch TLR runtime to pause.",
          self.runtimeError("No active Watch TLR runtime to pause.")
        )
        return
      }

      self.userPaused = true
      self.latestCueDecisionReason = "user_interaction"
      self.appendEvent("watch_cue_decision", payload: [
        "action": "pause",
        "reason": "user_paused_tlr",
        "shouldPlayCue": false
      ])
      resolve(nil)
    }
  }

  @objc(resumeWatchTlrCueing:rejecter:)
  func resumeWatchTlrCueing(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async {
      guard self.activePlan != nil else {
        reject(
          "watch_tlr_resume_failed",
          "No active Watch TLR runtime to resume.",
          self.runtimeError("No active Watch TLR runtime to resume.")
        )
        return
      }

      self.userPaused = false
      self.userDeferredUntil = nil
      self.latestCueDecisionReason = "user_interaction"
      self.appendEvent("watch_cue_decision", payload: [
        "action": "wait",
        "reason": "user_resumed_tlr",
        "shouldPlayCue": false
      ])
      resolve(nil)
    }
  }

  @objc(deferWatchTlrCueing:resolver:rejecter:)
  func deferWatchTlrCueing(
    _ options: NSDictionary?,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let durationSeconds = max(options?["durationSeconds"] as? Double ?? 1800, 60)

    queue.async {
      guard self.activePlan != nil else {
        reject(
          "watch_tlr_defer_failed",
          "No active Watch TLR runtime to defer.",
          self.runtimeError("No active Watch TLR runtime to defer.")
        )
        return
      }

      let deferUntil = Date().addingTimeInterval(durationSeconds)
      self.userPaused = false
      self.userDeferredUntil = deferUntil
      self.latestCueDecisionReason = "user_interaction"
      self.appendEvent("watch_cue_decision", payload: [
        "action": "pause",
        "reason": "user_deferred_tlr",
        "shouldPlayCue": false,
        "durationSeconds": durationSeconds,
        "deferUntil": self.formatDate(deferUntil)
      ])
      resolve(nil)
    }
  }

  @objc(getWatchRuntimeStatus:rejecter:)
  func getWatchRuntimeStatus(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async {
      self.queryWatchStatusIfReachable(resolve: resolve)
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

  private func queryWatchStatusIfReachable(resolve: @escaping RCTPromiseResolveBlock) {
    guard WCSession.isSupported() else {
      resolve(statusPayload())
      return
    }

    let session = WCSession.default
    guard session.activationState == .activated, session.isReachable else {
      resolve(statusPayload())
      return
    }

    let message: [String: Any] = [
      "schemaVersion": "watch-command-v1",
      "command": "status",
      "commandId": UUID().uuidString,
      "createdAt": formatDate(Date()),
      "sessionId": activePlan?["sessionId"] as? String ?? ""
    ]

    session.sendMessage(message) { reply in
      self.queue.async {
        if reply["schemaVersion"] as? String == "watch-status-v1" {
          self.handleIncomingWatchStatus(reply, delayed: false)
          let control = self.watchStatusReply(for: reply)
          if control["schemaVersion"] as? String == "watch-command-v1" {
            self.sendWatchCommandMessage(control)
          }
        }
        resolve(self.statusPayload())
      }
    } errorHandler: { error in
      self.queue.async {
        self.latestConnectivityState = "delayed"
        self.latestRuntimeError = error.localizedDescription
        resolve(self.statusPayload())
      }
    }
  }

  private func failPendingStart(
    sessionId: String,
    reason: String,
    reject: @escaping RCTPromiseRejectBlock,
    code: String
  ) {
    latestRuntimeError = reason
    watchStartFailureReason = reason
    lifecycleState = .failedStart
    pendingStartCommandId = nil
    pendingStartExpiresAt = nil
    latestCueDecisionReason = reason
    appendEvent("watch_start_failed", payload: [
      "reason": reason
    ])
    persistLogs(sessionId: sessionId)
    persistEpochs(sessionId: sessionId)
    stopRuntime(reason: reason, logEvent: false)
    reject(code, reason, runtimeError(reason))
  }

  private func sendWatchCommand(command: String, plan: [String: Any], reason: String = "iphone_command") {
    sendWatchCommandMessage([
      "schemaVersion": "watch-command-v1",
      "command": command,
      "sessionId": plan["sessionId"] as? String ?? "",
      "reason": reason,
      "plan": sanitizePayload(plan)
    ])
  }

  private func sendStopCommand(sessionId: String, reason: String) {
    sendWatchCommandMessage([
      "schemaVersion": "watch-command-v1",
      "command": "stop",
      "sessionId": sessionId,
      "reason": reason
    ])
  }

  private func sendWatchCommandMessage(_ message: [String: Any]) {
    let command = message["command"] as? String ?? ""

    guard WCSession.isSupported() else {
      appendEvent("watch_command_failed", payload: [
        "command": command,
        "reason": "watch_connectivity_unavailable"
      ])
      return
    }

    let session = WCSession.default

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

  @discardableResult
  private func handleIncomingEpoch(_ rawMessage: [String: Any], delayed: Bool) -> [String: Any] {
    guard let sessionId = rawMessage["sessionId"] as? String else {
      appendEvent("watch_runtime_error", payload: [
        "operation": "receive_epoch",
        "error": "missing sessionId"
      ])
      return ["schemaVersion": "watch-status-ack-v1"]
    }

    let activeSessionId = activePlan?["sessionId"] as? String
    guard sessionId == activeSessionId else {
      recordOrphanedWatchSession(
        sessionId: sessionId,
        watchSessionId: rawMessage["watchSessionId"] as? String ?? "",
        reason: "inactive_or_replaced_session"
      )
      appendDetachedEvent(sessionId: sessionId, eventType: "watch_epoch_ignored", payload: [
        "sessionId": sessionId,
        "reason": "inactive_or_replaced_session",
        "delayed": delayed
      ])
      return stopCommandPayload(sessionId: sessionId, reason: "inactive_or_replaced_session")
    }

    let epochId = stableEpochId(rawMessage)

    if activeEpochs.contains(where: { $0["id"] as? String == epochId }) {
      appendEvent("watch_epoch_duplicate", payload: [
        "epochId": epochId,
        "delayed": delayed
      ])
      return ["schemaVersion": "watch-status-ack-v1"]
    }

    var epoch = mapEpoch(rawMessage, epochId: epochId, delayed: delayed)
    let prediction = classifyEpoch(epoch: epoch)
    applyPrediction(prediction, to: &epoch)
    epoch["processedAt"] = formatDate(Date())

    let decision = evaluateWatchCueDecision(epoch: epoch, prediction: prediction)
    var finalDecisionReason = decision.reason

    if decision.shouldPlayCue {
      finalDecisionReason = playWatchCue(epochId: epochId, reason: decision.reason)
        ? "watch_likely_rem"
        : "audio_runtime_unavailable"
    }

    epoch["cueDecisionReason"] = finalDecisionReason
    activeEpochs.append(epoch)
    latestConnectivityState = delayed ? "delayed" : "connected"
    latestCueDecisionReason = finalDecisionReason
    latestWatchReportedSessionId = sessionId
    latestWatchSessionId = rawMessage["watchSessionId"] as? String ?? latestWatchSessionId
    latestWatchIsRunning = true

    if firstEpochConfirmedAt == nil {
      let confirmedAt = Date()
      firstEpochConfirmedAt = confirmedAt
      lifecycleState = .running
      appendEvent("watch_first_epoch_confirmed", payload: [
        "epochId": epochId,
        "confirmedAt": formatDate(confirmedAt),
        "watchSessionId": latestWatchSessionId
      ])
    }

    appendEvent(delayed ? "watch_epoch_delayed" : "watch_epoch_received", payload: [
      "epochId": epochId,
      "epochStart": epoch["epochStart"] as? String ?? "",
      "sensorQuality": epoch["sensorQuality"] as? String ?? "",
      "classifierVersion": epoch["classifierVersion"] as? String ?? "",
      "remProbability": epoch["remProbability"] ?? NSNull(),
      "sleepProbability": epoch["sleepProbability"] ?? NSNull(),
      "remLabel": epoch["remLabel"] as? String ?? "unknown",
      "cueingEnabled": modelAvailable(plan: activePlan),
      "reason": finalDecisionReason
    ])
    appendEvent("watch_cue_decision", payload: [
      "epochId": epochId,
      "action": decision.action,
      "reason": finalDecisionReason,
      "shouldPlayCue": decision.shouldPlayCue,
      "consecutiveLikelyRemEpochs": consecutiveLikelyRemEpochs,
      "persistentRemSuppressionActive": decision.persistentRemSuppressionActive,
      "remProbability": epoch["remProbability"] ?? NSNull(),
      "sleepProbability": epoch["sleepProbability"] ?? NSNull(),
      "stableLowMovementSeconds": epoch["stableLowMovementSeconds"] ?? NSNull()
    ])
    if !decision.shouldPlayCue || finalDecisionReason == "audio_runtime_unavailable" {
      appendEvent("watch_cue_suppressed", payload: [
        "epochId": epochId,
        "reason": finalDecisionReason
      ])
    }
    persistEpochs(sessionId: sessionId)

    if finalDecisionReason == "session_complete" {
      if let plan = activePlan {
        sendWatchCommand(command: "stop", plan: plan)
      }
      appendEvent("watch_runtime_stopped", payload: [
        "reason": "completed",
        "stoppedAt": formatDate(Date()),
        "cueCount": cueCount,
        "consecutiveLikelyRemEpochs": consecutiveLikelyRemEpochs
      ])
      persistLogs(sessionId: sessionId)
      persistEpochs(sessionId: sessionId)
      stopRuntime(reason: "completed", logEvent: false)
    }

    return ["schemaVersion": "watch-status-ack-v1"]
  }

  private func handleIncomingWatchStatus(_ rawMessage: [String: Any], delayed: Bool) {
    latestWatchStatusAt = Date()
    latestWatchStatusReason = rawMessage["reason"] as? String ?? ""
    latestWatchIsRunning = rawMessage["isRunning"] as? Bool ?? latestWatchIsRunning
    if let sessionId = rawMessage["sessionId"] as? String, !sessionId.isEmpty {
      latestWatchReportedSessionId = sessionId
    }
    if let watchSessionId = rawMessage["watchSessionId"] as? String, !watchSessionId.isEmpty {
      latestWatchSessionId = watchSessionId
    }
    latestWatchSessionStartedAt = (rawMessage["startedAt"] as? String).flatMap {
      parseDate($0)
    } ?? latestWatchSessionStartedAt
    latestWatchStopAt = (rawMessage["stopAt"] as? String).flatMap {
      parseDate($0)
    } ?? latestWatchStopAt
    if let status = rawMessage["healthAuthorizationStatus"] as? String,
      ["unknown", "authorized", "denied", "unavailable"].contains(status) {
      latestWatchHealthAuthorizationStatus = status
    }
    latestConnectivityState = delayed && !isWatchRecentlySeen()
      ? "delayed"
      : "connected"

    let activeSessionId = activePlan?["sessionId"] as? String
    if latestWatchIsRunning,
      !latestWatchReportedSessionId.isEmpty,
      latestWatchReportedSessionId != activeSessionId {
      recordOrphanedWatchSession(
        sessionId: latestWatchReportedSessionId,
        watchSessionId: latestWatchSessionId,
        reason: "watch_status_mismatch"
      )
    }

    if latestWatchIsRunning == false,
      let activeSessionId,
      latestWatchReportedSessionId == activeSessionId,
      activePlan != nil {
      let reason = latestWatchStatusReason.isEmpty ? "watch_stopped" : latestWatchStatusReason
      appendEvent("watch_runtime_stopped", payload: [
        "reason": reason,
        "stoppedAt": formatDate(Date()),
        "cueCount": cueCount,
        "consecutiveLikelyRemEpochs": consecutiveLikelyRemEpochs
      ])
      persistLogs(sessionId: activeSessionId)
      persistEpochs(sessionId: activeSessionId)
      stopRuntime(reason: reason, logEvent: false)
    }
  }

  private func watchStatusReply(for rawMessage: [String: Any]) -> [String: Any] {
    let watchSessionId = rawMessage["sessionId"] as? String ?? ""

    if let activeSessionId = activePlan?["sessionId"] as? String,
      rawMessage["isRunning"] as? Bool == true,
      watchSessionId != activeSessionId {
      return stopCommandPayload(sessionId: watchSessionId, reason: "inactive_or_replaced_session")
    }

    return [
      "schemaVersion": "watch-status-ack-v1"
    ]
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
      "stableLowMovementSeconds": nullableDouble(motion["stableLowMovementSeconds"]),
      "roughMovementIntensity": motion["roughMovementIntensity"] as? String ?? "",
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
    let watchReachable = WCSession.isSupported() ? WCSession.default.isReachable : false
    let watchRecentlySeen = isWatchRecentlySeen()
    let watchAppInstalled = WCSession.isSupported()
      ? WCSession.default.isWatchAppInstalled
      : false
    let watchHealthBlocked = latestWatchHealthAuthorizationStatus == "denied"
      || latestWatchHealthAuthorizationStatus == "unavailable"
    let watchStartEligible = watchReachable && watchAppInstalled && !watchHealthBlocked
    let phoneRuntimeRunning = lifecycleState == .watchConfirmed || lifecycleState == .running
    let effectiveConnectivityState = watchReachable
      ? "connected"
      : latestConnectivityState

    return [
      "available": WCSession.isSupported(),
      "unavailableReason": WCSession.isSupported() ? "" : "WatchConnectivity is unavailable.",
      "lifecycleState": lifecycleState.rawValue,
      "running": phoneRuntimeRunning,
      "sessionId": plan?["sessionId"] as? String ?? latestWatchReportedSessionId,
      "watchSessionRunning": latestWatchIsRunning,
      "watchReachable": watchReachable,
      "watchAppInstalled": watchAppInstalled,
      "watchRecentlySeen": watchRecentlySeen,
      "watchStartEligible": watchStartEligible,
      "watchLastSeenAt": latestWatchStatusAt.map(formatDate) ?? "",
      "watchStatusReason": latestWatchStatusReason,
      "watchHealthAuthorizationStatus": latestWatchHealthAuthorizationStatus,
      "watchStartConfirmedAt": watchStartConfirmedAt.map(formatDate) ?? "",
      "watchFirstEpochConfirmedAt": firstEpochConfirmedAt.map(formatDate) ?? "",
      "watchStartFailureReason": watchStartFailureReason,
      "latestWatchSessionId": latestWatchSessionId,
      "latestWatchSessionStartedAt": latestWatchSessionStartedAt.map(formatDate) ?? "",
      "latestWatchStopAt": latestWatchStopAt.map(formatDate) ?? "",
      "audioBedRunning": isAudioBedRunning(),
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
      "connectivityState": effectiveConnectivityState,
      "latestRuntimeError": latestRuntimeError ?? "",
      "tlrPaused": userPaused,
      "tlrDeferredUntil": userDeferredUntil.map(formatDate) ?? ""
    ]
  }

  private func isWatchRecentlySeen(now: Date = Date()) -> Bool {
    guard let latestWatchStatusAt else {
      return false
    }

    return now.timeIntervalSince(latestWatchStatusAt) <= watchPresenceFreshnessSeconds
  }

  private func appendEvent(_ eventType: String, payload: [String: Any]) {
    guard let sessionId = activePlan?["sessionId"] as? String else {
      return
    }

    let event = makeEvent(sessionId: sessionId, eventType: eventType, payload: payload)

    activeLogs.append(event)
    persistLogs(sessionId: sessionId)
  }

  private func appendDetachedEvent(sessionId: String, eventType: String, payload: [String: Any]) {
    guard !sessionId.isEmpty else {
      return
    }

    let activeSessionId = activePlan?["sessionId"] as? String
    if sessionId == activeSessionId {
      appendEvent(eventType, payload: payload)
      return
    }

    var logs = loadLogs(sessionId: sessionId)
    logs.append(makeEvent(sessionId: sessionId, eventType: eventType, payload: payload))
    writeJson(logs, to: logsURL(sessionId: sessionId))
  }

  private func makeEvent(
    sessionId: String,
    eventType: String,
    payload: [String: Any]
  ) -> [String: Any] {
    [
      "id": UUID().uuidString,
      "sessionId": sessionId,
      "timestamp": formatDate(Date()),
      "eventType": eventType,
      "payload": sanitizePayload(payload)
    ]
  }

  private func recordOrphanedWatchSession(
    sessionId: String,
    watchSessionId: String,
    reason: String
  ) {
    lifecycleState = .orphanDetected
    latestWatchReportedSessionId = sessionId
    latestWatchSessionId = watchSessionId
    latestWatchIsRunning = true
    latestCueDecisionReason = reason
    appendDetachedEvent(sessionId: sessionId, eventType: "watch_orphan_detected", payload: [
      "reason": reason,
      "watchSessionId": watchSessionId,
      "activeSessionId": activePlan?["sessionId"] as? String ?? ""
    ])
  }

  private func stopCommandPayload(sessionId: String, reason: String) -> [String: Any] {
    [
      "schemaVersion": "watch-command-v1",
      "command": "stop",
      "sessionId": sessionId,
      "reason": reason
    ]
  }

  private func classifierVersion(plan: [String: Any]?) -> String {
    let classifier = plan?["classifier"] as? [String: Any]
    return classifier?["classifierVersion"] as? String
      ?? "lucidcue-watch-rem-v1"
  }

  private func modelAvailable(plan: [String: Any]?) -> Bool {
    classifier != nil
  }

  private func remThreshold(plan: [String: Any]?) -> Double {
    let classifier = plan?["classifier"] as? [String: Any]
    return classifier?["remThreshold"] as? Double ?? 0.24
  }

  private func loadClassifier() throws -> WatchRandomForestModel {
    guard let url = Bundle.main.url(forResource: "mallela_rf_v1", withExtension: "json") else {
      throw runtimeError("Bundled watch REM model is missing.")
    }

    return try WatchRandomForestModel(url: url)
  }

  private func classifyEpoch(epoch: [String: Any]) -> WatchRuntimePrediction {
    let version = classifierVersion(plan: activePlan)
    guard let classifier else {
      return WatchRuntimePrediction(
        classifierVersion: version,
        modelAvailable: false,
        remLabel: "unknown",
        reason: classifierLoadError ?? "classifier_unavailable"
      )
    }

    guard let hrFeature = doubleValue(epoch["hrFeature"]),
      let motionFeature = doubleValue(epoch["motionFeature"]),
      let timeFeatureHours = doubleValue(epoch["timeFeature"])
    else {
      return WatchRuntimePrediction(
        classifierVersion: version,
        modelAvailable: true,
        remLabel: "unknown",
        reason: "missing_features"
      )
    }

    do {
      return try classifier.predict(
        features: WatchRuntimeFeatures(
          hrFeature: hrFeature,
          motionFeature: motionFeature,
          timeFeatureHours: timeFeatureHours
        ),
        classifierVersion: version,
        remThreshold: remThreshold(plan: activePlan)
      )
    } catch {
      latestRuntimeError = error.localizedDescription
      return WatchRuntimePrediction(
        classifierVersion: version,
        modelAvailable: false,
        remLabel: "unknown",
        reason: error.localizedDescription
      )
    }
  }

  private func applyPrediction(_ prediction: WatchRuntimePrediction, to epoch: inout [String: Any]) {
    epoch["classifierVersion"] = prediction.classifierVersion
    epoch["remLabel"] = prediction.remLabel
    epoch["remProbability"] = prediction.remProbability ?? NSNull()
    epoch["sleepProbability"] = prediction.sleepProbability ?? NSNull()
    epoch["stageLabel"] = prediction.stageLabel ?? prediction.remLabel
    epoch["stageProbabilitiesJson"] = jsonString(prediction.stageProbabilities)
  }

  private func evaluateWatchCueDecision(
    epoch: [String: Any],
    prediction: WatchRuntimePrediction
  ) -> WatchCueDecisionResult {
    let now = Date()
    clearExpiredWatchPauses(now: now)
    applyCueAssociatedMovementIfNeeded(epoch: epoch, now: now)

    let likelyRem = prediction.remLabel == "likely_rem"
    consecutiveLikelyRemEpochs = likelyRem ? consecutiveLikelyRemEpochs + 1 : 0
    let persistentRemSuppressionActive = likelyRem &&
      consecutiveLikelyRemEpochs >= intPlanValue(
        section: "classifier",
        key: "suppressAfterConsecutiveLikelyRemEpochs",
        fallback: 5
      )

    func suppress(_ reason: String, action: String = "suppress") -> WatchCueDecisionResult {
      WatchCueDecisionResult(
        action: action,
        reason: reason,
        shouldPlayCue: false,
        persistentRemSuppressionActive: persistentRemSuppressionActive
      )
    }

    guard activePlan != nil else {
      return suppress("session_not_active")
    }

    if let stopAt = stringPlanValue(section: "safety", key: "stopAt").flatMap(parseDate),
      now >= stopAt {
      return suppress("session_complete", action: "stop")
    }

    if userPaused {
      return suppress("user_interaction")
    }

    if let deferUntil = userDeferredUntil, now < deferUntil {
      return suppress("user_interaction")
    }

    if !prediction.modelAvailable || prediction.remLabel == "unknown" {
      return suppress("classifier_unavailable")
    }

    let sensorQuality = epoch["sensorQuality"] as? String ?? "missing"
    if sensorQuality == "missing" || sensorQuality == "bad" {
      return suppress("sensor_quality_bad")
    }

    let connectivityState = epoch["watchConnectivityState"] as? String ?? "unknown"
    if connectivityState != "connected" {
      return suppress("watch_connectivity_delayed")
    }

    let stableLowMovementSeconds = doubleValue(epoch["stableLowMovementSeconds"]) ?? 0
    let requiredStableSeconds = doublePlanValue(
      section: "cuePolicy",
      key: "stableLowMovementRequiredSeconds",
      fallback: 60
    )
    if stableLowMovementSeconds < requiredStableSeconds {
      return suppress("movement", action: "pause")
    }

    if let pauseUntil = cueAssociatedMovementPauseUntil, now < pauseUntil {
      return suppress("cue_associated_movement")
    }

    if let lastCueAt {
      let nextAllowedCueAt = lastCueAt.addingTimeInterval(
        doublePlanValue(section: "cuePolicy", key: "minimumSecondsSinceLastCue", fallback: 20)
      )
      if now < nextAllowedCueAt {
        return suppress("recent_cue")
      }
    }

    if cueCount >= intPlanValue(section: "cuePolicy", key: "maxCuesTonight", fallback: 60) {
      return suppress("cue_budget_exhausted")
    }

    if let restUntil = blockRestUntil {
      if now < restUntil {
        return suppress("cue_budget_exhausted")
      }

      blockRestUntil = nil
      blockStartedAt = nil
      cuesInBlock = 0
    }

    let maxCuesPerBlock = intPlanValue(section: "cuePolicy", key: "maxCuesPerBlock", fallback: 6)
    let maxBlockDurationSeconds =
      doublePlanValue(section: "cuePolicy", key: "maxBlockDurationMinutes", fallback: 30) * 60
    let blockDurationExhausted = blockStartedAt.map {
      now.timeIntervalSince($0) >= maxBlockDurationSeconds
    } ?? false

    if cuesInBlock >= maxCuesPerBlock || blockDurationExhausted {
      blockRestUntil = now.addingTimeInterval(
        doublePlanValue(section: "cuePolicy", key: "minRestBetweenBlocksMinutes", fallback: 20) * 60
      )
      return suppress("cue_budget_exhausted")
    }

    if let sleepProbability = prediction.sleepProbability {
      let minimumSleepProbability = doublePlanValue(
        section: "classifier",
        key: "minimumSleepProbability",
        fallback: 0.7
      )
      if sleepProbability < minimumSleepProbability {
        return suppress("outside_sleep_opportunity")
      }
    }

    if persistentRemSuppressionActive {
      return suppress("rem_persistent_suppression")
    }

    guard (prediction.remProbability ?? 0) >= remThreshold(plan: activePlan) else {
      return suppress("outside_sleep_opportunity")
    }

    if !isAudioBedRunning() {
      do {
        if let activePlan {
          try startAudioBed(plan: activePlan)
        }
      } catch {
        latestRuntimeError = error.localizedDescription
        appendEvent("watch_audio_bed_failed", payload: [
          "operation": "cue_decision_recover_audio_bed",
          "error": error.localizedDescription
        ])
        return suppress("audio_runtime_unavailable")
      }

      if !isAudioBedRunning() {
        return suppress("audio_runtime_unavailable")
      }
    }

    return WatchCueDecisionResult(
      action: "play_cue",
      reason: "watch_likely_rem",
      shouldPlayCue: true,
      persistentRemSuppressionActive: persistentRemSuppressionActive
    )
  }

  private func applyCueAssociatedMovementIfNeeded(epoch: [String: Any], now: Date) {
    guard let lastCueAt,
      let intensity = epoch["roughMovementIntensity"] as? String,
      intensity == "moderate" || intensity == "large"
    else {
      return
    }

    let windowSeconds = doublePlanValue(
      section: "cuePolicy",
      key: "cueAssociatedMovementWindowSeconds",
      fallback: 90
    )
    guard now.timeIntervalSince(lastCueAt) <= windowSeconds else {
      return
    }

    let pauseUntil = now.addingTimeInterval(
      doublePlanValue(section: "cuePolicy", key: "cueAssociatedMovementPauseSeconds", fallback: 180)
    )
    if cueAssociatedMovementPauseUntil.map({ $0 >= pauseUntil }) == true {
      return
    }

    cueAssociatedMovementPauseUntil = pauseUntil
    appendEvent("watch_movement_pause_started", payload: [
      "reason": "cue_associated_movement",
      "roughMovementIntensity": intensity,
      "pauseStartedAt": formatDate(now),
      "pauseUntil": formatDate(pauseUntil)
    ])
  }

  private func clearExpiredWatchPauses(now: Date) {
    if let deferUntil = userDeferredUntil, now >= deferUntil {
      userDeferredUntil = nil
      appendEvent("watch_cue_decision", payload: [
        "action": "wait",
        "reason": "user_defer_elapsed",
        "shouldPlayCue": false,
        "deferEndedAt": formatDate(now)
      ])
    }

    if let pauseUntil = cueAssociatedMovementPauseUntil, now >= pauseUntil {
      cueAssociatedMovementPauseUntil = nil
    }
  }

  private func configureAudioSession() throws {
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
      try session.setActive(true)
    } catch {
      try session.setCategory(.playback, mode: .default, options: [])
      try session.setActive(true)
    }
  }

  private func startAudioBed(plan: [String: Any]) throws {
    let audio = plan["iPhoneAudio"] as? [String: Any] ?? [:]
    let assetId = audio["audioBedAssetId"] as? String ?? "lucidcue-audible-bed-white-noise"
    let volume = doubleValue(audio["audioBedVolume"]) ?? 0.03
    let engine = ensureAudioEngine()
    let format = engine.mainMixerNode.outputFormat(forBus: 0)
    let buffer: AVAudioPCMBuffer

    if assetId == "lucidcue-audible-bed-binaural-beats" {
      buffer = makeBinauralBuffer(
        format: format,
        carrierFrequency: 180,
        beatFrequency: 4,
        durationSeconds: 8,
        amplitude: 0.18
      )
    } else {
      buffer = makeWhiteNoiseBuffer(format: format, durationSeconds: 4, amplitude: 0.22)
    }

    audioBedPlayer?.stop()
    audioBedPlayer?.volume = Float(clamp(volume, min: 0, max: 1))
    audioBedPlayer?.scheduleBuffer(buffer, at: nil, options: .loops)

    if !engine.isRunning {
      try engine.start()
    }

    audioBedPlayer?.play()
    appendEvent("watch_audio_bed_started", payload: [
      "assetId": assetId,
      "volume": volume
    ])
  }

  private func playWatchCue(epochId: String, reason: String) -> Bool {
    guard let plan = activePlan else {
      return false
    }

    let audio = plan["iPhoneAudio"] as? [String: Any] ?? [:]
    let cueId = audio["cueId"] as? String ?? audio["cueAssetId"] as? String ?? "watch-cue"
    let resourceName = audio["cueResourceName"] as? String ?? ""
    let resourceExtension = audio["cueResourceExtension"] as? String ?? "mp3"
    let volume = min(
      doubleValue(audio["capVolume"]) ?? 0.28,
      (doubleValue(audio["startVolume"]) ?? 0.1) +
        (doubleValue(audio["rampPerCue"]) ?? 0.03) * Double(cueCount)
    )

#if DEBUG
    if debugCuePlaybackOverride {
      let playedAt = Date()
      if blockStartedAt == nil {
        blockStartedAt = playedAt
      }
      cueCount += 1
      cuesInBlock += 1
      lastCueAt = playedAt

      appendEvent("watch_cue_played", payload: [
        "epochId": epochId,
        "reason": reason,
        "cueId": cueId,
        "cueResourceName": resourceName,
        "cueResourceExtension": resourceExtension,
        "playedAt": formatDate(playedAt),
        "durationSeconds": doubleValue(audio["cueDurationSeconds"]) ?? 0,
        "volume": volume,
        "cueCount": cueCount,
        "cuesInBlock": cuesInBlock,
        "debugSynthetic": true
      ])
      return true
    }
#endif

    do {
      guard !resourceName.isEmpty,
        let url = Bundle.main.url(forResource: resourceName, withExtension: resourceExtension)
      else {
        throw runtimeError("Missing bundled cue asset \(resourceName).\(resourceExtension).")
      }

      let engine = ensureAudioEngine()
      let file = try AVAudioFile(forReading: url)
      cuePlayer?.stop()
      cuePlayer?.volume = Float(clamp(volume, min: 0, max: 1))
      cuePlayer?.scheduleFile(file, at: nil)

      if !engine.isRunning {
        try engine.start()
      }

      cuePlayer?.play()
      let playedAt = Date()
      if blockStartedAt == nil {
        blockStartedAt = playedAt
      }
      cueCount += 1
      cuesInBlock += 1
      lastCueAt = playedAt

      appendEvent("watch_cue_played", payload: [
        "epochId": epochId,
        "reason": reason,
        "cueId": cueId,
        "cueResourceName": resourceName,
        "cueResourceExtension": resourceExtension,
        "playedAt": formatDate(playedAt),
        "durationSeconds": Double(file.length) / file.fileFormat.sampleRate,
        "volume": volume,
        "cueCount": cueCount,
        "cuesInBlock": cuesInBlock
      ])
      return true
    } catch {
      latestRuntimeError = error.localizedDescription
      appendEvent("watch_cue_failed", payload: [
        "epochId": epochId,
        "reason": reason,
        "cueId": cueId,
        "cueResourceName": resourceName,
        "cueResourceExtension": resourceExtension,
        "volume": volume,
        "error": error.localizedDescription
      ])
      return false
    }
  }

  private func stopRuntime(reason: String, logEvent: Bool) {
    let sessionId = activePlan?["sessionId"] as? String
    let wasAudioBedRunning = isAudioBedRunning()
    let shouldPreserveFailureState = lifecycleState == .failedStart
    let shouldPreserveOrphanState = lifecycleState == .orphanDetected

    audioBedPlayer?.stop()
    cuePlayer?.stop()
    audioEngine?.stop()
    audioEngine = nil
    audioBedPlayer = nil
    cuePlayer = nil
    classifier = nil
    classifierLoadError = nil
#if DEBUG
    debugAudioBedRunningOverride = false
    debugCuePlaybackOverride = false
#endif

    if logEvent, let sessionId {
      if wasAudioBedRunning {
        appendEvent("watch_audio_bed_stopped", payload: [
          "reason": reason
        ])
      }
      appendEvent("watch_runtime_stopped", payload: [
        "reason": reason,
        "stoppedAt": formatDate(Date()),
        "cueCount": cueCount,
        "consecutiveLikelyRemEpochs": consecutiveLikelyRemEpochs
      ])
      persistLogs(sessionId: sessionId)
      persistEpochs(sessionId: sessionId)
    }

    activePlan = nil
    pendingStartCommandId = nil
    pendingStartExpiresAt = nil
    activeLogs = []
    activeEpochs = []
    consecutiveLikelyRemEpochs = 0
    cueCount = 0
    cuesInBlock = 0
    blockStartedAt = nil
    blockRestUntil = nil
    lastCueAt = nil
    cueAssociatedMovementPauseUntil = nil
    userPaused = false
    userDeferredUntil = nil
    latestWatchIsRunning = false
    latestCueDecisionReason = "not_started"
    if !shouldPreserveFailureState && !shouldPreserveOrphanState {
      lifecycleState = .stopped
    }
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }

  private func ensureAudioEngine() -> AVAudioEngine {
    if let audioEngine {
      return audioEngine
    }

    let engine = AVAudioEngine()
    let bedPlayer = AVAudioPlayerNode()
    let cuePlayer = AVAudioPlayerNode()
    engine.attach(bedPlayer)
    engine.attach(cuePlayer)
    engine.connect(bedPlayer, to: engine.mainMixerNode, format: nil)
    engine.connect(cuePlayer, to: engine.mainMixerNode, format: nil)
    audioEngine = engine
    audioBedPlayer = bedPlayer
    self.cuePlayer = cuePlayer
    return engine
  }

  private func isAudioBedRunning() -> Bool {
#if DEBUG
    if debugAudioBedRunningOverride {
      return true
    }
#endif
    return audioEngine?.isRunning == true && audioBedPlayer?.isPlaying == true
  }

  private func makeWhiteNoiseBuffer(
    format: AVAudioFormat,
    durationSeconds: Double,
    amplitude: Double
  ) -> AVAudioPCMBuffer {
    let sampleRate = format.sampleRate
    let frameCount = AVAudioFrameCount(sampleRate * durationSeconds)
    let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount)!
    buffer.frameLength = frameCount

    guard let channels = buffer.floatChannelData else {
      return buffer
    }

    for frame in 0..<Int(frameCount) {
      for channelIndex in 0..<Int(format.channelCount) {
        channels[channelIndex][frame] = Float.random(in: -1...1) * Float(amplitude)
      }
    }

    return buffer
  }

  private func makeBinauralBuffer(
    format: AVAudioFormat,
    carrierFrequency: Double,
    beatFrequency: Double,
    durationSeconds: Double,
    amplitude: Double
  ) -> AVAudioPCMBuffer {
    let sampleRate = format.sampleRate
    let frameCount = AVAudioFrameCount(sampleRate * durationSeconds)
    let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount)!
    buffer.frameLength = frameCount

    guard let channels = buffer.floatChannelData else {
      return buffer
    }

    let rightFrequency = carrierFrequency + beatFrequency
    for frame in 0..<Int(frameCount) {
      let time = Double(frame) / sampleRate
      let leftSample = Float(sin(2 * Double.pi * carrierFrequency * time) * amplitude)
      let rightSample = Float(sin(2 * Double.pi * rightFrequency * time) * amplitude)

      for channelIndex in 0..<Int(format.channelCount) {
        channels[channelIndex][frame] = channelIndex == 1 ? rightSample : leftSample
      }
    }

    return buffer
  }

  private func stringPlanValue(section: String, key: String) -> String? {
    let planSection = activePlan?[section] as? [String: Any]
    return planSection?[key] as? String
  }

  private func doublePlanValue(section: String, key: String, fallback: Double) -> Double {
    let planSection = activePlan?[section] as? [String: Any]
    return doubleValue(planSection?[key]) ?? fallback
  }

  private func intPlanValue(section: String, key: String, fallback: Int) -> Int {
    let planSection = activePlan?[section] as? [String: Any]
    if let value = planSection?[key] as? Int {
      return value
    }
    if let value = planSection?[key] as? NSNumber {
      return value.intValue
    }
    return fallback
  }

  private func parseDate(_ value: String) -> Date? {
    isoFormatter.date(from: value)
  }

  private func clamp(_ value: Double, min: Double, max: Double) -> Double {
    Swift.min(max, Swift.max(min, value))
  }

#if DEBUG
  private func debugSelfTestPlan() -> [String: Any] {
    let now = Date()

    return [
      "sessionId": "debug-watch-runtime-self-test",
      "protocolVersion": "tlr-2026-001",
      "nativePolicyVersion": "iphone-watch-runtime-2026-001",
      "mode": "watch",
      "startedAt": formatDate(now),
      "trainingStartedAt": formatDate(now.addingTimeInterval(-6 * 3600 - 900)),
      "trainingEndedAt": formatDate(now.addingTimeInterval(-6 * 3600)),
      "iPhoneAudio": [
        "audioBedRequired": true,
        "audioBedAssetId": "lucidcue-audible-bed-white-noise",
        "audioBedVolume": 0.03,
        "cueAssetId": "clear-bell-chime",
        "cueId": "clear-bell-chime",
        "cueResourceName": "clear_bell_chime",
        "cueResourceExtension": "mp3",
        "cueDurationSeconds": 2.5,
        "startVolume": 0.1,
        "rampPerCue": 0.03,
        "capVolume": 0.28
      ],
      "classifier": [
        "classifierVersion": "lucidcue-watch-rem-v1",
        "modelAvailable": true,
        "remThreshold": 0.24,
        "minimumSleepProbability": 0.7,
        "suppressAfterConsecutiveLikelyRemEpochs": 5
      ],
      "cuePolicy": [
        "minimumSecondsSinceLastCue": 20,
        "stableLowMovementRequiredSeconds": 60,
        "cueAssociatedMovementWindowSeconds": 90,
        "cueAssociatedMovementPauseSeconds": 180,
        "maxCuesTonight": 60,
        "maxCuesPerBlock": 6,
        "maxBlockDurationMinutes": 30,
        "minRestBetweenBlocksMinutes": 20
      ],
      "safety": [
        "stopAt": formatDate(now.addingTimeInterval(3600)),
        "requireIPhoneAudioBed": true
      ]
    ]
  }

  private func debugSelfTestEpoch(sessionId: String) -> [String: Any] {
    let now = Date()
    let epochStart = now.addingTimeInterval(-30)
    let motionFeature = 0.00026317484602751294

    return [
      "schemaVersion": "watch-epoch-v1",
      "sessionId": sessionId,
      "watchSessionId": "debug-watch-simulator",
      "epochIndex": 1,
      "epochStart": formatDate(epochStart),
      "epochEnd": formatDate(now),
      "elapsedSessionSeconds": 21_066,
      "heartRate": [
        "sampleCount": 6,
        "meanBpm": 48.2,
        "hrEma": 48.2,
        "hrFeature": 111.81720473624651
      ],
      "motion": [
        "sampleCount": 900,
        "activityCountMagnitudeSum": 12.0,
        "meanMagnitude": 0.01,
        "maxMagnitude": 1.01,
        "motionEma": motionFeature * 1_000_000_000,
        "motionFeature": motionFeature,
        "stableLowMovementSeconds": 60.0,
        "roughMovementIntensity": "still"
      ],
      "modelFeatures": [
        "hrFeature": 111.81720473624651,
        "motionFeature": motionFeature,
        "timeFeatureHours": 5.85188311948497
      ],
      "battery": [
        "level": 0.8,
        "state": "simulated",
        "lowPowerMode": false
      ],
      "sensorQuality": "good",
      "connectivityState": "connected",
      "receivedAt": formatDate(now)
    ]
  }
#endif

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
        ? (session.isReachable ? "connected" : "unknown")
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
        let reply = self.handleIncomingEpoch(message, delayed: false)
        if reply["schemaVersion"] as? String == "watch-command-v1" {
          self.sendWatchCommandMessage(reply)
        }
      } else if message["schemaVersion"] as? String == "watch-status-v1" {
        self.handleIncomingWatchStatus(message, delayed: false)
        let reply = self.watchStatusReply(for: message)
        if reply["schemaVersion"] as? String == "watch-command-v1" {
          self.sendWatchCommandMessage(reply)
        }
      }
    }
  }

  func session(
    _ session: WCSession,
    didReceiveMessage message: [String: Any],
    replyHandler: @escaping ([String: Any]) -> Void
  ) {
    queue.async {
      if message["schemaVersion"] as? String == "watch-status-v1" {
        self.handleIncomingWatchStatus(message, delayed: false)
        replyHandler(self.watchStatusReply(for: message))
        return
      }

      if message["schemaVersion"] as? String == "watch-epoch-v1" {
        replyHandler(self.handleIncomingEpoch(message, delayed: false))
        return
      }

      replyHandler([
        "schemaVersion": "watch-status-ack-v1"
      ])
    }
  }

  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
    queue.async {
      if userInfo["schemaVersion"] as? String == "watch-epoch-v1" {
        let reply = self.handleIncomingEpoch(userInfo, delayed: true)
        if reply["schemaVersion"] as? String == "watch-command-v1" {
          self.sendWatchCommandMessage(reply)
        }
      } else if userInfo["schemaVersion"] as? String == "watch-status-v1" {
        self.handleIncomingWatchStatus(userInfo, delayed: true)
        let reply = self.watchStatusReply(for: userInfo)
        if reply["schemaVersion"] as? String == "watch-command-v1" {
          self.sendWatchCommandMessage(reply)
        }
      }
    }
  }

  func sessionReachabilityDidChange(_ session: WCSession) {
    queue.async {
      self.latestConnectivityState = session.isReachable
        ? "connected"
        : "unknown"
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

private struct WatchRuntimeFeatures {
  let hrFeature: Double
  let motionFeature: Double
  let timeFeatureHours: Double
}

private struct WatchRuntimePrediction {
  let classifierVersion: String
  let modelAvailable: Bool
  let remProbability: Double?
  let sleepProbability: Double?
  let remLabel: String
  let stageProbabilities: [String: Double]
  let stageLabel: String?
  let reason: String

  init(
    classifierVersion: String,
    modelAvailable: Bool,
    remProbability: Double? = nil,
    sleepProbability: Double? = nil,
    remLabel: String,
    stageProbabilities: [String: Double] = [:],
    stageLabel: String? = nil,
    reason: String
  ) {
    self.classifierVersion = classifierVersion
    self.modelAvailable = modelAvailable
    self.remProbability = remProbability
    self.sleepProbability = sleepProbability
    self.remLabel = remLabel
    self.stageProbabilities = stageProbabilities
    self.stageLabel = stageLabel
    self.reason = reason
  }
}

private struct WatchCueDecisionResult {
  let action: String
  let reason: String
  let shouldPlayCue: Bool
  let persistentRemSuppressionActive: Bool
}

private final class WatchRandomForestModel {
  private let version: String
  private let classLabels: [String]
  private let remClassLabel: String?
  private let wakeClassLabel: String?
  private let trees: [[[Any]]]

  init(url: URL) throws {
    let data = try Data(contentsOf: url)
    guard
      let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
      let version = json["version"] as? String,
      let classes = json["classes"] as? [Any],
      let trees = json["trees"] as? [[[Any]]],
      !trees.isEmpty
    else {
      throw WatchRandomForestModel.error("Bundled watch REM model JSON is invalid.")
    }

    self.version = version
    self.classLabels = classes.map { String(describing: $0) }
    self.remClassLabel = WatchRandomForestModel.stringValue(json["remClass"])
    self.wakeClassLabel = WatchRandomForestModel.stringValue(json["wakeClass"])
    self.trees = trees
  }

  func predict(
    features: WatchRuntimeFeatures,
    classifierVersion requestedClassifierVersion: String,
    remThreshold: Double
  ) throws -> WatchRuntimePrediction {
    let vector = [
      features.hrFeature,
      features.motionFeature,
      features.timeFeatureHours
    ]
    var totals = Array(repeating: 0.0, count: classLabels.count)

    for tree in trees {
      let probabilities = try evaluate(tree: tree, vector: vector)
      guard probabilities.count == classLabels.count else {
        throw WatchRandomForestModel.error("Random forest leaf probability length is invalid.")
      }

      for index in probabilities.indices {
        totals[index] += probabilities[index]
      }
    }

    let treeCount = Double(trees.count)
    var probabilitiesByClass: [String: Double] = [:]
    for (index, label) in classLabels.enumerated() {
      probabilitiesByClass[label] = totals[index] / treeCount
    }

    let stageProbabilities = stageProbabilities(from: probabilitiesByClass)
    let remProbability = remClassLabel.flatMap { probabilitiesByClass[$0] }
    let sleepProbability = wakeClassLabel.flatMap { probabilitiesByClass[$0] }.map { 1 - $0 }
    let remLabel: String

    if let remProbability {
      remLabel = remProbability >= remThreshold ? "likely_rem" : "not_likely_rem"
    } else {
      remLabel = "unknown"
    }

    return WatchRuntimePrediction(
      classifierVersion: requestedClassifierVersion.isEmpty ? version : requestedClassifierVersion,
      modelAvailable: true,
      remProbability: remProbability,
      sleepProbability: sleepProbability,
      remLabel: remLabel,
      stageProbabilities: stageProbabilities,
      stageLabel: dominantStage(in: stageProbabilities),
      reason: remProbability == nil ? "rem_class_unavailable" : remLabel
    )
  }

  private func evaluate(tree: [[Any]], vector: [Double]) throws -> [Double] {
    var nodeIndex = 0

    for _ in 0..<10_000 {
      guard tree.indices.contains(nodeIndex) else {
        throw WatchRandomForestModel.error("Random forest tree references missing node \(nodeIndex).")
      }

      let node = tree[nodeIndex]
      guard
        node.count >= 5,
        let left = WatchRandomForestModel.intValue(node[0]),
        let right = WatchRandomForestModel.intValue(node[1]),
        let featureIndex = WatchRandomForestModel.intValue(node[2]),
        let threshold = WatchRandomForestModel.doubleValue(node[3]),
        let probabilities = WatchRandomForestModel.doubleArray(node[4])
      else {
        throw WatchRandomForestModel.error("Random forest tree node is invalid.")
      }

      if left == -1 && right == -1 {
        return probabilities
      }

      guard vector.indices.contains(featureIndex) else {
        throw WatchRandomForestModel.error("Random forest tree uses invalid feature \(featureIndex).")
      }

      nodeIndex = vector[featureIndex] <= threshold ? left : right
    }

    throw WatchRandomForestModel.error("Random forest tree did not reach a leaf.")
  }

  private func stageProbabilities(from probabilities: [String: Double]) -> [String: Double] {
    var stages: [String: Double] = [:]

    if let wakeClassLabel {
      stages["wake"] = probabilities[wakeClassLabel]
    }
    if let remClassLabel {
      stages["rem"] = probabilities[remClassLabel]
    }
    if let probability = probabilities["1"] {
      stages["n1"] = probability
    }
    if let probability = probabilities["3"] {
      stages["n2"] = probability
    }
    if let probability = probabilities["4"] {
      stages["n3"] = probability
    }
    if let probability = probabilities["0"] {
      stages["unknown"] = probability
    }

    return stages
  }

  private func dominantStage(in probabilities: [String: Double]) -> String? {
    probabilities.max { left, right in
      left.value < right.value
    }?.key
  }

  private static func stringValue(_ value: Any?) -> String? {
    guard let value else {
      return nil
    }

    return String(describing: value)
  }

  private static func intValue(_ value: Any?) -> Int? {
    if let int = value as? Int {
      return int
    }
    if let number = value as? NSNumber {
      return number.intValue
    }
    return nil
  }

  private static func doubleValue(_ value: Any?) -> Double? {
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

  private static func doubleArray(_ value: Any?) -> [Double]? {
    guard let array = value as? [Any] else {
      return nil
    }

    var result: [Double] = []
    for item in array {
      guard let value = doubleValue(item) else {
        return nil
      }
      result.append(value)
    }

    return result
  }

  private static func error(_ message: String) -> NSError {
    NSError(
      domain: "LucidCueWatchRandomForestModel",
      code: -1,
      userInfo: [NSLocalizedDescriptionKey: message]
    )
  }
}
