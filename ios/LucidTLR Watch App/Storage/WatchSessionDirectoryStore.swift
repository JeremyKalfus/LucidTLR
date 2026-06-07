import Foundation

struct WatchSessionCommitV3: Codable, Equatable {
  let schemaVersion: String
  let sessionId: String
  let planHash: String
  let committedAt: String
  let commitId: String
}

enum WatchStoredSessionState: String, Codable, Equatable {
  case pendingUnsealed
  case sealedWaitingForAck
  case acknowledged
  case partialSeal
  case corrupted
}

struct WatchStoredSessionSummary: Equatable {
  let sessionId: String
  let sessionDirectory: URL
  let state: WatchStoredSessionState
}

final class WatchSessionDirectoryStore {
  let rootDirectory: URL
  let sessionId: String
  let sessionDirectory: URL
  let fileManager: FileManager

  private let encoder: JSONEncoder
  private let decoder: JSONDecoder

  init(
    rootDirectory: URL,
    sessionId: String,
    fileManager: FileManager = .default
  ) throws {
    let sessionDirectory = try WatchStoragePaths.sessionDirectory(
      rootDirectory: rootDirectory,
      sessionId: sessionId
    )
    self.rootDirectory = rootDirectory
    self.sessionId = sessionId
    self.sessionDirectory = sessionDirectory
    self.fileManager = fileManager

    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    self.encoder = encoder
    self.decoder = JSONDecoder()
  }

  func prepareSessionDirectory() throws {
    try fileManager.createDirectory(
      at: sessionDirectory,
      withIntermediateDirectories: true,
      attributes: nil
    )
    try ensureAppendOnlyLogFilesExist()
  }

  func persistCommittedPlan(_ plan: WatchRuntimePlanV3, committedAt: Date) throws {
    try prepareSessionDirectory()
    try writeJSONAtomically(plan, fileName: WatchStoragePaths.planFileName)

    let committedAtString = WatchRuntimeDateFormat.string(from: committedAt)
    let commitId = WatchRuntimeStructuralHash.placeholderHex(
      "watch-commit-v3|\(plan.sessionId)|\(plan.planHash)|\(committedAtString)"
    )
    let commit = WatchSessionCommitV3(
      schemaVersion: "watch-session-commit-v3",
      sessionId: plan.sessionId,
      planHash: plan.planHash,
      committedAt: committedAtString,
      commitId: "watch-commit-v3-\(String(commitId.prefix(24)))"
    )
    try writeJSONAtomically(commit, fileName: WatchStoragePaths.commitFileName)
  }

  func ensureAppendOnlyLogFilesExist() throws {
    for fileName in WatchStoragePaths.appendOnlyLogFileNames {
      let fileURL = url(for: fileName)
      if !fileManager.fileExists(atPath: fileURL.path) {
        fileManager.createFile(atPath: fileURL.path, contents: nil)
      }
    }
  }

  func appendJSONLine<T: Encodable>(_ value: T, fileName: String) throws {
    try prepareParentDirectory()
    let fileURL = url(for: fileName)
    if !fileManager.fileExists(atPath: fileURL.path) {
      fileManager.createFile(atPath: fileURL.path, contents: nil)
    }

    var data = try encoder.encode(value)
    data.append(0x0A)

    let handle = try FileHandle(forWritingTo: fileURL)
    handle.seekToEndOfFile()
    handle.write(data)
    handle.closeFile()
  }

  func readJSONLines<T: Decodable>(_ type: T.Type, fileName: String) throws -> [T] {
    let fileURL = url(for: fileName)
    guard fileManager.fileExists(atPath: fileURL.path) else {
      return []
    }

    let contents = try String(contentsOf: fileURL, encoding: .utf8)
    var values: [T] = []

    for (index, line) in contents.split(separator: "\n", omittingEmptySubsequences: true).enumerated() {
      guard let data = String(line).data(using: .utf8) else {
        throw WatchStorageError.corruptJSONLine(fileName: fileName, lineNumber: index + 1)
      }

      do {
        values.append(try decoder.decode(T.self, from: data))
      } catch {
        throw WatchStorageError.corruptJSONLine(fileName: fileName, lineNumber: index + 1)
      }
    }

    return values
  }

