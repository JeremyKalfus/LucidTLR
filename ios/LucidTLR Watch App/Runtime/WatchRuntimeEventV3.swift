import Foundation

enum WatchRuntimeJSONValue: Codable, Equatable {
  case string(String)
  case number(Double)
  case bool(Bool)
  case object([String: WatchRuntimeJSONValue])
  case array([WatchRuntimeJSONValue])
  case null

  init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()

    if container.decodeNil() {
      self = .null
    } else if let bool = try? container.decode(Bool.self) {
      self = .bool(bool)
    } else if let number = try? container.decode(Double.self) {
      self = .number(number)
    } else if let string = try? container.decode(String.self) {
      self = .string(string)
    } else if let object = try? container.decode([String: WatchRuntimeJSONValue].self) {
      self = .object(object)
    } else {
      self = .array(try container.decode([WatchRuntimeJSONValue].self))
    }
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()

    switch self {
    case .string(let value):
      try container.encode(value)
    case .number(let value):
      try container.encode(value)
    case .bool(let value):
      try container.encode(value)
    case .object(let value):
      try container.encode(value)
    case .array(let value):
      try container.encode(value)
    case .null:
      try container.encodeNil()
    }
  }
}

struct WatchRuntimeEventV3: Codable, Equatable {
  let sessionId: String
  let sequenceNumber: Int
  let eventId: String
  let timestamp: String
  let monotonicOffsetSeconds: Double?
  let eventType: String
  let payload: [String: WatchRuntimeJSONValue]
  let previousRecordHash: String
  let recordHash: String

  func validationErrors() -> [String] {
    var errors: [String] = []

    if sessionId.isEmpty || eventId.isEmpty || eventType.isEmpty {
      errors.append("Watch runtime events require sessionId, eventId, and eventType.")
    }

    if sequenceNumber < 1 {
      errors.append("Watch runtime event sequenceNumber must be positive.")
    }

    if recordHash.isEmpty {
      errors.append("Watch runtime events require recordHash.")
    }

    return errors
  }
}
