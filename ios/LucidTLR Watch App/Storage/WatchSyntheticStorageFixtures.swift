import Foundation

struct WatchSyntheticStorageRunResult: Equatable {
  let runResult: WatchSyntheticRunResult
  let sessionDirectory: URL
  let canDeleteBeforeAck: Bool
  let canDeleteAfterMatchingAck: Bool
  let sealedButUnackedSessionCount: Int
}

enum WatchSyntheticStorageFixtures {
  static func runTenMinuteFileBackedTlrFixture(rootDirectory: URL) throws -> WatchSyntheticStorageRunResult {
    let startDate = WatchSyntheticRuntimeFixtures.fixtureStartDateForStorage()
    let plan = WatchSyntheticRuntimeFixtures.makeTlrPlanFixture()
    let clock = DeterministicWatchClock(start: startDate)
    let sessionStore = try WatchSessionDirectoryStore(
      rootDirectory: rootDirectory,
      sessionId: plan.sessionId
    )
    let packageStore = WatchPackageStore(sessionStore: sessionStore)
    let coordinator = WatchSessionCoordinator(
      clock: clock,
      heartRateProvider: SyntheticHeartRateProvider(startDate: startDate, pattern: .plausibleSleep),
      motionProvider: SyntheticMotionProvider(
        startDate: startDate,
        sampleHz: plan.epoching.motionSampleHz,
        pattern: .lowMovement
      ),
      batteryProvider: SyntheticBatteryProvider(startLevel: 0.9, drainPerHour: 0.02),
      powerModeProvider: SyntheticPowerModeProvider(isLowPowerModeEnabled: false),
      cueOutputProvider: SyntheticCueOutputProvider(shouldDeliver: true),
      packageSealer: packageStore,
      logStoreFactory: { _ in try WatchFileBackedLogStore(sessionStore: sessionStore) }
    )

    try coordinator.commit(plan: plan)
    try coordinator.startCommittedPlan()
    try coordinator.runEpochs(20)
    let manifest = try coordinator.stopAndSeal(reason: .completed)
    let ackStore = WatchPackageAckStore(sessionStore: sessionStore)
    let canDeleteBeforeAck = ackStore.canDeletePackageAfterAck(manifest)
    let sealedButUnacked = try WatchSessionDirectoryStore.sealedButUnackedPackages(
      rootDirectory: rootDirectory
    ).count
    try ackStore.recordAck(
      packageId: manifest.packageId,
      packageHash: manifest.packageHash,
      acknowledgedAt: clock.now
    )

    let runResult = WatchSyntheticRunResult(
      finalState: coordinator.state,
      manifest: manifest,
      events: coordinator.logStore?.events ?? [],
      epochs: coordinator.logStore?.epochRecords ?? [],
      cueRecords: coordinator.logStore?.cueRecords ?? [],
      movementRecords: coordinator.logStore?.movementRecords ?? []
    )

    return WatchSyntheticStorageRunResult(
      runResult: runResult,
      sessionDirectory: sessionStore.sessionDirectory,
      canDeleteBeforeAck: canDeleteBeforeAck,
      canDeleteAfterMatchingAck: ackStore.canDeletePackageAfterAck(manifest),
      sealedButUnackedSessionCount: sealedButUnacked
    )
  }
}
