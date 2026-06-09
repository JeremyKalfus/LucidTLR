import Combine
import Foundation
import WatchConnectivity

final class WatchTransportCoordinator: NSObject, ObservableObject, WCSessionDelegate {
  static let shared = WatchTransportCoordinator()

  @Published private(set) var status = WatchTransportStatusSnapshot(
    activationState: "notActivated",
    reachable: false,
    lastMessageType: nil,
    lastMessageAt: nil,
    latestStagedPlanSessionId: nil,
    latestStagedPlanHash: nil,
    latestCommitReceiptSessionId: nil,
    latestPackageId: nil,
    latestPackageHash: nil,
    latestAckPackageId: nil,
    latestAckRecorded: false,
    lastError: nil,
    latestPackageTransfer: nil
  )

  private let defaults = UserDefaults.standard
  private let stagedPlanJsonKey = "lucidtlr.watchTransportLab.stagedPlanJson.v1"
  private let stagedPlanReceivedAtKey = "lucidtlr.watchTransportLab.stagedPlanReceivedAt.v1"
  private let latestAckSessionIdKey = "lucidtlr.watchTransportLab.latestAckSessionId.v1"
  private let latestAckPlanHashKey = "lucidtlr.watchTransportLab.latestAckPlanHash.v1"
  private let latestAckPackageIdKey = "lucidtlr.watchTransportLab.latestAckPackageId.v1"
  private let latestAckPackageHashKey = "lucidtlr.watchTransportLab.latestAckPackageHash.v1"
  private let latestAckedAtKey = "lucidtlr.watchTransportLab.latestAckedAt.v1"
  private let latestPackageTransferJsonKey = "lucidtlr.watchTransportLab.latestPackageTransferJson.v1"

  private override init() {
    super.init()
    refreshStatus()
  }

  func activate() throws {
    guard WCSession.isSupported() else {
      throw WatchTransportError.watchConnectivityUnsupported
    }

    let session = WCSession.default
    session.delegate = self
    session.activate()
    recordLastMessage(type: "transport.activate", at: Date())
  }

  func refreshStatus() {
    let session = WCSession.isSupported() ? WCSession.default : nil
    try? syncReceivedApplicationContextStagedPlanIfPresent()
    let staged = try? persistedStagedPlan()
    let ack = latestReceivedAck()
    let next = WatchTransportStatusSnapshot(
      activationState: session.map { activationStateLabel($0.activationState) } ?? "unsupported",
      reachable: session?.isReachable ?? false,
      lastMessageType: defaults.string(forKey: "lucidtlr.watchTransportLab.lastMessageType.v1"),
      lastMessageAt: defaults.string(forKey: "lucidtlr.watchTransportLab.lastMessageAt.v1"),
      latestStagedPlanSessionId: staged?.sessionId,
      latestStagedPlanHash: staged?.planHash,
      latestCommitReceiptSessionId: defaults.string(forKey: "lucidtlr.watchTransportLab.latestCommitReceiptSessionId.v1"),
      latestPackageId: defaults.string(forKey: "lucidtlr.watchTransportLab.latestPackageId.v1"),
      latestPackageHash: defaults.string(forKey: "lucidtlr.watchTransportLab.latestPackageHash.v1"),
      latestAckPackageId: ack?.packageId,
      latestAckRecorded: defaults.bool(forKey: "lucidtlr.watchTransportLab.latestAckRecorded.v1"),
      lastError: defaults.string(forKey: "lucidtlr.watchTransportLab.lastError.v1"),
      latestPackageTransfer: latestPackageTransferStatus()
    )

    DispatchQueue.main.async {
      self.status = next
    }
  }

  func latestStagedPlan() throws -> WatchTransportStagedPlan? {
    try syncReceivedApplicationContextStagedPlanIfPresent()
    return try persistedStagedPlan()
  }

  private func persistedStagedPlan() throws -> WatchTransportStagedPlan? {
    guard let planJson = defaults.string(forKey: stagedPlanJsonKey),
      let data = planJson.data(using: .utf8) else {
      return nil
    }

    let plan = try JSONDecoder().decode(WatchRuntimePlanV3.self, from: data)
    return WatchTransportStagedPlan(
      sessionId: plan.sessionId,
      planHash: plan.planHash,
      plan: plan,
      receivedAt: defaults.string(forKey: stagedPlanReceivedAtKey) ?? ""
    )
  }

