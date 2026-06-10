import CryptoKit
import Foundation
import React
import WatchConnectivity

@objc(LucidTLRWatchTransport)
final class LucidTLRWatchTransport: NSObject, WCSessionDelegate {
  private struct ReceivedPackageFile {
    let metadata: [String: Any]
    let targetPath: String
    let receivedAt: String
    let fileByteCount: Int
    let sourceExistsBeforeCopy: Bool
    let hashVerification: String
  }

  private struct PackageFileReceiveFailure: Error {
    let metadata: [String: Any]
    let receivedAt: String
    let sourceExistsBeforeCopy: Bool
    let errorMessage: String
    let hashVerification: String
  }

  private static let recentIncomingMessageIdLimit = 64
  private static let hashVerifiedLabel = "verified-sha256"

  private let queue = DispatchQueue(label: "com.lucidtlr.watch-transport-lab")
  private let defaults = UserDefaults.standard
  private let statusKey = "lucidtlr.watchTransportLab.status.v1"
  private let packageFilePathKey = "lucidtlr.watchTransportLab.latestPackageFilePath.v1"
  private let isoFormatter = ISO8601DateFormatter()
#if targetEnvironment(simulator)
  private var simulatorTransportDrainTimer: DispatchSourceTimer?
  private var simulatorTransportLastEpochMillis: Int64 = 0
#endif

  override init() {
    isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    super.init()
  }

  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc(activateTransport:rejecter:)
  func activateTransport(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async {
      guard let session = self.supportedSession() else {
        resolve(self.unavailableStatus("WatchConnectivity is not supported on this device."))
        return
      }

      session.delegate = self
      session.activate()
      self.recordLastMessage(type: "transport.activate", at: self.nowString())
#if targetEnvironment(simulator)
      self.startSimulatorTransportShimIfNeeded()
#endif
      resolve(self.currentStatus())
    }
  }

  @objc(getTransportStatus:rejecter:)
  func getTransportStatus(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async {
      resolve(self.currentStatus())
    }
  }

  @objc(stageSyntheticPlan:resolver:rejecter:)
  func stageSyntheticPlan(
    _ message: NSDictionary,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async {
      guard let session = self.supportedSession() else {
        resolve(self.unavailableStatus("WatchConnectivity is not supported on this device."))
        return
      }

      let payload = self.propertyListMessage(from: message)
      self.activateIfNeeded(session)

      self.performWhenActivated(session, attemptsRemaining: 120) { activated in
        guard activated else {
          self.recordError("updateApplicationContext failed: WatchConnectivity session has not been activated.")
          resolve(self.currentStatus())
          return
        }

        do {
          try session.updateApplicationContext(payload)
          self.recordStagedPlan(payload)
          self.recordLastMessage(
            type: self.stringValue(payload["messageType"]) ?? "lucidtlr.watch.plan.available",
            at: self.stringValue(payload["createdAt"]) ?? self.nowString()
          )
        } catch {
          self.recordError("updateApplicationContext failed: \(error.localizedDescription)")
        }

        resolve(self.currentStatus())
      }
    }
  }

  @objc(requestWatchStatus:resolver:rejecter:)
  func requestWatchStatus(
    _ message: NSDictionary,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async {
      guard let session = self.supportedSession() else {
        resolve(self.unavailableStatus("WatchConnectivity is not supported on this device."))
        return
      }

      let payload = self.propertyListMessage(from: message)
      self.activateIfNeeded(session)
      session.transferUserInfo(payload)
#if targetEnvironment(simulator)
      self.writeSimulatorTransportUserInfo(payload, to: "to-watch")
#endif
      self.recordLastMessage(
        type: self.stringValue(payload["messageType"]) ?? "lucidtlr.watch.plan.request",
        at: self.stringValue(payload["createdAt"]) ?? self.nowString()
      )
      resolve(self.currentStatus())
    }
  }

  @objc(getLatestReceivedSyntheticPackage:rejecter:)
  func getLatestReceivedSyntheticPackage(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async {
      guard let path = self.defaults.string(forKey: self.packageFilePathKey) else {
        resolve(nil)
        return
      }

      do {
        let data = try Data(contentsOf: URL(fileURLWithPath: path))
        let object = try JSONSerialization.jsonObject(with: data)
        resolve(object)
      } catch {
        self.recordError("Could not read latest received synthetic package: \(error.localizedDescription)")
        reject("watch_transport_package_read_failed", error.localizedDescription, error)
      }
    }
  }

