import Foundation

enum WatchRuntimeStructuralHash {
  // Phase 4 placeholder only. This is deterministic structure tagging, not a
  // cryptographic SHA-256 replacement.
  static func placeholderHex(_ value: String) -> String {
    var hash: UInt64 = 1_469_598_103_934_665_603

    for byte in value.utf8 {
      hash ^= UInt64(byte)
      hash = hash &* 1_099_511_628_211
    }

    let short = String(format: "%016llx", hash)
    return String(repeating: short, count: 4)
  }
}

extension WatchRuntimeJSONValue {
  static func stringValue(_ value: String) -> WatchRuntimeJSONValue {
    .string(value)
  }

  static func intValue(_ value: Int) -> WatchRuntimeJSONValue {
    .number(Double(value))
  }

  static func doubleValue(_ value: Double) -> WatchRuntimeJSONValue {
    .number(value)
  }

  static func boolValue(_ value: Bool) -> WatchRuntimeJSONValue {
    .bool(value)
  }

  var stableDescription: String {
    switch self {
    case .string(let value):
      return "\"\(value)\""
    case .number(let value):
      return String(format: "%.6f", value)
    case .bool(let value):
      return value ? "true" : "false"
    case .object(let value):
      return value.keys.sorted()
        .map { "\($0):\(value[$0]?.stableDescription ?? "null")" }
        .joined(separator: ",")
    case .array(let value):
      return value.map(\.stableDescription).joined(separator: ",")
    case .null:
      return "null"
    }
  }
}

class WatchRuntimeLogStore: WatchRuntimeLogging {
  let sessionId: String
  private(set) var events: [WatchRuntimeEventV3] = []
  private(set) var epochRecords: [WatchEpochRecordV3] = []
  private(set) var cueRecords: [WatchCueRecordV3] = []
  private(set) var movementRecords: [WatchMovementRecordV3] = []

  private var nextSequenceNumber = 1
  private var previousRecordHash = "watch-runtime-v3-phase4-genesis"

  init(sessionId: String) {
    self.sessionId = sessionId
  }

  @discardableResult
  func appendEvent(
    _ type: WatchRuntimeEventType,
    timestamp: Date,
    monotonicOffsetSeconds: Double?,
    payload: [String: WatchRuntimeJSONValue] = [:]
  ) -> WatchRuntimeEventV3 {
    let sequenceNumber = nextSequenceNumber
    let timestampString = WatchRuntimeDateFormat.string(from: timestamp)
    let payloadSignature = payload.keys.sorted()
      .map { "\($0)=\(payload[$0]?.stableDescription ?? "null")" }
      .joined(separator: "|")
    let recordHash = WatchRuntimeStructuralHash.placeholderHex(
      "\(previousRecordHash)|\(sequenceNumber)|\(type.rawValue)|\(timestampString)|\(payloadSignature)"
    )
    let event = WatchRuntimeEventV3(
      sessionId: sessionId,
      sequenceNumber: sequenceNumber,
      eventId: "watch-event-v3-\(sessionId)-\(sequenceNumber)",
      timestamp: timestampString,
      monotonicOffsetSeconds: monotonicOffsetSeconds,
      eventType: type.rawValue,
      payload: payload,
      previousRecordHash: previousRecordHash,
      recordHash: recordHash
    )

    events.append(event)
    previousRecordHash = recordHash
    nextSequenceNumber += 1

    return event
  }

