import Foundation

enum WatchCueRecordV3Schema {
  static let schemaVersion = "watch-cue-record-v3"
}

struct WatchCueRecordV3: Codable, Equatable {
  let schemaVersion: String
  let sessionId: String
  let sequenceNumber: Int
  let eventId: String
  let timestamp: String
  let monotonicOffsetSeconds: Double?
  let cueId: String
  let outputChannel: String
  let decisionReason: String
  let attempted: Bool
  let delivered: Bool
  let failureReason: String?
  let previousRecordHash: String
  let recordHash: String

  func validationErrors() -> [String] {
    var errors: [String] = []

    if schemaVersion != WatchCueRecordV3Schema.schemaVersion {
      errors.append("Cue record schemaVersion must be watch-cue-record-v3.")
    }

    if sessionId.isEmpty || eventId.isEmpty || cueId.isEmpty {
      errors.append("Cue records require sessionId, eventId, and cueId.")
    }

    if outputChannel != "haptic" && outputChannel != "audio" && outputChannel != "none" {
      errors.append("Cue outputChannel must be haptic, audio, or none.")
    }

    if delivered && !attempted {
      errors.append("Cue records cannot be delivered without an attempt.")
    }

    if sequenceNumber < 1 || recordHash.isEmpty {
      errors.append("Cue records require positive sequenceNumber and recordHash.")
    }

    return errors
  }
}