  @objc(sendAckForImportedPackage:resolver:rejecter:)
  func sendAckForImportedPackage(
    _ message: NSDictionary,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async {
      guard let session = self.supportedSession() else {
        resolve(self.unavailableStatus("WatchConnectivity is not supported on this device."))
        return
      }

      let payload = self.propertyListMessage(from: message)
      self.activateIfNeeded(session)
      session.transferUserInfo(payload)
#if targetEnvironment(simulator)
      self.writeSimulatorTransportUserInfo(payload, to: "to-watch")
#endif
      self.recordAck(payload)
      self.recordLastMessage(
        type: self.stringValue(payload["messageType"]) ?? "lucidtlr.watch.package.ack",
        at: self.stringValue(payload["createdAt"]) ?? self.nowString()
      )
      resolve(self.currentStatus())
    }
  }

  @objc(clearLabTransportStatus:rejecter:)
  func clearLabTransportStatus(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async {
      self.defaults.removeObject(forKey: self.statusKey)
      if let path = self.defaults.string(forKey: self.packageFilePathKey) {
        try? FileManager.default.removeItem(atPath: path)
      }
      self.defaults.removeObject(forKey: self.packageFilePathKey)
      resolve(self.currentStatus())
    }
  }

  func session(
    _ session: WCSession,
    activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {
    queue.async {
      if let error {
        self.recordError("WCSession activation failed: \(error.localizedDescription)")
      }
      self.recordLastMessage(type: "transport.activation.\(self.activationStateLabel(activationState))", at: self.nowString())
    }
  }

  func sessionDidBecomeInactive(_ session: WCSession) {
    queue.async {
      self.recordLastMessage(type: "transport.inactive", at: self.nowString())
    }
  }

  func sessionDidDeactivate(_ session: WCSession) {
    queue.async {
      self.recordLastMessage(type: "transport.deactivated", at: self.nowString())
      session.activate()
    }
  }

  func sessionReachabilityDidChange(_ session: WCSession) {
    queue.async {
      self.recordLastMessage(type: "transport.reachability.changed", at: self.nowString())
    }
  }

  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
    queue.async {
      self.handleIncoming(userInfo)
    }
  }