  func appendEpochRecord(
    from event: WatchRuntimeEventV3,
    epochSequenceNumber: Int,
    epochStart: Date,
    epochEnd: Date,
    elapsedSessionSeconds: Int,
    aggregation: WatchEpochAggregation,
    remEvaluation: WatchRemEvaluation,
    cueDecisionReason: WatchCueDecisionReason,
    batteryLevel: Double?
  ) {
    let recordHash = WatchRuntimeStructuralHash.placeholderHex(
      "epoch|\(event.recordHash)|\(epochSequenceNumber)|\(cueDecisionReason.rawValue)"
    )
    let record = WatchEpochRecordV3(
      schemaVersion: WatchEpochRecordV3Schema.schemaVersion,
      sessionId: event.sessionId,
      sequenceNumber: event.sequenceNumber,
      eventId: event.eventId,
      timestamp: event.timestamp,
      monotonicOffsetSeconds: event.monotonicOffsetSeconds,
      epochSequenceNumber: epochSequenceNumber,
      epochStart: WatchRuntimeDateFormat.string(from: epochStart),
      epochEnd: WatchRuntimeDateFormat.string(from: epochEnd),
      elapsedSessionSeconds: elapsedSessionSeconds,
      heartRateSampleCount: aggregation.heartRateSampleCount,
      motionSampleCount: aggregation.motionSampleCount,
      heartRateSummary: aggregation.heartRateSummary,
      motionSummary: aggregation.motionSummary,
      sensorQuality: aggregation.sensorQuality.rawValue,
      remProbability: remEvaluation.remProbability,
      sleepProbability: remEvaluation.sleepProbability,
      remLabel: remEvaluation.remLabel.rawValue,
      classifierVersion: remEvaluation.classifierVersion,
      modelVersion: remEvaluation.modelVersion,
      movementState: aggregation.largeMovement ? "large_movement" : "stable_low_movement",
      stableLowMovementSeconds: aggregation.stableLowMovementSeconds,
      roughMovementIntensity: aggregation.roughMovementIntensity,
      cueDecisionReason: cueDecisionReason.rawValue,
      batteryLevel: batteryLevel,
      previousRecordHash: event.previousRecordHash,
      recordHash: recordHash
    )

    epochRecords.append(record)
  }

  func appendCueRecord(
    from event: WatchRuntimeEventV3,
    cueId: String,
    outputChannel: String,
    decisionReason: WatchCueDecisionReason,
    result: WatchCueOutputResult
  ) {
    let recordHash = WatchRuntimeStructuralHash.placeholderHex(
      "cue|\(event.recordHash)|\(cueId)|\(decisionReason.rawValue)|\(result.delivered)"
    )
    let record = WatchCueRecordV3(
      schemaVersion: WatchCueRecordV3Schema.schemaVersion,
      sessionId: event.sessionId,
      sequenceNumber: event.sequenceNumber,
      eventId: event.eventId,
      timestamp: event.timestamp,
      monotonicOffsetSeconds: event.monotonicOffsetSeconds,
      cueId: cueId,
      outputChannel: outputChannel,
      decisionReason: decisionReason.rawValue,
      attempted: result.attempted,
      delivered: result.delivered,
      failureReason: result.failureReason,
      previousRecordHash: event.previousRecordHash,
      recordHash: recordHash
    )

    cueRecords.append(record)
  }

  func appendMovementRecord(
    from event: WatchRuntimeEventV3,
    intensity: Double,
    movementState: String,
    largeMovement: Bool,
    cueAssociated: Bool,
    pauseStartedAt: Date?,
    pauseEndedAt: Date?
  ) {
    let recordHash = WatchRuntimeStructuralHash.placeholderHex(
      "movement|\(event.recordHash)|\(intensity)|\(movementState)|\(cueAssociated)"
    )
    let record = WatchMovementRecordV3(
      schemaVersion: WatchMovementRecordV3Schema.schemaVersion,
      sessionId: event.sessionId,
      sequenceNumber: event.sequenceNumber,
      eventId: event.eventId,
      timestamp: event.timestamp,
      monotonicOffsetSeconds: event.monotonicOffsetSeconds,
      intensity: intensity,
      movementState: movementState,
      largeMovement: largeMovement,
      cueAssociated: cueAssociated,
      pauseStartedAt: pauseStartedAt.map(WatchRuntimeDateFormat.string(from:)),
      pauseEndedAt: pauseEndedAt.map(WatchRuntimeDateFormat.string(from:)),
      previousRecordHash: event.previousRecordHash,
      recordHash: recordHash
    )

    movementRecords.append(record)
  }

  func restoreRecords(
    events: [WatchRuntimeEventV3],
    epochRecords: [WatchEpochRecordV3],
    cueRecords: [WatchCueRecordV3],
    movementRecords: [WatchMovementRecordV3]
  ) {
    self.events = events
    self.epochRecords = epochRecords
    self.cueRecords = cueRecords
    self.movementRecords = movementRecords

    if let lastEvent = events.max(by: { $0.sequenceNumber < $1.sequenceNumber }) {
      nextSequenceNumber = lastEvent.sequenceNumber + 1
      previousRecordHash = lastEvent.recordHash
    }
  }
}
