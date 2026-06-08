import Foundation
import React
import WatchConnectivity

@objc(LucidTLRWatchTransport)
final class LucidTLRWatchTransport: NSObject, WCSessionDelegate {
  private let queue = DispatchQueue(label: "com.lucidtlr.watch-transport-lab")
  private let defaults = UserDefaults.standard
  private let statusKey = "lucidtlr.watchTransportLab.status.v1"
  private let packageFilePathKey = "lucidtlr.watchTransportLab.latestPackageFilePath.v1"
  private let isoFormatter = ISO8601DateFormatter()

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

      do {
        try session.updateApplicationContext(payload)
      } catch {
        self.recordError("updateApplicationContext failed: \(error.localizedDescription)")
      }

      session.transferUserInfo(payload)
      self.recordStagedPlan(payload)
      self.recordLastMessage(
        type: self.stringValue(payload["messageType"]) ?? "lucidtlr.watch.plan.available",
        at: self.stringValue(payload["createdAt"]) ?? self.nowString()
      )
      resolve(self.currentStatus())
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
    queue.async {
      do {
        let metadata = self.propertyListDictionary(file.metadata ?? [:])
        let targetURL = try self.receivedPackageURL(
          packageId: self.stringValue(metadata["packageId"]) ?? "unknown-package"
        )
        if FileManager.default.fileExists(atPath: targetURL.path) {
          try FileManager.default.removeItem(at: targetURL)
        }
        try FileManager.default.copyItem(at: file.fileURL, to: targetURL)
        self.defaults.set(targetURL.path, forKey: self.packageFilePathKey)
        self.recordPackageFile(metadata, receivedAt: self.nowString())
        self.recordLastMessage(
          type: self.stringValue(metadata["messageType"]) ?? "lucidtlr.watch.package.file",
          at: self.stringValue(metadata["createdAt"]) ?? self.nowString()
        )
      } catch {
        self.recordError("Package file receive failed: \(error.localizedDescription)")
      }
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
    }
  }

  private func recordCommitReceipt(_ payload: [String: Any]) {
    mutateStatus { status in
      status["latestCommitReceipt"] = [
        "sessionId": self.stringValue(payload["sessionId"]) ?? "",
        "planHash": self.stringValue(payload["planHash"]) ?? "",
        "commitId": self.stringValue(payload["commitId"]) ?? "",
        "committedAt": self.stringValue(payload["committedAt"]) ?? "",
        "watchState": self.stringValue(payload["watchState"]) ?? "",
      ]
    }
  }

  private func recordStatusSnapshot(_ payload: [String: Any]) {
    mutateStatus { status in
      status["latestStatusSnapshot"] = [
        "sessionId": self.stringValue(payload["sessionId"]) ?? "",
        "planHash": self.stringValue(payload["planHash"]) ?? "",
        "watchState": self.stringValue(payload["watchState"]) ?? "",
        "packageId": self.stringValue(payload["packageId"]) ?? "",
        "packageHash": self.stringValue(payload["packageHash"]) ?? "",
        "createdAt": self.stringValue(payload["createdAt"]) ?? "",
      ]
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
      ]
    }
  }

  private func recordPackageFile(_ payload: [String: Any], receivedAt: String) {
    mutateStatus { status in
      status["latestReceivedPackage"] = [
        "sessionId": self.stringValue(payload["sessionId"]) ?? "",
        "planHash": self.stringValue(payload["planHash"]) ?? "",
        "packageId": self.stringValue(payload["packageId"]) ?? "",
        "packageHash": self.stringValue(payload["packageHash"]) ?? "",
        "receivedAt": receivedAt,
      ]
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
      ]
    }
  }

  private func handleIncoming(_ rawPayload: [String: Any]) {
    let payload = propertyListDictionary(rawPayload)
    let type = stringValue(payload["messageType"]) ?? "unknown"
    let receivedAt = nowString()

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

  private func receivedPackageURL(packageId: String) throws -> URL {
    let caches = try FileManager.default.url(
      for: .cachesDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: true
    )
    let directory = caches.appendingPathComponent(
      "LucidTLRWatchTransportLab",
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
}
