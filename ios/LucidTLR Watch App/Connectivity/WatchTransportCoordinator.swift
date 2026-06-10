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
    latestPackageTransfer: nil,
    latestStaleIgnoredSummary: nil,
    staleIgnoredCount: 0,
    duplicateIgnoredCount: 0
  )

  private let defaults = UserDefaults.standard
  private let stateQueue = DispatchQueue(label: "com.lucidtlr.watch-transport-lab.state")
  private let stateKey = "lucidtlr.watchTransportLab.state.v2"
  private let legacyScatteredStateKeys = [
    "lucidtlr.watchTransportLab.stagedPlanJson.v1",
    "lucidtlr.watchTransportLab.stagedPlanReceivedAt.v1",
    "lucidtlr.watchTransportLab.latestAckSessionId.v1",
    "lucidtlr.watchTransportLab.latestAckPlanHash.v1",
    "lucidtlr.watchTransportLab.latestAckPackageId.v1",
    "lucidtlr.watchTransportLab.latestAckPackageHash.v1",
    "lucidtlr.watchTransportLab.latestAckedAt.v1",
    "lucidtlr.watchTransportLab.latestPackageTransferJson.v1",
    "lucidtlr.watchTransportLab.lastMessageType.v1",
    "lucidtlr.watchTransportLab.lastMessageAt.v1",
    "lucidtlr.watchTransportLab.latestCommitReceiptSessionId.v1",
    "lucidtlr.watchTransportLab.latestPackageId.v1",
    "lucidtlr.watchTransportLab.latestPackageHash.v1",
    "lucidtlr.watchTransportLab.latestAckRecorded.v1",
    "lucidtlr.watchTransportLab.lastError.v1",
  ]

  private override init() {
    super.init()
    stateQueue.sync {
      // The scattered v1 keys had no shared session epoch and allowed stale
      // old-session evidence to survive into a fresh baseline. They are
      // superseded by the single encoded v2 state and removed without
      // migration; this is synthetic lab state only.
      self.removeLegacyScatteredStateKeysOnQueue()
    }
    refreshStatus()
  }

  // MARK: - Public API

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
    syncReceivedApplicationContextStagedPlanIfPresent()
    publishStatus(from: readState())
  }

  func latestStagedPlan() throws -> WatchTransportStagedPlan? {
    syncReceivedApplicationContextStagedPlanIfPresent()
    return try persistedStagedPlan()
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
    mutateState { state in
      state.latestCommitReceiptSessionId = plan.sessionId
      state.lastMessageType = WatchTransportMessageType.planCommitReceipt.rawValue
      state.lastMessageAt = WatchRuntimeDateFormat.string(from: committedAt)
    }
  }

  func sendStatusSnapshot(
    sessionId: String?,
    planHash: String?,
    watchState: WatchRuntimeState,
    packageId: String?,
    packageHash: String?,
    createdAt: Date
  ) throws {
    let state = readState()
    let payload = WatchTransportMessageFactory.statusSnapshot(
      sessionId: sessionId,
      planHash: planHash,
      watchState: watchState,
      packageId: packageId,
      packageHash: packageHash,
      createdAt: createdAt,
      packageTransfer: state.latestPackageTransfer,
      staleIgnoredSummary: state.latestStaleIgnored?.summary,
      staleIgnoredCount: state.staleIgnoredCount,
      duplicateIgnoredCount: state.duplicateIgnoredCount
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
      from: readState().latestPackageTransfer ?? startingStatus,
      stage: "fileQueued",
      queuedAt: WatchRuntimeDateFormat.string(from: Date()),
      errorMessage: nil
    )
    mutateState { state in
      state.latestPackageTransfer = queuedStatus
      state.latestPackageId = package.manifest.packageId
      state.latestPackageHash = package.manifest.packageHash
      state.lastMessageType = WatchTransportMessageType.packageFile.rawValue
      state.lastMessageAt = WatchRuntimeDateFormat.string(from: createdAt)
    }
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
    guard let ack = readState().latestAck else {
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
    mutateState { state in
      state.latestAckRecorded = true
    }
    return true
  }

  func clearLabStatus() {
    stateQueue.sync {
      defaults.removeObject(forKey: stateKey)
      removeLegacyScatteredStateKeysOnQueue()
    }
    publishStatus(from: readState())
  }

  // MARK: - WCSessionDelegate

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

  // MARK: - Incoming messages

  private func handleIncoming(_ payload: [String: Any]) {
    let receivedAt = Date()
    let receivedAtString = WatchRuntimeDateFormat.string(from: receivedAt)
    let messageTypeRaw = payload["messageType"] as? String ?? "unknown"
    let incomingMessageId =
      (payload["messageId"] as? String) ?? (payload["idempotencyKey"] as? String)

    // plan.available is latest-wins applicationContext state. Older TestFlight
    // builds may still redeliver queued userInfo nudges, so plan.available is
    // deduplicated semantically in applyStagedPlan instead of counted as an
    // anomalous duplicate.
    let isExpectedRedundantPlanDelivery =
      messageTypeRaw == WatchTransportMessageType.planAvailable.rawValue

    if let incomingMessageId, !isExpectedRedundantPlanDelivery {
      let isDuplicate = mutateState { state -> Bool in
        if state.hasSeenIncomingMessageId(incomingMessageId) {
          state.duplicateIgnoredCount += 1
          state.lastMessageType = "\(messageTypeRaw).duplicate.ignored"
          state.lastMessageAt = receivedAtString
          return true
        }

        state.noteIncomingMessageId(incomingMessageId)
        return false
      }

      if isDuplicate {
        return
      }
    }

    do {
      if let stagedPlan = try WatchTransportMessageParser.stagedPlan(
        from: payload,
        receivedAt: receivedAt
      ) {
        let applied = applyStagedPlan(stagedPlan)
        if applied {
          recordLastMessage(type: WatchTransportMessageType.planAvailable.rawValue, at: receivedAt)
        }
        return
      }

      if let ack = WatchTransportMessageParser.ack(from: payload, receivedAt: receivedAt) {
        handleIncomingAck(ack, receivedAt: receivedAt)
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

  private func handleIncomingAck(_ ack: WatchTransportReceivedAck, receivedAt: Date) {
    let state = readState()
    let indexSessionId = (try? currentLabIndexEntry())?.activeSessionId

    // Session-epoch guard: an ack that matches neither the currently staged
    // plan nor the current Watch session index is stale old-session evidence.
    // It is logged and ignored instead of polluting the fresh epoch.
    if let stagedSessionId = state.stagedPlanSessionId ?? indexSessionId,
      ack.sessionId != stagedSessionId,
      ack.sessionId != indexSessionId {
      mutateState { mutable in
        mutable.noteStaleIgnored(
          messageType: WatchTransportMessageType.packageAck.rawValue,
          sessionId: ack.sessionId,
          planHash: ack.planHash,
          reason: "ack_for_stale_old_session",
          ignoredAt: WatchRuntimeDateFormat.string(from: receivedAt)
        )
      }
      return
    }

    mutateState { mutable in
      mutable.latestAck = ack
      mutable.latestAckRecorded = false
      mutable.lastMessageType = WatchTransportMessageType.packageAck.rawValue
      mutable.lastMessageAt = WatchRuntimeDateFormat.string(from: receivedAt)
    }

    do {
      try recordLatestAckIfMatches(rootDirectory: labRootDirectory())
    } catch {
      recordError("Received package ack but did not record it: \(error)")
    }
  }

  // MARK: - Staged plan (applicationContext is the source of truth)

  private func syncReceivedApplicationContextStagedPlanIfPresent() {
    guard WCSession.isSupported() else {
      return
    }

    let context = WCSession.default.receivedApplicationContext
    guard !context.isEmpty,
      let stagedPlan = try? WatchTransportMessageParser.stagedPlan(
        from: context,
        receivedAt: Date()
      ) else {
      return
    }

    applyStagedPlan(stagedPlan)
  }

  /// Applies a staged plan from any delivery path with latest-wins semantics.
  /// `updateApplicationContext` defines the current staged plan; a queued
  /// `transferUserInfo` plan nudge is ignored when it is stale by identity or
  /// by message `createdAt`.
  @discardableResult
  private func applyStagedPlan(_ stagedPlan: WatchTransportStagedPlan) -> Bool {
    mutateState { state -> Bool in
      if state.stagedPlanSessionId == stagedPlan.sessionId,
        state.stagedPlanHash == stagedPlan.planHash {
        // Same staged identity redelivered (context + queued nudge): no-op.
        return false
      }

      if let existingCreatedAt = state.stagedPlanMessageCreatedAt,
        let incomingCreatedAt = stagedPlan.messageCreatedAt,
        incomingCreatedAt < existingCreatedAt {
        state.noteStaleIgnored(
          messageType: WatchTransportMessageType.planAvailable.rawValue,
          sessionId: stagedPlan.sessionId,
          planHash: stagedPlan.planHash,
          reason: "stale_plan_nudge_older_than_current_staged_plan",
          ignoredAt: WatchRuntimeDateFormat.string(from: Date())
        )
        return false
      }

      // New staged plan epoch: reset the whole session-scoped state so old
      // package/ack/transfer evidence cannot survive into the fresh baseline.
      state.resetForNewStagedPlan()
      state.stagedPlanJson = Self.encodePlanJson(stagedPlan.plan)
      state.stagedPlanSessionId = stagedPlan.sessionId
      state.stagedPlanHash = stagedPlan.planHash
      state.stagedPlanMessageCreatedAt = stagedPlan.messageCreatedAt
      state.stagedPlanReceivedAt = stagedPlan.receivedAt
      return true
    }
  }

  private func persistedStagedPlan() throws -> WatchTransportStagedPlan? {
    let state = readState()
    guard let planJson = state.stagedPlanJson,
      let data = planJson.data(using: .utf8) else {
      return nil
    }

    let plan = try JSONDecoder().decode(WatchRuntimePlanV3.self, from: data)
    return WatchTransportStagedPlan(
      sessionId: plan.sessionId,
      planHash: plan.planHash,
      plan: plan,
      receivedAt: state.stagedPlanReceivedAt ?? "",
      messageCreatedAt: state.stagedPlanMessageCreatedAt
    )
  }

  private static func encodePlanJson(_ plan: WatchRuntimePlanV3) -> String? {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    guard let data = try? encoder.encode(plan) else {
      return nil
    }

    return String(decoding: data, as: UTF8.self)
  }

  // MARK: - Outbound transport

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
    return session.transferFile(fileURL, metadata: metadata)
  }

  // MARK: - Single atomic lab state

  private func readState() -> WatchTransportLabState {
    stateQueue.sync { loadStateOnQueue() }
  }

  @discardableResult
  private func mutateState<T>(_ mutate: (inout WatchTransportLabState) -> T) -> T {
    let (result, next): (T, WatchTransportLabState) = stateQueue.sync {
      var state = loadStateOnQueue()
      let original = state
      let result = mutate(&state)
      if state != original {
        saveStateOnQueue(state)
      }
      return (result, state)
    }
    publishStatus(from: next)
    return result
  }

  private func loadStateOnQueue() -> WatchTransportLabState {
    guard let json = defaults.string(forKey: stateKey),
      let data = json.data(using: .utf8),
      let state = try? JSONDecoder().decode(WatchTransportLabState.self, from: data),
      state.schemaVersion == WatchTransportLabState.currentSchemaVersion else {
      return WatchTransportLabState.empty(
        updatedAt: WatchRuntimeDateFormat.string(from: Date())
      )
    }

    return state
  }

  private func saveStateOnQueue(_ state: WatchTransportLabState) {
    var next = state
    next.updatedAt = WatchRuntimeDateFormat.string(from: Date())
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    guard let data = try? encoder.encode(next),
      let json = String(data: data, encoding: .utf8) else {
      return
    }

    defaults.set(json, forKey: stateKey)
  }

  private func removeLegacyScatteredStateKeysOnQueue() {
    for key in legacyScatteredStateKeys {
      defaults.removeObject(forKey: key)
    }
  }

  private func publishStatus(from state: WatchTransportLabState) {
    let session = WCSession.isSupported() ? WCSession.default : nil
    let next = WatchTransportStatusSnapshot(
      activationState: session.map { activationStateLabel($0.activationState) } ?? "unsupported",
      reachable: session?.isReachable ?? false,
      lastMessageType: state.lastMessageType,
      lastMessageAt: state.lastMessageAt,
      latestStagedPlanSessionId: state.stagedPlanSessionId,
      latestStagedPlanHash: state.stagedPlanHash,
      latestCommitReceiptSessionId: state.latestCommitReceiptSessionId,
      latestPackageId: state.latestPackageId,
      latestPackageHash: state.latestPackageHash,
      latestAckPackageId: state.latestAck?.packageId,
      latestAckRecorded: state.latestAckRecorded,
      lastError: state.lastError,
      latestPackageTransfer: state.latestPackageTransfer,
      latestStaleIgnoredSummary: state.latestStaleIgnored?.summary,
      staleIgnoredCount: state.staleIgnoredCount,
      duplicateIgnoredCount: state.duplicateIgnoredCount
    )

    DispatchQueue.main.async {
      self.status = next
    }
  }

  // MARK: - Package transfer diagnostics

  private func persistPackageTransferStatus(_ transferStatus: WatchTransportPackageTransferStatus) {
    mutateState { state in
      state.latestPackageTransfer = transferStatus
    }
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
    guard let latest = readState().latestPackageTransfer else {
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

  // MARK: - Shared helpers

  private func recordLastMessage(type: String, at: Date) {
    mutateState { state in
      state.lastMessageType = type
      state.lastMessageAt = WatchRuntimeDateFormat.string(from: at)
    }
  }

  private func recordError(_ message: String) {
    mutateState { state in
      state.lastError = message
      state.lastMessageType = WatchTransportMessageType.transportError.rawValue
      state.lastMessageAt = WatchRuntimeDateFormat.string(from: Date())
    }
  }

  private func currentLabIndexEntry() throws -> WatchCurrentSessionIndexEntry? {
    try WatchCurrentSessionIndex(rootDirectory: labRootDirectory()).load()
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