  private func syncReceivedApplicationContextStagedPlanIfPresent() throws {
    guard WCSession.isSupported() else {
      return
    }

    let context = WCSession.default.receivedApplicationContext
    guard !context.isEmpty,
      let stagedPlan = try WatchTransportMessageParser.stagedPlan(
        from: context,
        receivedAt: Date()
      ) else {
      return
    }

    try persist(stagedPlan, refreshAfterPersist: false)
  }

  func sendCommitReceipt(
    plan: WatchRuntimePlanV3,
    commitId: String,
    watchState: WatchRuntimeState,
    committedAt: Date
  ) throws {
    let payload = WatchTransportMessageFactory.commitReceipt(
      plan: plan,
      commitId: commitId,
      watchState: watchState,
      committedAt: committedAt
    )
    try transferUserInfo(payload)
    defaults.set(plan.sessionId, forKey: "lucidtlr.watchTransportLab.latestCommitReceiptSessionId.v1")
    recordLastMessage(type: WatchTransportMessageType.planCommitReceipt.rawValue, at: committedAt)
  }

  func sendStatusSnapshot(
    sessionId: String?,
    planHash: String?,
    watchState: WatchRuntimeState,
    packageId: String?,
    packageHash: String?,
    createdAt: Date
  ) throws {
    let latestTransfer = latestPackageTransferStatus()
    let payload = WatchTransportMessageFactory.statusSnapshot(
      sessionId: sessionId,
      planHash: planHash,
      watchState: watchState,
      packageId: packageId,
      packageHash: packageHash,
      createdAt: createdAt,
      packageTransfer: latestTransfer
    )
    try transferUserInfo(payload)
    recordLastMessage(type: WatchTransportMessageType.statusSnapshot.rawValue, at: createdAt)
  }

  func sendTransportError(
    errorCode: String,
    errorMessage: String,
    createdAt: Date
  ) throws {
    let payload = WatchTransportMessageFactory.transportError(
      errorCode: errorCode,
      errorMessage: errorMessage,
      createdAt: createdAt
    )
    recordError(errorMessage)
    try transferUserInfo(payload)
  }

  func transferPackage(
    package: WatchTransportSealedPackageV3,
    fileURL: URL,
    createdAt: Date
  ) throws {
    let manifestJson = try WatchTransportPackageBuilder.manifestJson(package.manifest)
    let fileByteCount = try packageFileByteCount(fileURL)
    let startedAt = WatchRuntimeDateFormat.string(from: createdAt)
    let attemptId = "watch-package-transfer-\(String(WatchRuntimeStructuralHash.placeholderHex("\(package.manifest.sessionId)|\(package.manifest.packageId)|\(startedAt)").prefix(24)))"
    let startingStatus = WatchTransportPackageTransferStatus(
      attemptId: attemptId,
      sessionId: package.manifest.sessionId,
      planHash: package.manifest.planHash,
      packageId: package.manifest.packageId,
      packageHash: package.manifest.packageHash,
      stage: "started",
      startedAt: startedAt,
      queuedAt: nil,
      finishedAt: nil,
      manifestJsonByteCount: Array(manifestJson.utf8).count,
      packageFileByteCount: fileByteCount,
      fileExists: FileManager.default.fileExists(atPath: fileURL.path),
      outstandingUserInfoTransferCount: outstandingUserInfoTransferCount(),
      outstandingFileTransferCount: outstandingFileTransferCount(),
      errorMessage: nil
    )
    persistPackageTransferStatus(startingStatus)

    let manifestPayload = WatchTransportMessageFactory.packageManifest(
      manifest: package.manifest,
      manifestJson: manifestJson,
      createdAt: createdAt
    )
    try transferUserInfo(manifestPayload)
    persistPackageTransferStatus(
      packageTransferStatus(
        from: startingStatus,
        stage: "manifestQueued",
        queuedAt: WatchRuntimeDateFormat.string(from: Date()),
        errorMessage: nil
      )
    )

    let metadata = WatchTransportMessageFactory.packageFileMetadata(
      manifest: package.manifest,
      createdAt: createdAt
    )
    _ = try transferFile(fileURL, metadata: metadata)
    let queuedStatus = packageTransferStatus(
      from: latestPackageTransferStatus() ?? startingStatus,
      stage: "fileQueued",
      queuedAt: WatchRuntimeDateFormat.string(from: Date()),
      errorMessage: nil
    )
    persistPackageTransferStatus(queuedStatus)
    defaults.set(package.manifest.packageId, forKey: "lucidtlr.watchTransportLab.latestPackageId.v1")
    defaults.set(package.manifest.packageHash, forKey: "lucidtlr.watchTransportLab.latestPackageHash.v1")
    recordLastMessage(type: WatchTransportMessageType.packageFile.rawValue, at: createdAt)
    try sendStatusSnapshot(
      sessionId: package.manifest.sessionId,
      planHash: package.manifest.planHash,
      watchState: .sealedWaitingForPhone,
      packageId: package.manifest.packageId,
      packageHash: package.manifest.packageHash,
      createdAt: Date()
    )
  }

