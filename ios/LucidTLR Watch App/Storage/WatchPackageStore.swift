import Foundation

struct WatchPackageSealMarkerV3: Codable, Equatable {
  let schemaVersion: String
  let packageId: String
  let packageHash: String
  let sealedAt: String
  let sealReason: String
}

final class WatchPackageStore: WatchPackageSealing {
  let sessionStore: WatchSessionDirectoryStore
  private let baseSealer = WatchPackageSealer()

  init(sessionStore: WatchSessionDirectoryStore) {
    self.sessionStore = sessionStore
  }

  func seal(
    plan: WatchRuntimePlanV3,
    logStore: WatchRuntimeLogStore,
    sealReason: WatchRuntimeSealReason,
    sealedAt: Date,
    startedAt: Date,
    endedAt: Date,
    batteryStart: Double,
    batteryEnd: Double
  ) throws -> WatchPackageManifestV3 {
    let baseManifest = try baseSealer.seal(
      plan: plan,
      logStore: logStore,
      sealReason: sealReason,
      sealedAt: sealedAt,
      startedAt: startedAt,
      endedAt: endedAt,
      batteryStart: batteryStart,
      batteryEnd: batteryEnd
    )

    try sessionStore.ensureAppendOnlyLogFilesExist()
    try sessionStore.writeJSONAtomically(
      baseManifest.runtimeSummary,
      fileName: WatchStoragePaths.runtimeSummaryFileName
    )

    let files = try packageFileEntries()
    let packageHash = WatchRuntimeStructuralHash.placeholderHex(
      "\(baseManifest.packageId)|\(files.map { "\($0.relativePath):\($0.byteLength):\($0.sha256)" }.joined(separator: "|"))"
    )
    let manifest = WatchPackageManifestV3(
      schemaVersion: baseManifest.schemaVersion,
      packageId: baseManifest.packageId,
      sessionId: baseManifest.sessionId,
      planHash: baseManifest.planHash,
      packageHash: packageHash,
      sealedAt: baseManifest.sealedAt,
      sealReason: baseManifest.sealReason,
      startReceiptId: baseManifest.startReceiptId,
      firstSequenceNumber: baseManifest.firstSequenceNumber,
      lastSequenceNumber: baseManifest.lastSequenceNumber,
      eventCount: baseManifest.eventCount,
      epochCount: baseManifest.epochCount,
      cueEventCount: baseManifest.cueEventCount,
      movementEventCount: baseManifest.movementEventCount,
      files: files,
      runtimeSummary: baseManifest.runtimeSummary,
      importStatus: baseManifest.importStatus,
      importedAt: baseManifest.importedAt,
      importAckId: baseManifest.importAckId
    )

    try sessionStore.writeJSONAtomically(manifest, fileName: WatchStoragePaths.manifestFileName)
    let marker = WatchPackageSealMarkerV3(
      schemaVersion: "watch-package-seal-v3",
      packageId: manifest.packageId,
      packageHash: manifest.packageHash,
      sealedAt: manifest.sealedAt,
      sealReason: manifest.sealReason
    )
    try sessionStore.writeJSONAtomically(marker, fileName: WatchStoragePaths.sealFileName)

    return manifest
  }

  func readManifest() throws -> WatchPackageManifestV3? {
    try sessionStore.readJSON(WatchPackageManifestV3.self, fileName: WatchStoragePaths.manifestFileName)
  }

  private func packageFileEntries() throws -> [WatchPackageFileEntryV3] {
    try [
      WatchStoragePaths.planFileName,
      WatchStoragePaths.commitFileName,
      WatchStoragePaths.eventsFileName,
      WatchStoragePaths.epochsFileName,
      WatchStoragePaths.cueEventsFileName,
      WatchStoragePaths.movementEventsFileName,
      WatchStoragePaths.runtimeSummaryFileName,
    ].map(sessionStore.fileEntry(relativePath:))
  }
}
