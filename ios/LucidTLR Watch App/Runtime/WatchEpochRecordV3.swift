import Foundation

enum WatchEpochRecordV3Schema {
  static let schemaVersion = "watch-epoch-record-v3"
}

struct WatchEpochRecordV3: Codable, Equatable {
  let schemaVersion: String
  let sessionId: String
  let sequenceNumber: Int
  let eventId: String
  let timestamp: String
  let monotonicOffsetSeconds: Double?
  let epochSequenceNumber: Int
  let epochStart: String
  let epochEnd: String
  let elapsedSessionSeconds: Int
  let heartRateSampleCount: Int
  let motionSampleCount: Int
  let heartRateSummary: Double?
  let motionSummary: Double?
  let sensorQuality: String
  let remProbability: Double?
  let sleepProbability: Double?
  let remLabel: String
  let classifierVersion: String
  let modelVersion: String
  let movementState: String
  let stableLowMovementSeconds: Int
  let roughMovementIntensity: Double
  let cueDecisionReason: String
  let batteryLevel: Double?
  let previousRecordHash: String
  let recordHash: String

  func validationErrors() -> [String] {
    var errors: [String] = []

    if schemaVersion != WatchEpochRecordV3Schema.schemaVersion {
      errors.append("Epoch record schemaVersion must be watch-epoch-record-v3.")
    }

    if sessionId.isEmpty || eventId.isEmpty || epochStart.isEmpty || epochEnd.isEmpty {
      errors.append("Epoch records require sessionId, eventId, epochStart, and epochEnd.")
    }

    if sequenceNumber < 1 || epochSequenceNumber < 1 || elapsedSessionSeconds < 0 {
      errors.append("Epoch sequence and elapsed seconds must be non-negative.")
    }

    if heartRateSampleCount < 0 || motionSampleCount < 0 {
      errors.append("Epoch sample counts cannot be negative.")
    }

    if remLabel.isEmpty || classifierVersion.isEmpty || modelVersion.isEmpty {
      errors.append("Epoch records require REM label, classifierVersion, and modelVersion.")
    }

    if stableLowMovementSeconds < 0 || roughMovementIntensity < 0 {
      errors.append("Epoch movement summaries cannot be negative.")
    }

    if recordHash.isEmpty {
      errors.append("Epoch records require recordHash.")
    }

    return errors
  }
}
