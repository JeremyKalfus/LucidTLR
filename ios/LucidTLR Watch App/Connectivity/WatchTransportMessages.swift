import Foundation

enum WatchTransportSchema {
  static let schemaVersion = "lucidtlr-watch-transport-lab-v1"
}

enum WatchTransportMessageType: String, CaseIterable {
  case planAvailable = "lucidtlr.watch.plan.available"
  case planRequest = "lucidtlr.watch.plan.request"
  case planFile = "lucidtlr.watch.plan.file"
  case planCommitReceipt = "lucidtlr.watch.plan.commit.receipt"
  case statusSnapshot = "lucidtlr.watch.status.snapshot"
  case packageManifest = "lucidtlr.watch.package.manifest"
  case packageFile = "lucidtlr.watch.package.file"
  case packageAck = "lucidtlr.watch.package.ack"
  case transportError = "lucidtlr.watch.transport.error"
}

enum WatchTransportSender: String {
  case phone
  case watch
}

struct WatchTransportStagedPlan: Equatable {
  let sessionId: String
  let planHash: String
  let plan: WatchRuntimePlanV3
  let receivedAt: String
  let messageCreatedAt: String?
}

struct WatchTransportReceivedAck: Codable, Equatable {
  let sessionId: String
  let planHash: String
  let packageId: String
  let packageHash: String
  let ackedAt: String
}

struct WatchTransportStaleIgnoredRecord: Codable, Equatable {
  let messageType: String
  let sessionId: String?
  let planHash: String?
  let reason: String
  let ignoredAt: String

  var summary: String {
    "\(messageType) for \(sessionId ?? "unknown-session") ignored: \(reason)"
  }
}

/// One atomic, session-scoped synthetic transport lab state for the Watch.
/// This replaces the previous scattered per-field UserDefaults keys so a newly
/// staged plan cannot coexist with stale old-session package/ack evidence.
struct WatchTransportLabState: Codable, Equatable {
  static let currentSchemaVersion = "watch-transport-lab-state-v2"
  static let recentIncomingMessageIdLimit = 64

  var schemaVersion: String
  var stagedPlanJson: String?
  var stagedPlanSessionId: String?
  var stagedPlanHash: String?
  var stagedPlanMessageCreatedAt: String?
  var stagedPlanReceivedAt: String?
  var latestCommitReceiptSessionId: String?
  var latestPackageId: String?
  var latestPackageHash: String?
  var latestPackageTransfer: WatchTransportPackageTransferStatus?
  var latestAck: WatchTransportReceivedAck?
  var latestAckRecorded: Bool
  var latestStaleIgnored: WatchTransportStaleIgnoredRecord?
  var staleIgnoredCount: Int
  var duplicateIgnoredCount: Int
  var recentIncomingMessageIds: [String]
  var lastMessageType: String?
  var lastMessageAt: String?
  var lastError: String?
  var updatedAt: String

  static func empty(updatedAt: String) -> WatchTransportLabState {
    WatchTransportLabState(
      schemaVersion: currentSchemaVersion,
      stagedPlanJson: nil,
      stagedPlanSessionId: nil,
      stagedPlanHash: nil,
      stagedPlanMessageCreatedAt: nil,
      stagedPlanReceivedAt: nil,
      latestCommitReceiptSessionId: nil,
      latestPackageId: nil,
      latestPackageHash: nil,
      latestPackageTransfer: nil,
      latestAck: nil,
      latestAckRecorded: false,
      latestStaleIgnored: nil,
      staleIgnoredCount: 0,
      duplicateIgnoredCount: 0,
      recentIncomingMessageIds: [],
      lastMessageType: nil,
      lastMessageAt: nil,
      lastError: nil,
      updatedAt: updatedAt
    )
  }

  func hasSeenIncomingMessageId(_ messageId: String) -> Bool {
    recentIncomingMessageIds.contains(messageId)
  }

  mutating func noteIncomingMessageId(_ messageId: String) {
    guard !recentIncomingMessageIds.contains(messageId) else {
      return
    }

    recentIncomingMessageIds.append(messageId)
    if recentIncomingMessageIds.count > Self.recentIncomingMessageIdLimit {
      recentIncomingMessageIds.removeFirst(
        recentIncomingMessageIds.count - Self.recentIncomingMessageIdLimit
      )
    }
  }

