import Foundation

enum WatchSyntheticRuntimeFixtures {
  static func makeTlrPlanFixture() -> WatchRuntimePlanV3 {
    tlrPlan()
  }

  static func makeSleepLogPlanFixture() -> WatchRuntimePlanV3 {
    sleepLogPlan()
  }

  static func fixtureStartDateForStorage() -> Date {
    fixtureStartDate()
  }

  static func runTenMinuteTlrFixture() throws -> WatchSyntheticRunResult {
    try runTenMinuteFixture(plan: tlrPlan(), motionPattern: .lowMovement)
  }

  static func runTenMinuteSleepLogFixture() throws -> WatchSyntheticRunResult {
    try runTenMinuteFixture(plan: sleepLogPlan(), motionPattern: .lowMovement)
  }

  static func runTenMinuteMovementSuppressionFixture() throws -> WatchSyntheticRunResult {
    try runTenMinuteFixture(plan: tlrPlan(), motionPattern: .spikeEpochs([7, 8]))
  }

  static func runTenMinuteMissingSensorFixture() throws -> WatchSyntheticRunResult {
    let startDate = fixtureStartDate()
    let clock = DeterministicWatchClock(start: startDate)
    let plan = tlrPlan()
    let coordinator = WatchSessionCoordinator(
      clock: clock,
      heartRateProvider: SyntheticHeartRateProvider(startDate: startDate, pattern: .missing),
      motionProvider: SyntheticMotionProvider(startDate: startDate, sampleHz: 1, pattern: .lowMovement),
      batteryProvider: SyntheticBatteryProvider(startLevel: 0.9, drainPerHour: 0.02),
      powerModeProvider: SyntheticPowerModeProvider(isLowPowerModeEnabled: false),
      cueOutputProvider: SyntheticCueOutputProvider(shouldDeliver: true)
    )

    try coordinator.commit(plan: plan)
    try coordinator.startCommittedPlan()
    try coordinator.runEpochs(20)
    let manifest = try coordinator.stopAndSeal(reason: .completed)

    return result(from: coordinator, manifest: manifest)
  }

  private static func runTenMinuteFixture(
    plan: WatchRuntimePlanV3,
    motionPattern: SyntheticMotionPattern
  ) throws -> WatchSyntheticRunResult {
    let startDate = fixtureStartDate()
    let clock = DeterministicWatchClock(start: startDate)
    let coordinator = WatchSessionCoordinator(
      clock: clock,
      heartRateProvider: SyntheticHeartRateProvider(startDate: startDate, pattern: .plausibleSleep),
      motionProvider: SyntheticMotionProvider(
        startDate: startDate,
        sampleHz: plan.epoching.motionSampleHz,
        pattern: motionPattern
      ),
      batteryProvider: SyntheticBatteryProvider(startLevel: 0.9, drainPerHour: 0.02),
      powerModeProvider: SyntheticPowerModeProvider(isLowPowerModeEnabled: false),
      cueOutputProvider: SyntheticCueOutputProvider(shouldDeliver: true)
    )

    try coordinator.commit(plan: plan)
    try coordinator.startCommittedPlan()
    try coordinator.runEpochs(20)
    let manifest = try coordinator.stopAndSeal(reason: .completed)

    return result(from: coordinator, manifest: manifest)
  }

  private static func result(
    from coordinator: WatchSessionCoordinator,
    manifest: WatchPackageManifestV3
  ) -> WatchSyntheticRunResult {
    WatchSyntheticRunResult(
      finalState: coordinator.state,
      manifest: manifest,
      events: coordinator.logStore?.events ?? [],
      epochs: coordinator.logStore?.epochRecords ?? [],
      cueRecords: coordinator.logStore?.cueRecords ?? [],
      movementRecords: coordinator.logStore?.movementRecords ?? []
    )
  }

  private static func fixtureStartDate() -> Date {
    WatchRuntimeDateFormat.date(from: "2026-06-07T04:00:00.000Z") ?? Date(timeIntervalSince1970: 0)
  }

  private static func tlrPlan() -> WatchRuntimePlanV3 {
    basePlan(sessionId: "synthetic-tlr-session-v3", sessionType: "tlr", cueingEnabled: true)
  }

  private static func sleepLogPlan() -> WatchRuntimePlanV3 {
    basePlan(sessionId: "synthetic-sleep-log-session-v3", sessionType: "sleep_log", cueingEnabled: false)
  }