  @discardableResult
  func recordLatestAckIfMatches(rootDirectory: URL) throws -> Bool {
    guard let ack = latestReceivedAck() else {
      return false
    }

    let index = WatchCurrentSessionIndex(rootDirectory: rootDirectory)
    guard let entry = try index.load() else {
      throw WatchTransportError.ackForUnknownPackage
    }

    guard entry.activeSessionId == ack.sessionId,
      entry.planHash == ack.planHash,
      entry.sealedPackageId == ack.packageId,
      entry.sealedPackageHash == ack.packageHash else {
      throw WatchTransportError.ackForUnknownPackage
    }

    let sessionStore = try WatchSessionDirectoryStore(
      rootDirectory: rootDirectory,
      sessionId: ack.sessionId
    )
    let ackDate = WatchRuntimeDateFormat.date(from: ack.ackedAt) ?? Date()
    try WatchPackageAckStore(sessionStore: sessionStore).recordAck(
      packageId: ack.packageId,
      packageHash: ack.packageHash,
      acknowledgedAt: ackDate
    )
    try index.recordAck(
      packageId: ack.packageId,
      packageHash: ack.packageHash,
      updatedAt: ackDate
    )
    defaults.set(true, forKey: "lucidtlr.watchTransportLab.latestAckRecorded.v1")
    refreshStatus()
    return true
  }

  func clearLabStatus() {
    for key in [
      stagedPlanJsonKey,
      stagedPlanReceivedAtKey,
      latestAckSessionIdKey,
      latestAckPlanHashKey,
      latestAckPackageIdKey,
      latestAckPackageHashKey,
      latestAckedAtKey,
      latestPackageTransferJsonKey,
      "lucidtlr.watchTransportLab.lastMessageType.v1",
      "lucidtlr.watchTransportLab.lastMessageAt.v1",
      "lucidtlr.watchTransportLab.latestCommitReceiptSessionId.v1",
      "lucidtlr.watchTransportLab.latestPackageId.v1",
      "lucidtlr.watchTransportLab.latestPackageHash.v1",
      "lucidtlr.watchTransportLab.latestAckRecorded.v1",
      "lucidtlr.watchTransportLab.lastError.v1",
    ] {
      defaults.removeObject(forKey: key)
    }
    refreshStatus()
  }

  func session(
    _ session: WCSession,
    activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {
    if let error {
      recordError("WCSession activation failed: \(error.localizedDescription)")
    }
    recordLastMessage(type: "transport.activation.\(activationStateLabel(activationState))", at: Date())
  }

  func sessionReachabilityDidChange(_ session: WCSession) {
    recordLastMessage(type: "transport.reachability.changed", at: Date())
  }

  func session(
    _ session: WCSession,
    didFinish userInfoTransfer: WCSessionUserInfoTransfer,
    error: Error?
  ) {
    guard let type = userInfoTransfer.userInfo["messageType"] as? String,
      type == WatchTransportMessageType.packageManifest.rawValue ||
        type == WatchTransportMessageType.statusSnapshot.rawValue else {
      return
    }

    if let error {
      recordError("Watch userInfo transfer failed for \(type): \(error.localizedDescription)")
      updateLatestPackageTransfer(
        stage: "\(type).failed",
        errorMessage: error.localizedDescription
      )
      return
    }

    updateLatestPackageTransfer(stage: "\(type).finished", errorMessage: nil)
  }

  func session(
    _ session: WCSession,
    didFinish fileTransfer: WCSessionFileTransfer,
    error: Error?
  ) {
    let metadata = fileTransfer.file.metadata ?? [:]
    guard let type = metadata["messageType"] as? String,
      type == WatchTransportMessageType.packageFile.rawValue else {
      return
    }

    if let error {
      recordError("Watch package file transfer failed: \(error.localizedDescription)")
      updateLatestPackageTransfer(
        stage: "packageFile.failed",
        errorMessage: error.localizedDescription
      )
      return
    }

    updateLatestPackageTransfer(stage: "packageFile.finished", errorMessage: nil)
  }

  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
    handleIncoming(userInfo)
  }