  func writeJSONAtomically<T: Encodable>(_ value: T, fileName: String) throws {
    try prepareParentDirectory()
    let data = try encoder.encode(value)
    try data.write(to: url(for: fileName), options: [.atomic])
  }

  func readJSON<T: Decodable>(_ type: T.Type, fileName: String) throws -> T? {
    let fileURL = url(for: fileName)
    guard fileManager.fileExists(atPath: fileURL.path) else {
      return nil
    }

    return try decoder.decode(T.self, from: Data(contentsOf: fileURL))
  }

  func fileEntry(relativePath: String) throws -> WatchPackageFileEntryV3 {
    let fileURL = url(for: relativePath)
    guard fileManager.fileExists(atPath: fileURL.path) else {
      return WatchPackageFileEntryV3(
        relativePath: relativePath,
        byteLength: 0,
        sha256: WatchRuntimeStructuralHash.placeholderHex("missing|\(relativePath)")
      )
    }

    let data = try Data(contentsOf: fileURL)
    let structuralHash = WatchRuntimeStructuralHash.placeholderHex(
      "file|\(relativePath)|\(data.count)|\(String(decoding: data, as: UTF8.self))"
    )
    return WatchPackageFileEntryV3(
      relativePath: relativePath,
      byteLength: data.count,
      sha256: structuralHash
    )
  }

  func url(for relativePath: String) -> URL {
    sessionDirectory.appendingPathComponent(relativePath)
  }

  static func listSessionSummaries(
    rootDirectory: URL,
    fileManager: FileManager = .default
  ) throws -> [WatchStoredSessionSummary] {
    let sessionsRoot = WatchStoragePaths.sessionsRootDirectory(in: rootDirectory)
    guard fileManager.fileExists(atPath: sessionsRoot.path) else {
      return []
    }

    let directories = try fileManager.contentsOfDirectory(
      at: sessionsRoot,
      includingPropertiesForKeys: nil,
      options: [.skipsHiddenFiles]
    )

    return directories.map { directory in
      WatchStoredSessionSummary(
        sessionId: directory.lastPathComponent,
        sessionDirectory: directory,
        state: state(for: directory, fileManager: fileManager)
      )
    }
  }

  static func pendingUnsealedSessions(rootDirectory: URL) throws -> [WatchStoredSessionSummary] {
    try listSessionSummaries(rootDirectory: rootDirectory).filter { $0.state == .pendingUnsealed }
  }

  static func sealedButUnackedPackages(rootDirectory: URL) throws -> [WatchStoredSessionSummary] {
    try listSessionSummaries(rootDirectory: rootDirectory).filter { $0.state == .sealedWaitingForAck }
  }

  static func acknowledgedPackages(rootDirectory: URL) throws -> [WatchStoredSessionSummary] {
    try listSessionSummaries(rootDirectory: rootDirectory).filter { $0.state == .acknowledged }
  }

  static func corruptedOrPartialSessions(rootDirectory: URL) throws -> [WatchStoredSessionSummary] {
    try listSessionSummaries(rootDirectory: rootDirectory).filter {
      $0.state == .corrupted || $0.state == .partialSeal
    }
  }

  private static func state(for directory: URL, fileManager: FileManager) -> WatchStoredSessionState {
    func exists(_ fileName: String) -> Bool {
      fileManager.fileExists(atPath: directory.appendingPathComponent(fileName).path)
    }

    let hasPlanAndCommit = exists(WatchStoragePaths.planFileName) && exists(WatchStoragePaths.commitFileName)
    let hasManifest = exists(WatchStoragePaths.manifestFileName)
    let hasSeal = exists(WatchStoragePaths.sealFileName)
    let hasAck = exists(WatchStoragePaths.ackFileName)

    if !hasPlanAndCommit {
      return .corrupted
    }

    if hasAck && hasManifest && hasSeal {
      return .acknowledged
    }

    if hasManifest && hasSeal {
      return .sealedWaitingForAck
    }

    if hasManifest || hasSeal {
      return .partialSeal
    }

    return .pendingUnsealed
  }

  private func prepareParentDirectory() throws {
    try fileManager.createDirectory(
      at: sessionDirectory,
      withIntermediateDirectories: true,
      attributes: nil
    )
  }
}
