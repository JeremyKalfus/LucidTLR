import Foundation

struct WatchPackageAckV3: Codable, Equatable {
  let schemaVersion: String
  let packageId: String
  let packageHash: String
  let acknowledgedAt: String
}

final class WatchPackageAckStore {
  let sessionStore: WatchSessionDirectoryStore

  init(sessionStore: WatchSessionDirectoryStore) {
    self.sessionStore = sessionStore
  }

  func recordAck(
    packageId: String,
    packageHash: String,
    acknowledgedAt: Date
  ) throws {
    guard let manifest = try sessionStore.readJSON(
      WatchPackageManifestV3.self,
      fileName: WatchStoragePaths.manifestFileName
    ) else {
      throw WatchStorageError.missingManifest
    }

    guard manifest.packageId == packageId, manifest.packageHash == packageHash else {
      throw WatchStorageError.ackDoesNotMatchPackage
    }

    let ack = WatchPackageAckV3(
      schemaVersion: "watch-package-ack-v3",
      packageId: packageId,
      packageHash: packageHash,
      acknowledgedAt: WatchRuntimeDateFormat.string(from: acknowledgedAt)
    )
    try sessionStore.writeJSONAtomically(ack, fileName: WatchStoragePaths.ackFileName)
  }

  func readAck() throws -> WatchPackageAckV3? {
    try sessionStore.readJSON(WatchPackageAckV3.self, fileName: WatchStoragePaths.ackFileName)
  }

  func canDeletePackageAfterAck(_ manifest: WatchPackageManifestV3) -> Bool {
    guard let ack = try? readAck() else {
      return false
    }

    return ack.packageId == manifest.packageId && ack.packageHash == manifest.packageHash
  }
}
