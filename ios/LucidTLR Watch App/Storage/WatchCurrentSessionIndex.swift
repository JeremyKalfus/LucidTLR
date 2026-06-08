import Foundation

enum WatchCurrentSessionIndexError: Error, Equatable {
  case activeUnackedSessionExists(sessionId: String)
  case explicitDiscardRequired
  case missingCurrentSession
  case ackDoesNotMatchPackage
}

struct WatchCurrentSessionIndexEntry: Codable, Equatable {
  let schemaVersion: String
  let activeSessionId: String
  let planHash: String
  let commitId: String
  let runtimeState: WatchRuntimeState
  let sealedPackageId: String?
  let sealedPackageHash: String?
  let ackRecorded: Bool
  let discardedAt: String?
  let updatedAt: String

  var isActiveUnacked: Bool {
    !ackRecorded && discardedAt == nil
  }
}

final class WatchCurrentSessionIndex {
  private let fileURL: URL
  private let fileManager: FileManager
  private let encoder: JSONEncoder
  private let decoder: JSONDecoder

  init(
    rootDirectory: URL,
    fileManager: FileManager = .default
  ) {
    self.fileURL = rootDirectory.appendingPathComponent(
      "current_session_index.json",
      isDirectory: false
    )
    self.fileManager = fileManager

    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    self.encoder = encoder
    self.decoder = JSONDecoder()
  }

  func load() throws -> WatchCurrentSessionIndexEntry? {
    guard fileManager.fileExists(atPath: fileURL.path) else {
      return nil
    }

    return try decoder.decode(
      WatchCurrentSessionIndexEntry.self,
      from: Data(contentsOf: fileURL)
    )
  }

  func requireCanStartSession(sessionId: String) throws {
    guard let entry = try load(), entry.isActiveUnacked else {
      return
    }

    guard entry.activeSessionId == sessionId else {
      throw WatchCurrentSessionIndexError.activeUnackedSessionExists(
        sessionId: entry.activeSessionId
      )
    }
  }

  func recordCommit(
    plan: WatchRuntimePlanV3,
    runtimeState: WatchRuntimeState,
    updatedAt: Date
  ) throws {
    try requireCanStartSession(sessionId: plan.sessionId)
    let updatedAtString = WatchRuntimeDateFormat.string(from: updatedAt)
    let commitHash = WatchRuntimeStructuralHash.placeholderHex(
      "current-session-index|\(plan.sessionId)|\(plan.planHash)|\(updatedAtString)"
    )
    let entry = WatchCurrentSessionIndexEntry(
      schemaVersion: "watch-current-session-index-v3",
      activeSessionId: plan.sessionId,
      planHash: plan.planHash,
      commitId: "watch-current-index-\(String(commitHash.prefix(24)))",
      runtimeState: runtimeState,
      sealedPackageId: nil,
      sealedPackageHash: nil,
      ackRecorded: false,
      discardedAt: nil,
      updatedAt: updatedAtString
    )
    try write(entry)
  }

  func recordRuntimeState(
    sessionId: String,
    runtimeState: WatchRuntimeState,
    updatedAt: Date
  ) throws {
    guard let entry = try load(), entry.activeSessionId == sessionId else {
      throw WatchCurrentSessionIndexError.missingCurrentSession
    }

    try write(
      WatchCurrentSessionIndexEntry(
        schemaVersion: entry.schemaVersion,
        activeSessionId: entry.activeSessionId,
        planHash: entry.planHash,
        commitId: entry.commitId,
        runtimeState: runtimeState,
        sealedPackageId: entry.sealedPackageId,
        sealedPackageHash: entry.sealedPackageHash,
        ackRecorded: entry.ackRecorded,
        discardedAt: entry.discardedAt,
        updatedAt: WatchRuntimeDateFormat.string(from: updatedAt)
      )
    )
  }

  func recordSealedPackage(
    manifest: WatchPackageManifestV3,
    runtimeState: WatchRuntimeState,
    updatedAt: Date
  ) throws {
    guard let entry = try load(), entry.activeSessionId == manifest.sessionId else {
      throw WatchCurrentSessionIndexError.missingCurrentSession
    }

    try write(
      WatchCurrentSessionIndexEntry(
        schemaVersion: entry.schemaVersion,
        activeSessionId: entry.activeSessionId,
        planHash: entry.planHash,
        commitId: entry.commitId,
        runtimeState: runtimeState,
        sealedPackageId: manifest.packageId,
        sealedPackageHash: manifest.packageHash,
        ackRecorded: false,
        discardedAt: entry.discardedAt,
        updatedAt: WatchRuntimeDateFormat.string(from: updatedAt)
      )
    )
  }

  func recordAck(
    packageId: String,
    packageHash: String,
    updatedAt: Date
  ) throws {
    guard let entry = try load() else {
      throw WatchCurrentSessionIndexError.missingCurrentSession
    }

    guard entry.sealedPackageId == packageId,
      entry.sealedPackageHash == packageHash else {
      throw WatchCurrentSessionIndexError.ackDoesNotMatchPackage
    }

    try write(
      WatchCurrentSessionIndexEntry(
        schemaVersion: entry.schemaVersion,
        activeSessionId: entry.activeSessionId,
        planHash: entry.planHash,
        commitId: entry.commitId,
        runtimeState: .importedAcknowledged,
        sealedPackageId: entry.sealedPackageId,
        sealedPackageHash: entry.sealedPackageHash,
        ackRecorded: true,
        discardedAt: entry.discardedAt,
        updatedAt: WatchRuntimeDateFormat.string(from: updatedAt)
      )
    )
  }

  func discardSyntheticLabSession(
    explicitConfirmation: Bool,
    discardedAt: Date
  ) throws {
    guard explicitConfirmation else {
      throw WatchCurrentSessionIndexError.explicitDiscardRequired
    }

    guard let entry = try load() else {
      throw WatchCurrentSessionIndexError.missingCurrentSession
    }

    try write(
      WatchCurrentSessionIndexEntry(
        schemaVersion: entry.schemaVersion,
        activeSessionId: entry.activeSessionId,
        planHash: entry.planHash,
        commitId: entry.commitId,
        runtimeState: entry.runtimeState,
        sealedPackageId: entry.sealedPackageId,
        sealedPackageHash: entry.sealedPackageHash,
        ackRecorded: entry.ackRecorded,
        discardedAt: WatchRuntimeDateFormat.string(from: discardedAt),
        updatedAt: WatchRuntimeDateFormat.string(from: discardedAt)
      )
    )
  }

  private func write(_ entry: WatchCurrentSessionIndexEntry) throws {
    try fileManager.createDirectory(
      at: fileURL.deletingLastPathComponent(),
      withIntermediateDirectories: true,
      attributes: nil
    )
    try encoder.encode(entry).write(to: fileURL, options: [.atomic])
  }
}
