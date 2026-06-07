import Foundation

enum WatchSessionCoordinatorError: Error, Equatable {
  case invalidPlan([String])
  case noCommittedPlan
  case planAlreadyCommitted
  case startRequiresCommittedPlan
  case lowPowerModeEnabled
  case motionUnavailable
  case batteryTooLow
  case runtimeNotActive
  case missingStartDate
}

final class WatchSessionCoordinator {
  private(set) var state: WatchRuntimeState = .idle
  private(set) var logStore: WatchRuntimeLogStore?
  private(set) var sealedManifest: WatchPackageManifestV3?

  private let clock: AdjustableWatchClock
  private let heartRateProvider: HeartRateProviding
  private let motionProvider: MotionProviding
  private let batteryProvider: BatteryProviding
  private let powerModeProvider: PowerModeProviding
  private let cueOutputProvider: CueOutputProviding
  private let packageSealer: WatchPackageSealing

  private var plan: WatchRuntimePlanV3?
  private var startedAt: Date?
  private var batteryStart: Double?
  private var epochAggregator = EpochAggregator()
  private var remEvaluator = RemProbabilityEvaluator()
  private var cuePolicy = CuePolicyEngine()
  private var movementPauseUntil: Date?
  private var cueAssociatedMovementPauseUntil: Date?
  private var movementPauseActive = false
  private var cueAssociatedPauseActive = false
  private var tlrDeferredUntil: Date?

  init(
    clock: AdjustableWatchClock,
    heartRateProvider: HeartRateProviding,
    motionProvider: MotionProviding,
    batteryProvider: BatteryProviding,
    powerModeProvider: PowerModeProviding,
    cueOutputProvider: CueOutputProviding,
    packageSealer: WatchPackageSealing = WatchPackageSealer()
  ) {
    self.clock = clock
    self.heartRateProvider = heartRateProvider
    self.motionProvider = motionProvider
    self.batteryProvider = batteryProvider
    self.powerModeProvider = powerModeProvider
    self.cueOutputProvider = cueOutputProvider
    self.packageSealer = packageSealer
  }

  var sessionType: String? {
    plan?.sessionType
  }

  var latestBatteryLevel: Double? {
    logStore?.epochRecords.last?.batteryLevel ?? batteryStart
  }

  var latestSensorQuality: String {
    logStore?.epochRecords.last?.sensorQuality ?? "unknown"
  }

  var latestCueDecisionReason: String {
    logStore?.epochRecords.last?.cueDecisionReason ?? "not_started"
  }

  var epochCount: Int {
    logStore?.epochRecords.count ?? 0
  }

  var packageState: String {
    sealedManifest == nil ? "not_sealed" : state.rawValue
  }

  var isTlrPaused: Bool {
    state == .paused
  }

  func commit(plan: WatchRuntimePlanV3) throws {
    guard state == .idle else {
      throw WatchSessionCoordinatorError.planAlreadyCommitted
    }

    let errors = plan.validationErrors()
    guard errors.isEmpty else {
      throw WatchSessionCoordinatorError.invalidPlan(errors)
    }

    self.plan = plan
    let logStore = WatchRuntimeLogStore(sessionId: plan.sessionId)
    self.logStore = logStore
    state = .planCommitted

    appendEvent(
      .runtimePlanCommitted,
      payload: [
        "planHash": .stringValue(plan.planHash),
        "schemaVersion": .stringValue(plan.schemaVersion),
      ]
    )
  }

  func startCommittedPlan() throws {
    guard let plan, state == .planCommitted else {
      throw WatchSessionCoordinatorError.startRequiresCommittedPlan
    }

    state = .preflight
    appendEvent(.runtimePreflightStarted)

    do {
      try runPreflight(plan: plan)
    } catch {
      appendEvent(
        .runtimePreflightFailed,
        payload: ["error": .stringValue(String(describing: error))]
      )
      state = .idle
      throw error
    }

    let start = clock.now
    let battery = batteryProvider.snapshot(at: start, elapsedSessionSeconds: 0)
    startedAt = start
    batteryStart = battery.level

    appendEvent(
      .runtimePreflightPassed,
      payload: ["batteryLevel": .doubleValue(battery.level)]
    )
    appendEvent(.runtimeStarted)

    if plan.sessionType == "sleep_log" {
      state = .logOnly
      appendEvent(.logOnlyStarted)
    } else {
      state = .training
      appendEvent(
        .trainingStarted,
        payload: ["skipped": .boolValue(plan.training.skipped)]
      )
      appendEvent(
        .trainingCompleted,
        payload: ["durationSeconds": .doubleValue(plan.training.durationSeconds)]
      )
      state = isTlrIntervalActive(plan: plan, at: clock.now) ? .tlrActive : .waitingForTlrInterval

      if state == .tlrActive {
        appendEvent(.tlrIntervalStarted)
      }
    }
  }

