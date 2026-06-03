import Foundation
import WatchConnectivity

final class WatchRuntimeLogWriter {
  private let fileManager: FileManager
  private let directory: URL
  private(set) var activeLogURL: URL?

  init(fileManager: FileManager = .default) {
    self.fileManager = fileManager
    directory = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("LucidCueWatchRuntime", isDirectory: true)
  }

  func start(sessionId: String, watchSessionId: String) throws -> URL {
    try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
    let url = directory.appendingPathComponent("\(sessionId)-\(watchSessionId).jsonl")
    if !fileManager.fileExists(atPath: url.path) {
      fileManager.createFile(atPath: url.path, contents: nil)
    }
    activeLogURL = url
    return url
  }

  func append(
    eventType: String,
    sessionId: String,
    watchSessionId: String,
    timestamp: String,
    payload: [String: Any]
  ) {
    appendJSONObject([
      "schemaVersion": "watch-runtime-log-v2",
      "id": UUID().uuidString,
      "sessionId": sessionId,
      "watchSessionId": watchSessionId,
      "timestamp": timestamp,
      "eventType": eventType,
      "payload": payload,
    ])
  }

  func appendJSONObject(_ value: [String: Any]) {
    guard let activeLogURL,
      JSONSerialization.isValidJSONObject(value),
      let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
    else {
      return
    }

    guard let handle = try? FileHandle(forWritingTo: activeLogURL) else {
      return
    }

    handle.seekToEndOfFile()
    handle.write(data)
    handle.write(Data("\n".utf8))
    handle.closeFile()
  }
}

final class WatchRuntimeSyncQueue {
  var pendingCount: Int {
    guard WCSession.isSupported(),
      WCSession.default.activationState == .activated
    else {
      return 0
    }

    return WCSession.default.outstandingUserInfoTransfers.count
      + WCSession.default.outstandingFileTransfers.count
  }

  func transferUserInfo(_ payload: [String: Any]) {
    guard WCSession.isSupported(),
      WCSession.default.activationState == .activated,
      JSONSerialization.isValidJSONObject(payload)
    else {
      return
    }

    WCSession.default.transferUserInfo(payload)
  }

  func transferFile(_ fileURL: URL, metadata: [String: Any]) {
    guard WCSession.isSupported(),
      WCSession.default.activationState == .activated,
      FileManager.default.fileExists(atPath: fileURL.path),
      JSONSerialization.isValidJSONObject(metadata)
    else {
      return
    }

    WCSession.default.transferFile(fileURL, metadata: metadata)
  }
}