  func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
    queue.async {
      self.handleIncoming(applicationContext)
    }
  }

  func session(_ session: WCSession, didReceive file: WCSessionFile) {
    handleReceivedPackageFile(fileURL: file.fileURL, metadata: file.metadata ?? [:])
  }

  private func handleReceivedPackageFile(fileURL: URL, metadata: [String: Any]) {
    let persistedFile = attemptPersistReceivedPackageFile(fileURL: fileURL, metadata: metadata)

    queue.async {
      self.applyReceivedPackageFileResult(persistedFile)
    }
  }

  private func applyReceivedPackageFileResult(
    _ persistedFile: Result<ReceivedPackageFile, PackageFileReceiveFailure>
  ) {
    switch persistedFile {
    case .success(let packageFile):
      if !recordPackageFileIfFresh(packageFile) {
        return
      }
    case .failure(let failure):
      recordPackageFileReceiveFailure(
        metadata: failure.metadata,
        receivedAt: failure.receivedAt,
        sourceExistsBeforeCopy: failure.sourceExistsBeforeCopy,
        errorMessage: failure.errorMessage,
        hashVerification: failure.hashVerification
      )
    }
  }

  private func supportedSession() -> WCSession? {
    WCSession.isSupported() ? WCSession.default : nil
  }

  private func activateIfNeeded(_ session: WCSession) {
    if session.activationState == .notActivated {
      session.delegate = self
      session.activate()
    }
  }

  private func performWhenActivated(
    _ session: WCSession,
    attemptsRemaining: Int,
    perform: @escaping (Bool) -> Void
  ) {
    if session.activationState == .activated {
      perform(true)
      return
    }

    if attemptsRemaining <= 0 {
      perform(false)
      return
    }

    activateIfNeeded(session)
    queue.asyncAfter(deadline: .now() + 0.25) {
      self.performWhenActivated(
        session,
        attemptsRemaining: attemptsRemaining - 1,
        perform: perform
      )
    }
  }

  private func currentStatus() -> [String: Any] {
    guard let session = supportedSession() else {
      return unavailableStatus("WatchConnectivity is not supported on this device.")
    }

    var status = persistedStatus()
    status["available"] = true
    status["activationState"] = activationStateLabel(session.activationState)
    status["paired"] = session.isPaired
    status["watchAppInstalled"] = session.isWatchAppInstalled
    status["reachable"] = session.isReachable
    status["isReachableInformationalOnly"] = true
    return status
  }

  private func unavailableStatus(_ reason: String) -> [String: Any] {
    [
      "available": false,
      "unavailableReason": reason,
      "activationState": "unavailable",
      "paired": false,
      "watchAppInstalled": false,
      "reachable": false,
      "isReachableInformationalOnly": true,
      "lastError": reason,
    ]
  }

  private func persistedStatus() -> [String: Any] {
    defaults.dictionary(forKey: statusKey) ?? [
      "available": true,
      "activationState": "notActivated",
      "paired": false,
      "watchAppInstalled": false,
      "reachable": false,
      "isReachableInformationalOnly": true,
    ]
  }

  private func writeStatus(_ status: [String: Any]) {
    defaults.set(status, forKey: statusKey)
  }

  private func mutateStatus(_ mutate: (inout [String: Any]) -> Void) {
    var status = persistedStatus()
    mutate(&status)
    writeStatus(status)
  }

  private func recordLastMessage(type: String, at: String) {
    mutateStatus { status in
      status["lastMessageType"] = type
      status["lastMessageAt"] = at
    }
  }

  private func recordError(_ message: String) {
    mutateStatus { status in
      status["lastError"] = message
      status["lastMessageType"] = "lucidtlr.watch.transport.error"
      status["lastMessageAt"] = self.nowString()
    }
  }

  private func recordStagedPlan(_ payload: [String: Any]) {
    mutateStatus { status in
      status["latestStagedPlanId"] = self.stringValue(payload["sessionId"])
      status["latestStagedPlanHash"] = self.stringValue(payload["planHash"])
      status.removeValue(forKey: "lastError")
    }
  }

  /// Appends the incoming messageId/idempotencyKey to a bounded persisted ring
  /// and reports whether this payload was already handled. Duplicate queued
  /// WatchConnectivity deliveries become diagnostic no-ops. Must run on queue.
  private func noteIncomingMessageIdAndDetectDuplicate(from payload: [String: Any]) -> Bool {
    guard let messageId =
      stringValue(payload["messageId"]) ?? stringValue(payload["idempotencyKey"]) else {
      return false
    }

    var isDuplicate = false
    mutateStatus { status in
      var recentIds = status["recentIncomingMessageIds"] as? [String] ?? []

      if recentIds.contains(messageId) {
        isDuplicate = true
        let duplicateCount = ((status["duplicateIgnoredCount"] as? NSNumber)?.intValue ?? 0) + 1
        status["duplicateIgnoredCount"] = duplicateCount
        status["latestIgnoredDuplicate"] = [
          "messageType": self.stringValue(payload["messageType"]) ?? "unknown",
          "messageId": messageId,
          "ignoredAt": self.nowString(),
        ]
        status["lastMessageType"] =
          "\(self.stringValue(payload["messageType"]) ?? "unknown").duplicate.ignored"
        status["lastMessageAt"] = self.nowString()
        return
      }

      recentIds.append(messageId)
      if recentIds.count > Self.recentIncomingMessageIdLimit {
        recentIds.removeFirst(recentIds.count - Self.recentIncomingMessageIdLimit)
      }
      status["recentIncomingMessageIds"] = recentIds
    }

    return isDuplicate
  }

  private func matchesStagedPlan(_ payload: [String: Any], status: [String: Any]) -> Bool {
    guard let stagedSessionId = status["latestStagedPlanId"] as? String,
      let incomingSessionId = stringValue(payload["sessionId"]) else {
      return true
    }

    if incomingSessionId != stagedSessionId {
      return false
    }

    guard let stagedPlanHash = status["latestStagedPlanHash"] as? String,
      let incomingPlanHash = stringValue(payload["planHash"]) else {
      return true
    }

    return incomingPlanHash == stagedPlanHash
  }

  private func recordCommitReceipt(_ payload: [String: Any]) {
    mutateStatus { status in
      status["latestCommitReceipt"] = [
        "sessionId": self.stringValue(payload["sessionId"]) ?? "",
        "planHash": self.stringValue(payload["planHash"]) ?? "",
        "commitId": self.stringValue(payload["commitId"]) ?? "",
        "committedAt": self.stringValue(payload["committedAt"]) ?? "",
        "watchState": self.stringValue(payload["watchState"]) ?? "",
        "matchesStagedPlan": self.matchesStagedPlan(payload, status: status),
      ]
    }
  }

  private func recordStatusSnapshot(_ payload: [String: Any]) {
    mutateStatus { status in
      var snapshot: [String: Any] = [
        "sessionId": self.stringValue(payload["sessionId"]) ?? "",
        "planHash": self.stringValue(payload["planHash"]) ?? "",
        "watchState": self.stringValue(payload["watchState"]) ?? "",
        "packageId": self.stringValue(payload["packageId"]) ?? "",
        "packageHash": self.stringValue(payload["packageHash"]) ?? "",
        "createdAt": self.stringValue(payload["createdAt"]) ?? "",
        "matchesStagedPlan": self.matchesStagedPlan(payload, status: status),
      ]
      if let packageTransfer = payload["packageTransfer"] as? [String: Any] {
        snapshot["packageTransfer"] = self.propertyListDictionary(packageTransfer)
        status["latestPackageTransfer"] = self.propertyListDictionary(packageTransfer)
      }
      if let staleIgnoredSummary = self.stringValue(payload["staleIgnoredSummary"]) {
        snapshot["watchStaleIgnoredSummary"] = staleIgnoredSummary
      }
      if let staleIgnoredCount = payload["staleIgnoredCount"] as? NSNumber {
        snapshot["watchStaleIgnoredCount"] = staleIgnoredCount
      }
      if let duplicateIgnoredCount = payload["duplicateIgnoredCount"] as? NSNumber {
        snapshot["watchDuplicateIgnoredCount"] = duplicateIgnoredCount
      }
      if let autoReply = payload["autoReply"] as? NSNumber {
        snapshot["autoReply"] = autoReply
      } else if let autoReply = payload["autoReply"] as? Bool {
        snapshot["autoReply"] = autoReply
      }
      status["latestStatusSnapshot"] = snapshot
    }
  }

  private func recordPackageManifest(_ payload: [String: Any], receivedAt: String) {
    mutateStatus { status in
      status["latestPackageManifest"] = [
        "sessionId": self.stringValue(payload["sessionId"]) ?? "",
        "planHash": self.stringValue(payload["planHash"]) ?? "",
        "packageId": self.stringValue(payload["packageId"]) ?? "",
        "packageHash": self.stringValue(payload["packageHash"]) ?? "",
        "receivedAt": receivedAt,
        "matchesStagedPlan": self.matchesStagedPlan(payload, status: status),
      ]
    }
  }

  private func recordPackageFileIfFresh(_ packageFile: ReceivedPackageFile) -> Bool {
    let payload = packageFile.metadata
    let messageId = stringValue(payload["messageId"]) ?? stringValue(payload["idempotencyKey"])
    var didRecord = true

    mutateStatus { status in
      if let messageId {
        var recentIds = status["recentIncomingMessageIds"] as? [String] ?? []
        let latestPackageFile = status["latestPackageFile"] as? [String: Any]
        let latestPackageFileMessageId = self.stringValue(latestPackageFile?["messageId"])

        if recentIds.contains(messageId), latestPackageFileMessageId == messageId {
          didRecord = false
          let duplicateCount = ((status["duplicateIgnoredCount"] as? NSNumber)?.intValue ?? 0) + 1
          status["duplicateIgnoredCount"] = duplicateCount
          status["latestIgnoredDuplicate"] = [
            "messageType": self.stringValue(payload["messageType"]) ?? "unknown",
            "messageId": messageId,
            "ignoredAt": self.nowString(),
          ]
          status["lastMessageType"] =
            "\(self.stringValue(payload["messageType"]) ?? "unknown").duplicate.ignored"
          status["lastMessageAt"] = self.nowString()
          return
        }

        if !recentIds.contains(messageId) {
          recentIds.append(messageId)
          if recentIds.count > Self.recentIncomingMessageIdLimit {
            recentIds.removeFirst(recentIds.count - Self.recentIncomingMessageIdLimit)
          }
          status["recentIncomingMessageIds"] = recentIds
        }
      }

      let record: [String: Any] = [
        "sessionId": self.stringValue(payload["sessionId"]) ?? "",
        "planHash": self.stringValue(payload["planHash"]) ?? "",
        "packageId": self.stringValue(payload["packageId"]) ?? "",
        "packageHash": self.stringValue(payload["packageHash"]) ?? "",
        "messageId": messageId ?? "",
        "receivedAt": packageFile.receivedAt,
        "fileByteCount": packageFile.fileByteCount,
        "sourceExistsBeforeCopy": packageFile.sourceExistsBeforeCopy,
        "persisted": true,
        "hashVerification": packageFile.hashVerification,
        "matchesStagedPlan": self.matchesStagedPlan(payload, status: status),
      ]
      status["latestReceivedPackage"] = record
      status["latestPackageFile"] = record
      status["lastMessageType"] =
        self.stringValue(payload["messageType"]) ?? "lucidtlr.watch.package.file"
      status["lastMessageAt"] = self.stringValue(payload["createdAt"]) ?? packageFile.receivedAt
      status.removeValue(forKey: "lastError")
      self.defaults.set(packageFile.targetPath, forKey: self.packageFilePathKey)
    }

    return didRecord
  }

  private func recordPackageFileReceiveFailure(
    metadata: [String: Any],
    receivedAt: String,
    sourceExistsBeforeCopy: Bool,
    errorMessage: String,
    hashVerification: String
  ) {
    mutateStatus { status in
      status["latestPackageFile"] = [
        "sessionId": self.stringValue(metadata["sessionId"]) ?? "",
        "planHash": self.stringValue(metadata["planHash"]) ?? "",
        "packageId": self.stringValue(metadata["packageId"]) ?? "",
        "packageHash": self.stringValue(metadata["packageHash"]) ?? "",
        "receivedAt": receivedAt,
        "sourceExistsBeforeCopy": sourceExistsBeforeCopy,
        "persisted": false,
        "errorMessage": errorMessage,
        "hashVerification": hashVerification,
      ]
      status["lastError"] = errorMessage
      status["lastMessageType"] = "lucidtlr.watch.transport.error"
      status["lastMessageAt"] = receivedAt
    }
  }

  private func recordAck(_ payload: [String: Any]) {
    mutateStatus { status in
      status["latestAck"] = [
        "sessionId": self.stringValue(payload["sessionId"]) ?? "",
        "planHash": self.stringValue(payload["planHash"]) ?? "",
        "packageId": self.stringValue(payload["packageId"]) ?? "",
        "packageHash": self.stringValue(payload["packageHash"]) ?? "",
        "ackedAt": self.stringValue(payload["ackedAt"]) ?? self.stringValue(payload["createdAt"]) ?? "",
        "matchesStagedPlan": self.matchesStagedPlan(payload, status: status),
      ]
    }
  }

  private func handleIncoming(_ rawPayload: [String: Any]) {
    let payload = propertyListDictionary(rawPayload)
    let type = stringValue(payload["messageType"]) ?? "unknown"
    let receivedAt = nowString()

    if noteIncomingMessageIdAndDetectDuplicate(from: payload) {
      return
    }

    switch type {
    case "lucidtlr.watch.plan.commit.receipt":
      recordCommitReceipt(payload)
    case "lucidtlr.watch.status.snapshot":
      recordStatusSnapshot(payload)
    case "lucidtlr.watch.package.manifest":
      recordPackageManifest(payload, receivedAt: receivedAt)
    case "lucidtlr.watch.package.ack":
      recordAck(payload)
    case "lucidtlr.watch.transport.error":
      recordError(stringValue(payload["errorMessage"]) ?? "Watch transport error.")
    default:
      break
    }

    recordLastMessage(type: type, at: stringValue(payload["createdAt"]) ?? receivedAt)
  }

