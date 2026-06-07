import Foundation

enum WatchPackageManifestV3Schema {
  static let schemaVersion = "watch-package-manifest-v3"
}

struct WatchPackageManifestV3: Codable, Equatable {
  let schemaVersion: String
  let packageId: String
  let sessionId: String
  let planHash: String
  let packageHash: String
  let sealedAt: String
  let sealReason: String
  let startReceiptId: String
  let firstSequenceNumber: Int
  let lastSequenceNumber: Int
  let eventCount: Int
  let epochCount: Int
  let cueEventCount: Int
  let movementEventCount: Int
  let files: [WatchPackageFileEntryV3]
  let runtimeSummary: WatchPackageRuntimeSummaryV3
  let importStatus: String
  let importedAt: String?
  let importAckId: String?

  func validationErrors() -> [String] {
    var errors: [String] = []

    if schemaVersion != WatchPackageManifestV3Schema.schemaVersion {
      errors.append("Manifest schemaVersion must be watch-package-manifest-v3.")
    }

    if packageId.isEmpty {
      errors.append("Manifest packageId must be present.")
    }

    if planHash.isEmpty || packageHash.isEmpty {
      errors.append("Manifest planHash and packageHash must be present.")
    }

    let sequenceCount = lastSequenceNumber - firstSequenceNumber + 1
    if firstSequenceNumber < 1 || lastSequenceNumber < firstSequenceNumber ||
      eventCount != sequenceCount {
      errors.append("Manifest eventCount must match the contiguous sequence range.")
    }

    if runtimeSummary.sealReason != sealReason {
      errors.append("Manifest sealReason must match runtimeSummary sealReason.")
    }

    if runtimeSummary.cuesDelivered > runtimeSummary.cuesAttempted {
      errors.append("Manifest cuesDelivered cannot exceed cuesAttempted.")
    }

    if epochCount < 0 || cueEventCount < 0 || movementEventCount < 0 {
      errors.append("Manifest counts cannot be negative.")
    }

    if files.contains(where: { $0.relativePath.isEmpty || $0.byteLength < 0 || $0.sha256.isEmpty }) {
      errors.append("Manifest files must include relativePath, byteLength, and sha256.")
    }

    // TODO: Recompute packageHash and deterministic packageId after choosing the
    // native canonical JSON/SHA-256 implementation.
    return errors
  }
}

struct WatchPackageFileEntryV3: Codable, Equatable {
  let relativePath: String
  let byteLength: Int
  let sha256: String
}

struct WatchPackageRuntimeSummaryV3: Codable, Equatable {
  let startedAt: String
  let endedAt: String
  let durationSeconds: Int
  let sealReason: String
  let batteryStart: Double
  let batteryEnd: Double
  let missingEpochCount: Int
  let sensorQualitySummary: String
  let cuesAttempted: Int
  let cuesDelivered: Int
  let cueFailures: Int
  let movementPauses: Int
}