  func recordUserInteraction(kind: String = "watch_user_interaction") {
    cuePolicy.noteUserInteraction(at: clock.now)
    appendEvent(
      .userInteractionLogged,
      payload: ["interactionType": .stringValue(kind)]
    )
  }

  func deferTlrInterval(by seconds: TimeInterval) throws {
    guard plan?.sessionType == "tlr" else {
      throw WatchSessionCoordinatorError.runtimeNotActive
    }

    let deferredUntil = clock.now.addingTimeInterval(seconds)
    if let existingDeferredUntil = tlrDeferredUntil {
      tlrDeferredUntil = max(existingDeferredUntil, deferredUntil)
    } else {
      tlrDeferredUntil = deferredUntil
    }

    if state == .tlrActive {
      state = .waitingForTlrInterval
    }
  }

  func pauseTlr() throws {
    guard plan?.sessionType == "tlr",
      state == .tlrActive || state == .waitingForTlrInterval else {
      throw WatchSessionCoordinatorError.runtimeNotActive
    }

    state = .paused
  }

  func resumeTlr() throws {
    guard let plan, plan.sessionType == "tlr", state == .paused else {
      throw WatchSessionCoordinatorError.runtimeNotActive
    }

    state = isTlrIntervalActive(plan: plan, at: clock.now) ? .tlrActive : .waitingForTlrInterval
  }

  @discardableResult
  func stepEpoch() throws -> WatchEpochRecordV3 {
    guard let plan, let startedAt, let logStore else {
      throw WatchSessionCoordinatorError.noCommittedPlan
    }

    guard state == .waitingForTlrInterval || state == .tlrActive || state == .logOnly || state == .paused else {
      throw WatchSessionCoordinatorError.runtimeNotActive
    }

    if state == .paused {
      clock.advance(by: TimeInterval(plan.epoching.epochSeconds))
      throw WatchSessionCoordinatorError.runtimeNotActive
    }

    let epochStart = clock.now
    let epochEnd = epochStart.addingTimeInterval(TimeInterval(plan.epoching.epochSeconds))
    let elapsedAtStart = Int(epochStart.timeIntervalSince(startedAt))
    let elapsedAtEnd = Int(epochEnd.timeIntervalSince(startedAt))

    if state == .waitingForTlrInterval && isTlrIntervalActive(plan: plan, at: epochStart) {
      state = .tlrActive
      appendEvent(.tlrIntervalStarted)
    }

    expireMovementPauses(at: epochStart)

    let heartRateSamples = heartRateProvider.samples(from: epochStart, to: epochEnd)
    let motionSamples = motionProvider.samples(from: epochStart, to: epochEnd)
    let battery = batteryProvider.snapshot(
      at: epochEnd,
      elapsedSessionSeconds: TimeInterval(elapsedAtEnd)
    )
    let aggregation = epochAggregator.aggregate(
      plan: plan,
      start: epochStart,
      end: epochEnd,
      heartRateSamples: heartRateSamples,
      motionSamples: motionSamples
    )
    let remEvaluation = remEvaluator.evaluate(
      plan: plan,
      elapsedSessionSeconds: elapsedAtStart,
      aggregation: aggregation
    )

    handleMovementIfNeeded(plan: plan, epochStart: epochStart, epochEnd: epochEnd, aggregation: aggregation)

    let decision = cuePolicy.evaluate(
      plan: plan,
      runtimeState: state,
      epochStart: epochStart,
      aggregation: aggregation,
      remEvaluation: remEvaluation,
      movementPauseActive: movementPauseActive,
      cueAssociatedMovementPauseActive: cueAssociatedPauseActive
    )
    appendEvent(
      .cueDecision,
      payload: [
        "reason": .stringValue(decision.reason.rawValue),
        "shouldAttemptCue": .boolValue(decision.shouldAttemptCue),
        "remProbability": remEvaluation.remProbability.map(WatchRuntimeJSONValue.doubleValue) ?? .null,
      ]
    )

    if decision.shouldAttemptCue {
      try attemptCue(plan: plan, decision: decision)
    } else {
      appendEvent(
        .cueSuppressed,
        payload: ["reason": .stringValue(decision.reason.rawValue)]
      )
    }

    let epochEvent = appendEvent(
      .epochProcessed,
      payload: [
        "epochSequenceNumber": .intValue(logStore.epochRecords.count + 1),
        "cueDecisionReason": .stringValue(decision.reason.rawValue),
      ]
    )
    logStore.appendEpochRecord(
      from: epochEvent,
      epochSequenceNumber: logStore.epochRecords.count + 1,
      epochStart: epochStart,
      epochEnd: epochEnd,
      elapsedSessionSeconds: elapsedAtEnd,
      aggregation: aggregation,
      remEvaluation: remEvaluation,
      cueDecisionReason: decision.reason,
      batteryLevel: battery.level
    )

    clock.advance(by: TimeInterval(plan.epoching.epochSeconds))

    if battery.level <= plan.safety.safeSealBatteryLevel && sealedManifest == nil {
      appendEvent(
        .lowBatterySafeSealStarted,
        payload: ["batteryLevel": .doubleValue(battery.level)]
      )
      _ = try seal(reason: .safeLowBattery)
      state = .failedSafeSealed
    }

    guard let lastEpoch = logStore.epochRecords.last else {
      throw WatchSessionCoordinatorError.runtimeNotActive
    }

    return lastEpoch
  }

