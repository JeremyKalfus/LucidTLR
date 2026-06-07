import Foundation

protocol WatchRuntimePlanPersisting {
  func persistCommittedPlan(_ plan: WatchRuntimePlanV3, committedAt: Date) throws
}

final class WatchFileBackedLogStore: WatchRuntimeLogStore, WatchRuntimePlanPersisting {
  let sessionStore: WatchSessionDirectoryStore
  private(set) var lastStorageError: Error?

  init(sessionStore: WatchSessionDirectoryStore) throws {
    self.sessionStore = sessionStore
    try sessionStore.prepareSessionDirectory()
    super.init(sessionId: sessionStore.sessionId)
    try restoreFromDisk()
  }

  func persistCommittedPlan(_ plan: WatchRuntimePlanV3, committedAt: Date) throws {
    try sessionStore.persistCommittedPlan(plan, committedAt: committedAt)
  }

  @discardableResult
  override func appendEvent(
    _ type: WatchRuntimeEventType,
    timestamp: Date,
    monotonicOffsetSeconds: Double?,
    payload: [String: WatchRuntimeJSONValue] = [:]
  ) -> WatchRuntimeEventV3 {
    let event = super.appendEvent(
      type,
      timestamp: timestamp,
      monotonicOffsetSeconds: monotonicOffsetSeconds,
      payload: payload
    )
    appendDurably(event, fileName: WatchStoragePaths.eventsFileName)
    return event
  }

  override func appendEpochRecord(
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
    super.appendEpochRecord(
      from: event,
      epochSequenceNumber: epochSequenceNumber,
      epochStart: epochStart,
      epochEnd: epochEnd,
      elapsedSessionSeconds: elapsedSessionSeconds,
      aggregation: aggregation,
      remEvaluation: remEvaluation,
      cueDecisionReason: cueDecisionReason,
      batteryLevel: batteryLevel
    )

    if let record = epochRecords.last {
      appendDurably(record, fileName: WatchStoragePaths.epochsFileName)
    }
  }

  override func appendCueRecord(
    from event: WatchRuntimeEventV3,
    cueId: String,
    outputChannel: String,
    decisionReason: WatchCueDecisionReason,
    result: WatchCueOutputResult
  ) {
    super.appendCueRecord(
      from: event,
      cueId: cueId,
      outputChannel: outputChannel,
      decisionReason: decisionReason,
      result: result
    )

    if let record = cueRecords.last {
      appendDurably(record, fileName: WatchStoragePaths.cueEventsFileName)
    }
  }

  override func appendMovementRecord(
    from event: WatchRuntimeEventV3,
    intensity: Double,
    movementState: String,
    largeMovement: Bool,
    cueAssociated: Bool,
    pauseStartedAt: Date?,
    pauseEndedAt: Date?
  ) {
    super.appendMovementRecord(
      from: event,
      intensity: intensity,
      movementState: movementState,
      largeMovement: largeMovement,
      cueAssociated: cueAssociated,
      pauseStartedAt: pauseStartedAt,
      pauseEndedAt: pauseEndedAt
    )

    if let record = movementRecords.last {
      appendDurably(record, fileName: WatchStoragePaths.movementEventsFileName)
    }
  }

  private func restoreFromDisk() throws {
    let restoredEvents = try sessionStore.readJSONLines(
      WatchRuntimeEventV3.self,
      fileName: WatchStoragePaths.eventsFileName
    )
    let restoredEpochs = try sessionStore.readJSONLines(
      WatchEpochRecordV3.self,
      fileName: WatchStoragePaths.epochsFileName
    )
    let restoredCues = try sessionStore.readJSONLines(
      WatchCueRecordV3.self,
      fileName: WatchStoragePaths.cueEventsFileName
    )
    let restoredMovements = try sessionStore.readJSONLines(
      WatchMovementRecordV3.self,
      fileName: WatchStoragePaths.movementEventsFileName
    )

    restoreRecords(
      events: restoredEvents,
      epochRecords: restoredEpochs,
      cueRecords: restoredCues,
      movementRecords: restoredMovements
    )
  }

  private func appendDurably<T: Encodable>(_ value: T, fileName: String) {
    do {
      try sessionStore.appendJSONLine(value, fileName: fileName)
      lastStorageError = nil
    } catch {
      lastStorageError = error
    }
  }
}
