import Foundation

enum WatchMovementRecordV3Schema {
  static let schemaVersion = "watch-movement-record-v3"
}

struct WatchMovementRecordV3: Codable, Equatable {
  let schemaVersion: String
  let sessionId: String
  let sequenceNumber: Int
  let eventId: String
  let timestamp: String
  let monotonicOffsetSeconds: Double?
  let intensity: Double
  let movementState: String
  let largeMovement: Bool
  let cueAssociated: Bool
  let pauseStartedAt: String?
  let pauseEndedAt: String?
  let previousRecordHash: String
  let recordHash: String

  func validationErrors() -> [String] {
    var errors: [String] = []

    if schemaVersion != WatchMovementRecordV3Schema.schemaVersion {
      errors.append("Movement record schemaVersion must be watch-movement-record-v3.")
    }

    if sessionId.isEmpty || eventId.isEmpty || movementState.isEmpty {
      errors.append("Movement records require sessionId, eventId, and movementState.")
    }

    if sequenceNumber < 1 || intensity < 0 {
      errors.append("Movement sequenceNumber must be positive and intensity cannot be negative.")
    }

    if recordHash.isEmpty {
      errors.append("Movement records require recordHash.")
    }

    return errors
  }
}