  func runEpochs(_ count: Int) throws {
    for _ in 0..<count {
      if sealedManifest != nil {
        return
      }

      _ = try stepEpoch()
    }
  }

  @discardableResult
  func stopAndSeal(reason: WatchRuntimeSealReason = .completed) throws -> WatchPackageManifestV3 {
    appendEvent(.runtimeStopped, payload: ["sealReason": .stringValue(reason.rawValue)])
    return try seal(reason: reason)
  }

  private func runPreflight(plan: WatchRuntimePlanV3) throws {
    if plan.safety.requireLowPowerModeOff && powerModeProvider.isLowPowerModeEnabled {
      throw WatchSessionCoordinatorError.lowPowerModeEnabled
    }

    if plan.safety.requireMotion && !motionProvider.isAvailable {
      throw WatchSessionCoordinatorError.motionUnavailable
    }

    let battery = batteryProvider.snapshot(at: clock.now, elapsedSessionSeconds: 0)
    if battery.level < plan.safety.minimumStartBatteryLevel {
      throw WatchSessionCoordinatorError.batteryTooLow
    }
  }

  private func attemptCue(plan: WatchRuntimePlanV3, decision: WatchCuePolicyDecision) throws {
    let attemptEvent = appendEvent(
      .cuePlayAttempted,
      payload: [
        "cueId": .stringValue(plan.cue.cueId),
        "outputChannel": .stringValue(decision.outputChannel),
        "reason": .stringValue(decision.reason.rawValue),
      ]
    )
    let result = cueOutputProvider.deliverCue(plan: plan, at: clock.now)
    cuePolicy.noteCueAttempt(at: clock.now, delivered: result.delivered)

    if result.delivered {
      appendEvent(
        .cuePlayed,
        payload: ["cueId": .stringValue(plan.cue.cueId)]
      )
    } else {
      appendEvent(
        .cueFailed,
        payload: [
          "cueId": .stringValue(plan.cue.cueId),
          "failureReason": .stringValue(result.failureReason ?? "unknown"),
        ]
      )
    }

    logStore?.appendCueRecord(
      from: attemptEvent,
      cueId: plan.cue.cueId,
      outputChannel: result.outputChannel,
      decisionReason: decision.reason,
      result: result
    )
  }