#if targetEnvironment(simulator)
  private static let simulatorTransportRootCandidates = [
    URL(fileURLWithPath: "/tmp/lucidtlr-sim-transport", isDirectory: true),
    URL(fileURLWithPath: "/private/tmp/lucidtlr-sim-transport", isDirectory: true),
    URL(fileURLWithPath: "/Users/Shared/lucidtlr-sim-transport", isDirectory: true),
  ]

  private func startSimulatorTransportShimIfNeeded() {
    guard simulatorTransportDrainTimer == nil else {
      return
    }

    do {
      try ensureSimulatorTransportDirectories()
    } catch {
      recordError("Simulator transport shim unavailable: \(error.localizedDescription)")
    }

    let timer = DispatchSource.makeTimerSource(queue: queue)
    timer.schedule(deadline: .now() + 0.2, repeating: 1.0)
    timer.setEventHandler { [weak self] in
      self?.drainSimulatorTransportInbox()
    }
    simulatorTransportDrainTimer = timer
    timer.resume()
  }

  private func writeSimulatorTransportUserInfo(_ payload: [String: Any], to inboxName: String) {
    do {
      let inbox = try simulatorTransportInboxDirectory(inboxName)
      let fileURL = inbox.appendingPathComponent(
        "\(nextSimulatorTransportEpochMillis())-\(simulatorTransportSafeMessageId(from: payload)).userinfo.json"
      )
      try writeSimulatorTransportDictionary(payload, to: fileURL)
    } catch {
      recordError("Simulator transport shim userInfo write failed: \(error.localizedDescription)")
    }
  }

  private func drainSimulatorTransportInbox() {
    do {
      let inbox = try simulatorTransportInboxDirectory("to-phone")
      let files = try FileManager.default.contentsOfDirectory(
        at: inbox,
        includingPropertiesForKeys: [.isRegularFileKey],
        options: [.skipsHiddenFiles]
      )
        .filter { simulatorTransportIsRegularFile($0) }
        .sorted { $0.lastPathComponent < $1.lastPathComponent }

      for fileURL in files {
        let fileName = fileURL.lastPathComponent

        if fileName.hasSuffix(".userinfo.json") {
          do {
            handleIncoming(try simulatorTransportDictionary(from: fileURL))
          } catch {
            recordError("Simulator transport shim skipped malformed userInfo \(fileName): \(error.localizedDescription)")
          }
          consumeSimulatorTransportFile(fileURL)
          continue
        }

        if fileName.hasSuffix(".filemeta.json") {
          let packageFileName = fileName.replacingOccurrences(
            of: ".filemeta.json",
            with: ".package.json"
          )
          let packageURL = inbox.appendingPathComponent(packageFileName)

          do {
            guard FileManager.default.fileExists(atPath: packageURL.path) else {
              throw simulatorTransportError("missing package file \(packageFileName)")
            }

            let metadata = try simulatorTransportDictionary(from: fileURL)
            handleReceivedPackageFile(fileURL: packageURL, metadata: metadata)
          } catch {
            recordError("Simulator transport shim skipped malformed file transfer \(fileName): \(error.localizedDescription)")
          }
          consumeSimulatorTransportFile(fileURL)
          consumeSimulatorTransportFile(packageURL)
        }
      }
    } catch {
      recordError("Simulator transport shim drain failed: \(error.localizedDescription)")
    }
  }

  private func ensureSimulatorTransportDirectories() throws {
    _ = try simulatorTransportRootDirectory()
  }

  private func simulatorTransportRootDirectory() throws -> URL {
    var failures: [String] = []

    for root in Self.simulatorTransportRootCandidates {
      do {
        try createAndProbeSimulatorTransportRoot(root)
        return root
      } catch {
        failures.append("\(root.path): \(error.localizedDescription)")
      }
    }

    throw simulatorTransportError(
      "no writable shared simulator transport directory (\(failures.joined(separator: "; ")))"
    )
  }

  private func createAndProbeSimulatorTransportRoot(_ root: URL) throws {
    let fileManager = FileManager.default

    for child in ["to-phone", "to-watch", "consumed"] {
      try fileManager.createDirectory(
        at: root.appendingPathComponent(child, isDirectory: true),
        withIntermediateDirectories: true,
        attributes: nil
      )
    }

    let probe = root
      .appendingPathComponent("consumed", isDirectory: true)
      .appendingPathComponent(".phone-probe-\(UUID().uuidString)")
    try Data("ok".utf8).write(to: probe, options: [.atomic])
    try fileManager.removeItem(at: probe)
  }

  private func simulatorTransportInboxDirectory(_ inboxName: String) throws -> URL {
    try simulatorTransportRootDirectory()
      .appendingPathComponent(inboxName, isDirectory: true)
  }

  private func simulatorTransportConsumedDirectory() throws -> URL {
    try simulatorTransportRootDirectory()
      .appendingPathComponent("consumed", isDirectory: true)
  }

  private func nextSimulatorTransportEpochMillis() -> Int64 {
    let now = Int64((Date().timeIntervalSince1970 * 1000).rounded(.down))
    let next = max(now, simulatorTransportLastEpochMillis + 1)
    simulatorTransportLastEpochMillis = next
    return next
  }

  private func simulatorTransportSafeMessageId(from payload: [String: Any]) -> String {
    let raw = stringValue(payload["messageId"]) ??
      stringValue(payload["idempotencyKey"]) ??
      UUID().uuidString
    let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_."))
    let safe = raw.unicodeScalars
      .map { allowed.contains($0) ? String($0) : "-" }
      .joined()
    if safe.isEmpty {
      return UUID().uuidString
    }
    if safe.count <= 96 {
      return safe
    }
    return "\(safe.prefix(48))-\(Self.sha256Hex(raw).prefix(24))"
  }

  private func writeSimulatorTransportDictionary(_ dictionary: [String: Any], to url: URL) throws {
    let data = try JSONSerialization.data(
      withJSONObject: propertyListDictionary(dictionary),
      options: [.sortedKeys]
    )
    try data.write(to: url, options: [.atomic])
  }

  private func simulatorTransportDictionary(from url: URL) throws -> [String: Any] {
    let object = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
    guard let dictionary = object as? [String: Any] else {
      throw simulatorTransportError("JSON root is not a dictionary")
    }
    return propertyListDictionary(dictionary)
  }

  private func consumeSimulatorTransportFile(_ url: URL) {
    guard FileManager.default.fileExists(atPath: url.path) else {
      return
    }

    do {
      let consumed = try simulatorTransportConsumedDirectory()
      let destination = consumed.appendingPathComponent(url.lastPathComponent)
      if FileManager.default.fileExists(atPath: destination.path) {
        try FileManager.default.removeItem(at: destination)
      }
      try FileManager.default.moveItem(at: url, to: destination)
    } catch {
      do {
        try FileManager.default.removeItem(at: url)
      } catch {
        recordError("Simulator transport shim could not consume \(url.lastPathComponent): \(error.localizedDescription)")
      }
    }
  }

  private func simulatorTransportIsRegularFile(_ url: URL) -> Bool {
    (try? url.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) ?? false
  }

  private func simulatorTransportError(_ message: String) -> NSError {
    NSError(
      domain: "LucidTLRSimulatorTransportShim",
      code: 1,
      userInfo: [NSLocalizedDescriptionKey: message]
    )
  }