  func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
    handleIncoming(applicationContext)
  }

  private func handleIncoming(_ payload: [String: Any]) {
    let receivedAt = Date()

    do {
      if let stagedPlan = try WatchTransportMessageParser.stagedPlan(
        from: payload,
        receivedAt: receivedAt
      ) {
        try persist(stagedPlan)
        recordLastMessage(type: WatchTransportMessageType.planAvailable.rawValue, at: receivedAt)
        return
      }

      if let ack = WatchTransportMessageParser.ack(from: payload, receivedAt: receivedAt) {
        persist(ack)
        do {
          try recordLatestAckIfMatches(rootDirectory: labRootDirectory())
        } catch {
          recordError("Received package ack but did not record it: \(error)")
        }
        recordLastMessage(type: WatchTransportMessageType.packageAck.rawValue, at: receivedAt)
        return
      }

      if WatchTransportMessageParser.messageType(from: payload) == .planRequest {
        let stagedPlan = try? latestStagedPlan()
        let requestedSessionId = payload["sessionId"] as? String
        let requestedPlanHash = payload["planHash"] as? String
        try? sendStatusSnapshot(
          sessionId: requestedSessionId ?? stagedPlan?.sessionId,
          planHash: requestedPlanHash ?? stagedPlan?.planHash,
          watchState: .idle,
          packageId: nil,
          packageHash: nil,
          createdAt: receivedAt
        )
        recordLastMessage(type: WatchTransportMessageType.planRequest.rawValue, at: receivedAt)
        return
      }

      if let type = WatchTransportMessageParser.messageType(from: payload) {
        recordLastMessage(type: type.rawValue, at: receivedAt)
      }
    } catch {
      recordError("Incoming Watch transport message failed: \(error)")
    }
  }

  private func transferUserInfo(_ payload: [String: Any]) throws {
    guard WCSession.isSupported() else {
      throw WatchTransportError.watchConnectivityUnsupported
    }

    let session = WCSession.default
    if session.activationState == .notActivated {
      session.delegate = self
      session.activate()
    }
    session.transferUserInfo(payload)
    refreshStatus()
  }

  private func transferFile(_ fileURL: URL, metadata: [String: Any]) throws -> WCSessionFileTransfer {
    guard WCSession.isSupported() else {
      throw WatchTransportError.watchConnectivityUnsupported
    }

    let session = WCSession.default
    if session.activationState == .notActivated {
      session.delegate = self
      session.activate()
    }
    let transfer = session.transferFile(fileURL, metadata: metadata)
    refreshStatus()
    return transfer
  }

  private func persist(
    _ stagedPlan: WatchTransportStagedPlan,
    refreshAfterPersist: Bool = true
  ) throws {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    defaults.set(
      String(decoding: try encoder.encode(stagedPlan.plan), as: UTF8.self),
      forKey: stagedPlanJsonKey
    )
    defaults.set(stagedPlan.receivedAt, forKey: stagedPlanReceivedAtKey)
    if refreshAfterPersist {
      refreshStatus()
    }
  }

  private func persist(_ ack: WatchTransportReceivedAck) {
    defaults.set(ack.sessionId, forKey: latestAckSessionIdKey)
    defaults.set(ack.planHash, forKey: latestAckPlanHashKey)
    defaults.set(ack.packageId, forKey: latestAckPackageIdKey)
    defaults.set(ack.packageHash, forKey: latestAckPackageHashKey)
    defaults.set(ack.ackedAt, forKey: latestAckedAtKey)
    defaults.set(false, forKey: "lucidtlr.watchTransportLab.latestAckRecorded.v1")
    refreshStatus()
  }

  private func latestReceivedAck() -> WatchTransportReceivedAck? {
    guard let sessionId = defaults.string(forKey: latestAckSessionIdKey),
      let planHash = defaults.string(forKey: latestAckPlanHashKey),
      let packageId = defaults.string(forKey: latestAckPackageIdKey),
      let packageHash = defaults.string(forKey: latestAckPackageHashKey) else {
      return nil
    }

    return WatchTransportReceivedAck(
      sessionId: sessionId,
      planHash: planHash,
      packageId: packageId,
      packageHash: packageHash,
      ackedAt: defaults.string(forKey: latestAckedAtKey) ?? WatchRuntimeDateFormat.string(from: Date())
    )
  }

  private func latestPackageTransferStatus() -> WatchTransportPackageTransferStatus? {
    guard let json = defaults.string(forKey: latestPackageTransferJsonKey),
      let data = json.data(using: .utf8) else {
      return nil
    }

    return try? JSONDecoder().decode(WatchTransportPackageTransferStatus.self, from: data)
  }

  private func persistPackageTransferStatus(_ status: WatchTransportPackageTransferStatus) {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    if let data = try? encoder.encode(status),
      let json = String(data: data, encoding: .utf8) {
      defaults.set(json, forKey: latestPackageTransferJsonKey)
    }
    refreshStatus()
  }

  private func packageTransferStatus(
    from status: WatchTransportPackageTransferStatus,
    stage: String,
    queuedAt: String? = nil,
    finishedAt: String? = nil,
    errorMessage: String?
  ) -> WatchTransportPackageTransferStatus {
    WatchTransportPackageTransferStatus(
      attemptId: status.attemptId,
      sessionId: status.sessionId,
      planHash: status.planHash,
      packageId: status.packageId,
      packageHash: status.packageHash,
      stage: stage,
      startedAt: status.startedAt,
      queuedAt: queuedAt ?? status.queuedAt,
      finishedAt: finishedAt,
      manifestJsonByteCount: status.manifestJsonByteCount,
      packageFileByteCount: status.packageFileByteCount,
      fileExists: status.fileExists,
      outstandingUserInfoTransferCount: outstandingUserInfoTransferCount(),
      outstandingFileTransferCount: outstandingFileTransferCount(),
      errorMessage: errorMessage
    )
  }

  private func updateLatestPackageTransfer(stage: String, errorMessage: String?) {
    guard let latest = latestPackageTransferStatus() else {
      return
    }

    persistPackageTransferStatus(
      packageTransferStatus(
        from: latest,
        stage: stage,
        finishedAt: WatchRuntimeDateFormat.string(from: Date()),
        errorMessage: errorMessage
      )
    )
  }

  private func packageFileByteCount(_ fileURL: URL) throws -> Int {
    let attributes = try FileManager.default.attributesOfItem(atPath: fileURL.path)
    return attributes[.size] as? Int ?? 0
  }

  private func outstandingUserInfoTransferCount() -> Int {
    guard WCSession.isSupported() else {
      return 0
    }

    return WCSession.default.outstandingUserInfoTransfers.count
  }

  private func outstandingFileTransferCount() -> Int {
    guard WCSession.isSupported() else {
      return 0
    }

    return WCSession.default.outstandingFileTransfers.count
  }

  private func recordLastMessage(type: String, at: Date) {
    defaults.set(type, forKey: "lucidtlr.watchTransportLab.lastMessageType.v1")
    defaults.set(WatchRuntimeDateFormat.string(from: at), forKey: "lucidtlr.watchTransportLab.lastMessageAt.v1")
    refreshStatus()
  }

  private func recordError(_ message: String) {
    defaults.set(message, forKey: "lucidtlr.watchTransportLab.lastError.v1")
    defaults.set(WatchTransportMessageType.transportError.rawValue, forKey: "lucidtlr.watchTransportLab.lastMessageType.v1")
    defaults.set(WatchRuntimeDateFormat.string(from: Date()), forKey: "lucidtlr.watchTransportLab.lastMessageAt.v1")
    refreshStatus()
  }

  private func labRootDirectory() throws -> URL {
    let root = try WatchStoragePaths.defaultRootDirectory()
      .appendingPathComponent("WatchModeLabSynthetic", isDirectory: true)
    try FileManager.default.createDirectory(
      at: root,
      withIntermediateDirectories: true,
      attributes: nil
    )
    return root
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
}