  private func handleMovementIfNeeded(
    plan: WatchRuntimePlanV3,
    epochStart: Date,
    epochEnd: Date,
    aggregation: WatchEpochAggregation
  ) {
    guard aggregation.largeMovement else {
      return
    }

    if let lastCueAttemptAt = cuePolicy.lastCueAttemptAt,
      epochStart.timeIntervalSince(lastCueAttemptAt) <=
      TimeInterval(plan.movement.cueAssociatedMovementWindowSeconds) {
      cueAssociatedPauseActive = true
      cueAssociatedMovementPauseUntil = epochEnd.addingTimeInterval(
        TimeInterval(plan.movement.cueAssociatedMovementPauseSeconds)
      )
      let event = appendEvent(
        .cueAssociatedMovementPauseStarted,
        payload: [
          "pauseUntil": .stringValue(WatchRuntimeDateFormat.string(from: cueAssociatedMovementPauseUntil ?? epochEnd)),
          "intensity": .doubleValue(aggregation.roughMovementIntensity),
        ]
      )
      logStore?.appendMovementRecord(
        from: event,
        intensity: aggregation.roughMovementIntensity,
        movementState: "cue_associated_movement_pause",
        largeMovement: true,
        cueAssociated: true,
        pauseStartedAt: epochStart,
        pauseEndedAt: cueAssociatedMovementPauseUntil
      )
      return
    }

    movementPauseActive = true
    movementPauseUntil = epochEnd.addingTimeInterval(
      TimeInterval(plan.movement.stableLowMovementRequiredSeconds)
    )
    let event = appendEvent(
      .movementPauseStarted,
      payload: [
        "pauseUntil": .stringValue(WatchRuntimeDateFormat.string(from: movementPauseUntil ?? epochEnd)),
        "intensity": .doubleValue(aggregation.roughMovementIntensity),
      ]
    )
    logStore?.appendMovementRecord(
      from: event,
      intensity: aggregation.roughMovementIntensity,
      movementState: "movement_pause",
      largeMovement: true,
      cueAssociated: false,
      pauseStartedAt: epochStart,
      pauseEndedAt: movementPauseUntil
    )
  }

  private func expireMovementPauses(at date: Date) {
    if movementPauseActive, let movementPauseUntil, date >= movementPauseUntil {
      movementPauseActive = false
      let event = appendEvent(.movementPauseEnded)
      logStore?.appendMovementRecord(
        from: event,
        intensity: 0,
        movementState: "movement_pause_ended",
        largeMovement: false,
        cueAssociated: false,
        pauseStartedAt: nil,
        pauseEndedAt: date
      )
    }

    if cueAssociatedPauseActive, let cueAssociatedMovementPauseUntil,
      date >= cueAssociatedMovementPauseUntil {
      cueAssociatedPauseActive = false
    }
  }

  private func seal(reason: WatchRuntimeSealReason) throws -> WatchPackageManifestV3 {
    if let sealedManifest {
      return sealedManifest
    }

    guard let plan, let logStore, let startedAt else {
      throw WatchSessionCoordinatorError.missingStartDate
    }

    state = .sealing
    appendEvent(.packageSealed, payload: ["sealReason": .stringValue(reason.rawValue)])

    let endedAt = clock.now
    let batteryEnd = batteryProvider.snapshot(
      at: endedAt,
      elapsedSessionSeconds: endedAt.timeIntervalSince(startedAt)
    ).level
    let manifest = packageSealer.seal(
      plan: plan,
      logStore: logStore,
      sealReason: reason,
      sealedAt: endedAt,
      startedAt: startedAt,
      endedAt: endedAt,
      batteryStart: batteryStart ?? batteryEnd,
      batteryEnd: batteryEnd
    )

    sealedManifest = manifest
    state = reason == .safeLowBattery ? .failedSafeSealed : .sealedWaitingForPhone

    return manifest
  }

  @discardableResult
  private func appendEvent(
    _ type: WatchRuntimeEventType,
    payload: [String: WatchRuntimeJSONValue] = [:]
  ) -> WatchRuntimeEventV3 {
    let monotonicOffsetSeconds = startedAt.map { clock.now.timeIntervalSince($0) }
    return logStore?.appendEvent(
      type,
      timestamp: clock.now,
      monotonicOffsetSeconds: monotonicOffsetSeconds,
      payload: payload
    ) ?? WatchRuntimeEventV3(
      sessionId: plan?.sessionId ?? "uncommitted",
      sequenceNumber: 0,
      eventId: "uncommitted",
      timestamp: WatchRuntimeDateFormat.string(from: clock.now),
      monotonicOffsetSeconds: nil,
      eventType: type.rawValue,
      payload: payload,
      previousRecordHash: "",
      recordHash: "uncommitted"
    )
  }

  private func isTlrIntervalActive(plan: WatchRuntimePlanV3, at date: Date) -> Bool {
    if let tlrDeferredUntil, date < tlrDeferredUntil {
      return false
    }

    guard plan.tlrInterval.enabled,
      let earliestCueAt = WatchRuntimeDateFormat.date(from: plan.tlrInterval.earliestCueAt),
      let latestCueAt = WatchRuntimeDateFormat.date(from: plan.tlrInterval.latestCueAt) else {
      return false
    }

    return date >= earliestCueAt && date <= latestCueAt
  }
}