#endif

  private func propertyListMessage(from dictionary: NSDictionary) -> [String: Any] {
    propertyListDictionary(dictionary as? [String: Any] ?? [:])
  }

  private func propertyListDictionary(_ dictionary: [String: Any]) -> [String: Any] {
    var result: [String: Any] = [:]

    for (key, value) in dictionary {
      if let string = value as? String {
        result[key] = string
      } else if let number = value as? NSNumber {
        result[key] = number
      } else if let bool = value as? Bool {
        result[key] = bool
      } else if let nested = value as? [String: Any] {
        result[key] = propertyListDictionary(nested)
      } else if let array = value as? [Any] {
        result[key] = propertyListArray(array)
      }
    }

    return result
  }

  private func propertyListArray(_ array: [Any]) -> [Any] {
    array.compactMap { value in
      if let string = value as? String {
        return string
      }
      if let number = value as? NSNumber {
        return number
      }
      if let bool = value as? Bool {
        return bool
      }
      if let nested = value as? [String: Any] {
        return propertyListDictionary(nested)
      }
      if let nestedArray = value as? [Any] {
        return propertyListArray(nestedArray)
      }
      return nil
    }
  }

  private func attemptPersistReceivedPackageFile(
    fileURL: URL,
    metadata rawMetadata: [String: Any]
  ) -> Result<ReceivedPackageFile, PackageFileReceiveFailure> {
    let metadata = propertyListDictionary(rawMetadata)
    let sourceExistsBeforeCopy = FileManager.default.fileExists(atPath: fileURL.path)
    let receivedAt = Self.immediateNowString()

    do {
      let targetURL = try receivedPackageURL(
        packageId: stringValue(metadata["packageId"]) ?? "unknown-package"
      )

      if FileManager.default.fileExists(atPath: targetURL.path) {
        try FileManager.default.removeItem(at: targetURL)
      }

      try FileManager.default.copyItem(at: fileURL, to: targetURL)
      try? FileManager.default.setAttributes(
        [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
        ofItemAtPath: targetURL.path
      )

      // Receive-boundary content verification: a truncated or corrupt
      // transfer must surface here as a transport diagnostic, not later
      // during import. The file is removed so it can never be surfaced as
      // the latest received package.
      if let verificationFailure = verifyReceivedPackageFile(
        at: targetURL,
        expectedPackageId: stringValue(metadata["packageId"]),
        expectedPackageHash: stringValue(metadata["packageHash"])
      ) {
        try? FileManager.default.removeItem(at: targetURL)
        return .failure(
          PackageFileReceiveFailure(
            metadata: metadata,
            receivedAt: receivedAt,
            sourceExistsBeforeCopy: sourceExistsBeforeCopy,
            errorMessage: "Received package failed receive-boundary hash verification: \(verificationFailure)",
            hashVerification: "failed: \(verificationFailure)"
          )
        )
      }

      return .success(
        ReceivedPackageFile(
          metadata: metadata,
          targetPath: targetURL.path,
          receivedAt: receivedAt,
          fileByteCount: try fileByteCount(at: targetURL),
          sourceExistsBeforeCopy: sourceExistsBeforeCopy,
          hashVerification: Self.hashVerifiedLabel
        )
      )
    } catch {
      return .failure(
        PackageFileReceiveFailure(
          metadata: metadata,
          receivedAt: receivedAt,
          sourceExistsBeforeCopy: sourceExistsBeforeCopy,
          errorMessage: "Package file receive failed before queued status update: \(error.localizedDescription)",
          hashVerification: "not-verified: receive failed before verification"
        )
      )
    }
  }

  /// Verifies the received synthetic package at the transport boundary:
  /// metadata identity vs manifest, per-file sha256/byteLength entries, and
  /// the canonical-JSON manifest packageHash (the same SHA-256 scheme used by
  /// the Watch `WatchTransportPackageBuilder`). Returns nil when verified, or
  /// a failure reason string.
  private func verifyReceivedPackageFile(
    at url: URL,
    expectedPackageId: String?,
    expectedPackageHash: String?
  ) -> String? {
    let object: Any
    do {
      object = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
    } catch {
      return "package file is not valid JSON (possible truncated transfer): \(error.localizedDescription)"
    }

    guard let package = object as? [String: Any],
      let manifest = package["manifest"] as? [String: Any],
      let files = package["files"] as? [[String: Any]] else {
      return "package file is missing manifest/files structure"
    }

    guard let manifestPackageHash = manifest["packageHash"] as? String,
      let manifestPackageId = manifest["packageId"] as? String else {
      return "manifest is missing packageId/packageHash"
    }

    if let expectedPackageId, expectedPackageId != manifestPackageId {
      return "metadata packageId \(expectedPackageId) does not match manifest packageId \(manifestPackageId)"
    }

    if let expectedPackageHash, expectedPackageHash != manifestPackageHash {
      return "metadata packageHash does not match manifest packageHash"
    }

    guard let manifestFileEntries = manifest["files"] as? [[String: Any]] else {
      return "manifest is missing file entries"
    }

    var payloadByPath: [String: String] = [:]
    for filePayload in files {
      guard let relativePath = filePayload["relativePath"] as? String,
        let contents = filePayload["contents"] as? String else {
        return "package file payload entry is malformed"
      }

      payloadByPath[relativePath] = contents
    }

    for entry in manifestFileEntries {
      guard let relativePath = entry["relativePath"] as? String,
        let expectedSha256 = entry["sha256"] as? String,
        let expectedByteLength = (entry["byteLength"] as? NSNumber)?.intValue else {
        return "manifest file entry is malformed"
      }

      guard let contents = payloadByPath[relativePath] else {
        return "package is missing file payload for \(relativePath)"
      }

      if Array(contents.utf8).count != expectedByteLength {
        return "byteLength mismatch for \(relativePath)"
      }

      if Self.sha256Hex(contents) != expectedSha256 {
        return "sha256 mismatch for \(relativePath)"
      }
    }

    let recomputedPackageHash = Self.sha256Hex(
      Self.canonicalJSONString(manifest, ignoredKeys: ["packageHash"])
    )

    if recomputedPackageHash != manifestPackageHash {
      return "canonical manifest hash mismatch: expected \(manifestPackageHash), recomputed \(recomputedPackageHash)"
    }

    return nil
  }

  private func fileByteCount(at url: URL) throws -> Int {
    let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
    return (attributes[.size] as? NSNumber)?.intValue ?? 0
  }

  /// Received unacked packages are stored under Application Support rather
  /// than Caches: iOS may purge Caches under storage pressure, and the
  /// received file is the phone's only pre-import copy.
  private func receivedPackageURL(packageId: String) throws -> URL {
    let applicationSupport = try FileManager.default.url(
      for: .applicationSupportDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: true
    )
    let directory = applicationSupport.appendingPathComponent(
      "LucidTLRWatchTransportLab/ReceivedPackages",
      isDirectory: true
    )
    try FileManager.default.createDirectory(
      at: directory,
      withIntermediateDirectories: true,
      attributes: nil
    )
    let safePackageId = packageId.replacingOccurrences(of: "/", with: "-")
    return directory.appendingPathComponent("\(safePackageId).json")
  }

  // MARK: - Canonical hashing (matches Watch WatchTransportPackageBuilder)

  private static func canonicalJSONString(
    _ value: Any,
    ignoredKeys: Set<String> = []
  ) -> String {
    if value is NSNull {
      return "null"
    }

    if let string = value as? String {
      return jsonStringLiteral(string)
    }

    if let number = value as? NSNumber {
      if CFGetTypeID(number) == CFBooleanGetTypeID() {
        return number.boolValue ? "true" : "false"
      }

      return numberString(number)
    }

    if let array = value as? [Any] {
      return "[\(array.map { canonicalJSONString($0, ignoredKeys: ignoredKeys) }.joined(separator: ","))]"
    }

    if let dictionary = value as? [String: Any] {
      let entries = dictionary.keys
        .filter { !ignoredKeys.contains($0) }
        .sorted()
        .map { key in
          "\(jsonStringLiteral(key)):\(canonicalJSONString(dictionary[key] as Any, ignoredKeys: ignoredKeys))"
        }
      return "{\(entries.joined(separator: ","))}"
    }

    return "null"
  }

  private static func jsonStringLiteral(_ value: String) -> String {
    guard let data = try? JSONSerialization.data(withJSONObject: [value]),
      let encoded = String(data: data, encoding: .utf8),
      encoded.count >= 2 else {
      return "\"\""
    }

    return String(encoded.dropFirst().dropLast())
  }

  private static func numberString(_ value: NSNumber) -> String {
    let doubleValue = value.doubleValue

    if doubleValue.rounded() == doubleValue {
      return "\(Int64(doubleValue))"
    }

    return "\(doubleValue)"
  }

  private static func sha256Hex(_ value: String) -> String {
    let digest = SHA256.hash(data: Data(value.utf8))
    return digest.map { String(format: "%02x", $0) }.joined()
  }

  private func activationStateLabel(_ state: WCSessionActivationState) -> String {
    switch state {
    case .activated:
      return "activated"
    case .inactive:
      return "inactive"
    case .notActivated:
      return "notActivated"
    @unknown default:
      return "unknown"
    }
  }

  private func stringValue(_ value: Any?) -> String? {
    value as? String
  }

  private func nowString() -> String {
    isoFormatter.string(from: Date())
  }

  private static func immediateNowString() -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: Date())
  }
}