  mutating func noteStaleIgnored(
    messageType: String,
    sessionId: String?,
    planHash: String?,
    reason: String,
    ignoredAt: String
  ) {
    latestStaleIgnored = WatchTransportStaleIgnoredRecord(
      messageType: messageType,
      sessionId: sessionId,
      planHash: planHash,
      reason: reason,
      ignoredAt: ignoredAt
    )
    staleIgnoredCount += 1
    lastMessageType = "\(messageType).stale.ignored"
    lastMessageAt = ignoredAt
  }

  /// Reset the whole session-scoped epoch when the staged sessionId/planHash
  /// changes. The incoming-message dedup ring intentionally survives so queued
  /// old-session redeliveries are still ignored after the reset.
  mutating func resetForNewStagedPlan() {
    let preservedRing = recentIncomingMessageIds
    let preservedUpdatedAt = updatedAt
    self = WatchTransportLabState.empty(updatedAt: preservedUpdatedAt)
    recentIncomingMessageIds = preservedRing
  }
}

struct WatchTransportStatusSnapshot: Equatable {
  let activationState: String
  let reachable: Bool
  let lastMessageType: String?
  let lastMessageAt: String?
  let latestStagedPlanSessionId: String?
  let latestStagedPlanHash: String?
  let latestCommitReceiptSessionId: String?
  let latestPackageId: String?
  let latestPackageHash: String?
  let latestAckPackageId: String?
  let latestAckRecorded: Bool
  let lastError: String?
  let latestPackageTransfer: WatchTransportPackageTransferStatus?
  let latestStaleIgnoredSummary: String?
  let staleIgnoredCount: Int
  let duplicateIgnoredCount: Int
}

struct WatchTransportPackageTransferStatus: Codable, Equatable {
  let attemptId: String
  let sessionId: String
  let planHash: String
  let packageId: String
  let packageHash: String
  let stage: String
  let startedAt: String
  let queuedAt: String?
  let finishedAt: String?
  let manifestJsonByteCount: Int
  let packageFileByteCount: Int
  let fileExists: Bool
  let outstandingUserInfoTransferCount: Int
  let outstandingFileTransferCount: Int
  let errorMessage: String?

  var dictionary: [String: Any] {
    var payload: [String: Any] = [
      "attemptId": attemptId,
      "sessionId": sessionId,
      "planHash": planHash,
      "packageId": packageId,
      "packageHash": packageHash,
      "stage": stage,
      "startedAt": startedAt,
      "manifestJsonByteCount": manifestJsonByteCount,
      "packageFileByteCount": packageFileByteCount,
      "fileExists": fileExists,
      "outstandingUserInfoTransferCount": outstandingUserInfoTransferCount,
      "outstandingFileTransferCount": outstandingFileTransferCount,
    ]

    if let queuedAt {
      payload["queuedAt"] = queuedAt
    }
    if let finishedAt {
      payload["finishedAt"] = finishedAt
    }
    if let errorMessage {
      payload["errorMessage"] = errorMessage
    }

    return payload
  }
}

enum WatchTransportMessageFactory {
  static func base(
    type: WatchTransportMessageType,
    sender: WatchTransportSender,
    createdAt: Date,
    sessionId: String? = nil,
    planHash: String? = nil,
    packageId: String? = nil,
    packageHash: String? = nil
  ) -> [String: Any] {
    let createdAtString = WatchRuntimeDateFormat.string(from: createdAt)
    let seed = [
      WatchTransportSchema.schemaVersion,
      type.rawValue,
      sender.rawValue,
      sessionId ?? "no-session",
      planHash ?? "no-plan",
      packageId ?? "no-package",
      packageHash ?? "no-package-hash",
      createdAtString,
    ].joined(separator: "|")
    let messageId = "watch-transport-\(String(WatchRuntimeStructuralHash.placeholderHex(seed).prefix(24)))"

    var payload: [String: Any] = [
      "schemaVersion": WatchTransportSchema.schemaVersion,
      "messageType": type.rawValue,
      "messageId": messageId,
      "idempotencyKey": messageId,
      "createdAt": createdAtString,
      "sender": sender.rawValue,
    ]

    if let sessionId {
      payload["sessionId"] = sessionId
    }
    if let planHash {
      payload["planHash"] = planHash
    }
    if let packageId {
      payload["packageId"] = packageId
    }
    if let packageHash {
      payload["packageHash"] = packageHash
    }

    return payload
  }

