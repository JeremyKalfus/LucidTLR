import CryptoKit
import Foundation

struct WatchTransportPackageFilePayloadV3: Codable, Equatable {
  let relativePath: String
  let contents: String
}

struct WatchTransportSealedPackageV3: Codable, Equatable {
  let manifest: WatchPackageManifestV3
  let files: [WatchTransportPackageFilePayloadV3]
}

enum WatchTransportPackageBuilder {
  static let requiredPackageFiles = [
    WatchStoragePaths.planFileName,
    WatchStoragePaths.commitFileName,
    WatchStoragePaths.eventsFileName,
    WatchStoragePaths.epochsFileName,
    WatchStoragePaths.cueEventsFileName,
    WatchStoragePaths.movementEventsFileName,
    WatchStoragePaths.runtimeSummaryFileName,
  ]

  static func buildTransferPackage(
    sessionStore: WatchSessionDirectoryStore,
    baseManifest: WatchPackageManifestV3
  ) throws -> WatchTransportSealedPackageV3 {
    let files = try requiredPackageFiles.map { relativePath in
      WatchTransportPackageFilePayloadV3(
        relativePath: relativePath,
        contents: try String(contentsOf: sessionStore.url(for: relativePath), encoding: .utf8)
      )
    }
    let fileEntries = files.map { file in
      WatchPackageFileEntryV3(
        relativePath: file.relativePath,
        byteLength: Array(file.contents.utf8).count,
        sha256: sha256Hex(file.contents)
      )
    }
    let packageId = buildPackageId(
      sessionId: baseManifest.sessionId,
      planHash: baseManifest.planHash,
      firstSequenceNumber: baseManifest.firstSequenceNumber,
      lastSequenceNumber: baseManifest.lastSequenceNumber
    )
    let manifestWithoutHash = WatchPackageManifestV3(
      schemaVersion: WatchPackageManifestV3Schema.schemaVersion,
      packageId: packageId,
      sessionId: baseManifest.sessionId,
      planHash: baseManifest.planHash,
      packageHash: "",
      sealedAt: baseManifest.sealedAt,
      sealReason: baseManifest.sealReason,
      startReceiptId: baseManifest.startReceiptId,
      firstSequenceNumber: baseManifest.firstSequenceNumber,
      lastSequenceNumber: baseManifest.lastSequenceNumber,
      eventCount: baseManifest.eventCount,
      epochCount: baseManifest.epochCount,
      cueEventCount: baseManifest.cueEventCount,
      movementEventCount: baseManifest.movementEventCount,
      files: fileEntries,
      runtimeSummary: baseManifest.runtimeSummary,
      importStatus: baseManifest.importStatus,
      importedAt: baseManifest.importedAt,
      importAckId: baseManifest.importAckId
    )
    let packageHash = try hashWatchRuntimePayload(
      manifestWithoutHash,
      ignoredKeys: ["packageHash"]
    )
    let manifest = WatchPackageManifestV3(
      schemaVersion: manifestWithoutHash.schemaVersion,
      packageId: manifestWithoutHash.packageId,
      sessionId: manifestWithoutHash.sessionId,
      planHash: manifestWithoutHash.planHash,
      packageHash: packageHash,
      sealedAt: manifestWithoutHash.sealedAt,
      sealReason: manifestWithoutHash.sealReason,
      startReceiptId: manifestWithoutHash.startReceiptId,
      firstSequenceNumber: manifestWithoutHash.firstSequenceNumber,
      lastSequenceNumber: manifestWithoutHash.lastSequenceNumber,
      eventCount: manifestWithoutHash.eventCount,
      epochCount: manifestWithoutHash.epochCount,
      cueEventCount: manifestWithoutHash.cueEventCount,
      movementEventCount: manifestWithoutHash.movementEventCount,
      files: manifestWithoutHash.files,
      runtimeSummary: manifestWithoutHash.runtimeSummary,
      importStatus: manifestWithoutHash.importStatus,
      importedAt: manifestWithoutHash.importedAt,
      importAckId: manifestWithoutHash.importAckId
    )

    try sessionStore.writeJSONAtomically(manifest, fileName: WatchStoragePaths.manifestFileName)

    return WatchTransportSealedPackageV3(manifest: manifest, files: files)
  }

  static func writePackageFile(
    package: WatchTransportSealedPackageV3,
    rootDirectory: URL
  ) throws -> URL {
    let directory = rootDirectory.appendingPathComponent(
      "TransportPackages",
      isDirectory: true
    )
    try FileManager.default.createDirectory(
      at: directory,
      withIntermediateDirectories: true,
      attributes: nil
    )
    let packageURL = directory.appendingPathComponent(
      "\(package.manifest.packageId).json",
      isDirectory: false
    )
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    try encoder.encode(package).write(to: packageURL, options: [.atomic])
    return packageURL
  }

  static func manifestJson(_ manifest: WatchPackageManifestV3) throws -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    let data = try encoder.encode(manifest)
    return String(decoding: data, as: UTF8.self)
  }

  private static func buildPackageId(
    sessionId: String,
    planHash: String,
    firstSequenceNumber: Int,
    lastSequenceNumber: Int
  ) -> String {
    let payload: [String: Any] = [
      "schemaVersion": WatchPackageManifestV3Schema.schemaVersion,
      "sessionId": sessionId,
      "planHash": planHash,
      "firstSequenceNumber": firstSequenceNumber,
      "lastSequenceNumber": lastSequenceNumber,
    ]

    return "watch-package-v3-\(String(sha256Hex(canonicalJSONString(payload)).prefix(24)))"
  }

  private static func hashWatchRuntimePayload<T: Encodable>(
    _ value: T,
    ignoredKeys: Set<String> = []
  ) throws -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    let data = try encoder.encode(value)
    let object = try JSONSerialization.jsonObject(with: data)
    return sha256Hex(canonicalJSONString(object, ignoredKeys: ignoredKeys))
  }

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
}