  private static func basePlan(
    sessionId: String,
    sessionType: String,
    cueingEnabled: Bool
  ) -> WatchRuntimePlanV3 {
    let createdAt = "2026-06-07T04:00:00.000Z"
    let earliestCueAt = cueingEnabled ? "2026-06-07T04:01:00.000Z" : createdAt
    let latestCueAt = cueingEnabled ? "2026-06-07T04:10:00.000Z" : createdAt
    let cueHash = String(repeating: "a", count: 64)
    let trainingHash = String(repeating: "b", count: 64)

    return WatchRuntimePlanV3(
      schemaVersion: WatchRuntimePlanV3Schema.schemaVersion,
      sessionId: sessionId,
      participantId: "synthetic-participant-v3",
      sessionType: sessionType,
      mode: "watch",
      createdAt: createdAt,
      protocolVersion: "tlr-protocol-v3-synthetic-fixture",
      watchPolicyVersion: "watch-policy-v3-synthetic-fixture",
      remModelVersion: "lucidtlr-watch-rem-informed-v3-contract-2026-06-07",
      planHash: WatchRuntimeStructuralHash.placeholderHex("plan|\(sessionId)|\(sessionType)"),
      selectedCueId: "harp-flourish",
      cue: WatchRuntimeCueV3(
        cueId: "harp-flourish",
        assetId: "harp-flourish",
        resourceName: "harp_flourish",
        resourceExtension: "mp3",
        durationSeconds: 2.4,
        sha256: cueHash
      ),
      cueOutput: WatchRuntimeCueOutputV3(
        hapticEnabled: cueingEnabled,
        audioEnabled: false,
        audioRequiresPreflight: true,
        preflightRequired: cueingEnabled,
        defaultOutput: "haptic"
      ),
      training: WatchRuntimeTrainingV3(
        enabled: cueingEnabled,
        skipped: !cueingEnabled,
        audioResourceName: cueingEnabled ? "final_lucid_training" : "",
        audioResourceExtension: "mp3",
        durationSeconds: cueingEnabled ? 600 : 0,
        cueSchedule: [],
        sha256: cueingEnabled ? trainingHash : ""
      ),
      tlrInterval: WatchRuntimeTlrIntervalV3(
        enabled: cueingEnabled,
        earliestCueAt: earliestCueAt,
        latestCueAt: latestCueAt,
        derivedFrom: cueingEnabled
          ? "watch_training_completed_at_plus_protocol_delay"
          : "cue_delivery_disabled_sleep_log"
      ),
      epoching: WatchRuntimeEpochingV3(
        epochSeconds: 30,
        motionSampleHz: 1,
        rawMotionPersistence: false
      ),
      remPolicy: WatchRuntimeRemPolicyV3(
        classifierVersion: "lucidtlr-rem-probability-v3-contract",
        threshold: 0.7,
        persistenceRule: "2_of_last_3",
        minimumSleepProbability: 0.6,
        sensorQualityRequired: "good"
      ),
      movement: WatchRuntimeMovementV3(
        stableLowMovementRequiredSeconds: 60,
        largeMovementThreshold: 0.75,
        cueAssociatedMovementWindowSeconds: 45,
        cueAssociatedMovementPauseSeconds: 180,
        userInteractionSuppressionSeconds: 90
      ),
      budget: WatchRuntimeBudgetV3(
        maxCuesTonight: cueingEnabled ? 1 : 0,
        minimumSecondsSinceLastCue: 180
      ),
      safety: WatchRuntimeSafetyV3(
        requireWorkoutSession: true,
        requireHealthKitAuthorization: true,
        requireMotion: true,
        requireLowPowerModeOff: true,
        minimumStartBatteryLevel: 0.35,
        lowBatteryWarningLevel: 0.25,
        safeSealBatteryLevel: 0.18,
        emergencyStopBatteryLevel: 0.1
      ),
      assets: [
        WatchRuntimeAssetV3(
          id: "harp-flourish",
          kind: "cue",
          fileName: "harp-flourish.mp3",
          resourceName: "harp_flourish",
          resourceExtension: "mp3",
          sha256: cueHash,
          byteLength: 20_588
        ),
        WatchRuntimeAssetV3(
          id: "final-lucid-training",
          kind: "training",
          fileName: "final-lucid-training.mp3",
          resourceName: "final_lucid_training",
          resourceExtension: "mp3",
          sha256: trainingHash,
          byteLength: 10_068_223
        ),
      ],
      model: WatchRuntimeModelV3(
        modelId: "lucidtlr-watch-rem-informed-v3",
        modelVersion: "lucidtlr-watch-rem-informed-v3-contract-2026-06-07",
        sha256: nil,
        evaluatorType: "deterministic-swift"
      ),
      privacy: WatchRuntimePrivacyV3(
        noGps: true,
        noSensorKit: true,
        noLiveAppleSleepStages: true,
        noSpO2: true,
        noRespiratoryRate: true,
        noWristTemperature: true
      )
    )
  }
}