  static func commitReceipt(
    plan: WatchRuntimePlanV3,
    commitId: String,
    watchState: WatchRuntimeState,
    committedAt: Date
  ) -> [String: Any] {
    var payload = base(
      type: .planCommitReceipt,
      sender: .watch,
      createdAt: committedAt,
      sessionId: plan.sessionId,
      planHash: plan.planHash
    )
    payload["commitId"] = commitId
    payload["committedAt"] = WatchRuntimeDateFormat.string(from: committedAt)
    payload["watchState"] = watchState.rawValue
    return payload
  }

  static func statusSnapshot(
    sessionId: String?,
    planHash: String?,
    watchState: WatchRuntimeState,
    packageId: String?,
    packageHash: String?,
    createdAt: Date,
    packageTransfer: WatchTransportPackageTransferStatus? = nil,
    staleIgnoredSummary: String? = nil,
    staleIgnoredCount: Int = 0,
    duplicateIgnoredCount: Int = 0
  ) -> [String: Any] {
    var payload = base(
      type: .statusSnapshot,
      sender: .watch,
      createdAt: createdAt,
      sessionId: sessionId,
      planHash: planHash,
      packageId: packageId,
      packageHash: packageHash
    )
    payload["watchState"] = watchState.rawValue
    if let packageTransfer {
      payload["packageTransfer"] = packageTransfer.dictionary
    }
    if let staleIgnoredSummary {
      payload["staleIgnoredSummary"] = staleIgnoredSummary
    }
    payload["staleIgnoredCount"] = staleIgnoredCount
    payload["duplicateIgnoredCount"] = duplicateIgnoredCount
    return payload
  }

  static func packageManifest(
    manifest: WatchPackageManifestV3,
    manifestJson: String,
    createdAt: Date
  ) -> [String: Any] {
    var payload = base(
      type: .packageManifest,
      sender: .watch,
      createdAt: createdAt,
      sessionId: manifest.sessionId,
      planHash: manifest.planHash,
      packageId: manifest.packageId,
      packageHash: manifest.packageHash
    )
    payload["manifestJson"] = manifestJson
    return payload
  }

  static func packageFileMetadata(
    manifest: WatchPackageManifestV3,
    createdAt: Date
  ) -> [String: Any] {
    base(
      type: .packageFile,
      sender: .watch,
      createdAt: createdAt,
      sessionId: manifest.sessionId,
      planHash: manifest.planHash,
      packageId: manifest.packageId,
      packageHash: manifest.packageHash
    )
  }

  static func transportError(
    errorCode: String,
    errorMessage: String,
    createdAt: Date
  ) -> [String: Any] {
    var payload = base(
      type: .transportError,
      sender: .watch,
      createdAt: createdAt
    )
    payload["errorCode"] = errorCode
    payload["errorMessage"] = errorMessage
    return payload
  }
}

enum WatchTransportMessageParser {
  static func messageType(from payload: [String: Any]) -> WatchTransportMessageType? {
    guard let rawValue = payload["messageType"] as? String else {
      return nil
    }

    return WatchTransportMessageType(rawValue: rawValue)
  }

  static func stagedPlan(from payload: [String: Any], receivedAt: Date) throws -> WatchTransportStagedPlan? {
    guard messageType(from: payload) == .planAvailable else {
      return nil
    }

    guard let planJson = payload["planJson"] as? String,
      let data = planJson.data(using: .utf8) else {
      throw WatchTransportError.invalidPlanPayload
    }

    let plan = try JSONDecoder().decode(WatchRuntimePlanV3.self, from: data)
    return WatchTransportStagedPlan(
      sessionId: plan.sessionId,
      planHash: plan.planHash,
      plan: plan,
      receivedAt: WatchRuntimeDateFormat.string(from: receivedAt),
      messageCreatedAt: payload["createdAt"] as? String
    )
  }

  static func ack(from payload: [String: Any], receivedAt: Date) -> WatchTransportReceivedAck? {
    guard messageType(from: payload) == .packageAck,
      let sessionId = payload["sessionId"] as? String,
      let planHash = payload["planHash"] as? String,
      let packageId = payload["packageId"] as? String,
      let packageHash = payload["packageHash"] as? String else {
      return nil
    }

    return WatchTransportReceivedAck(
      sessionId: sessionId,
      planHash: planHash,
      packageId: packageId,
      packageHash: packageHash,
      ackedAt: payload["ackedAt"] as? String ?? WatchRuntimeDateFormat.string(from: receivedAt)
    )
  }
}

enum WatchTransportError: Error, Equatable {
  case watchConnectivityUnsupported
  case invalidPlanPayload
  case noStagedPlan
  case noCommittedSession
  case noSealedPackage
  case packageHashMismatch
  case ackForUnknownPackage
}
