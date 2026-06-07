import Foundation

enum WatchStoragePaths {
  static let sessionsDirectoryName = "Sessions"
  static let planFileName = "plan.json"
  static let commitFileName = "commit.json"
  static let eventsFileName = "events.jsonl"
  static let epochsFileName = "epochs.jsonl"
  static let cueEventsFileName = "cue_events.jsonl"
  static let movementEventsFileName = "movement_events.jsonl"
  static let runtimeSummaryFileName = "runtime_summary.json"
  static let manifestFileName = "manifest.json"
  static let sealFileName = "seal.json"
  static let ackFileName = "ack.json"

  static let appendOnlyLogFileNames = [
    eventsFileName,
    epochsFileName,
    cueEventsFileName,
    movementEventsFileName,
  ]

  static func defaultRootDirectory(fileManager: FileManager = .default) throws -> URL {
    guard let documents = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first else {
      throw WatchStorageError.missingDocumentsDirectory
    }

    return documents
  }

  static func sessionsRootDirectory(in rootDirectory: URL) -> URL {
    rootDirectory.appendingPathComponent(sessionsDirectoryName, isDirectory: true)
  }

  static func sessionDirectory(rootDirectory: URL, sessionId: String) throws -> URL {
    guard !sessionId.isEmpty, !sessionId.contains("/") else {
      throw WatchStorageError.invalidSessionId
    }

    return sessionsRootDirectory(in: rootDirectory)
      .appendingPathComponent(sessionId, isDirectory: true)
  }
}
