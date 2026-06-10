#if DEBUG || EXPO_CONFIGURATION_DEBUG || LUCIDTLR_INTERNAL_TESTFLIGHT_LAB
import Foundation

enum WatchBaselineLoopStage: String {
  case commit
  case seal
  case transfer
  case receipt
  case snapshot
}

struct WatchBaselineLoopRunResult {
  let plan: WatchRuntimePlanV3
  let coordinator: WatchSessionCoordinator?
  let sessionStore: WatchSessionDirectoryStore?
  let currentSessionIndex: WatchCurrentSessionIndex
  let activeManifest: WatchPackageManifestV3?
  let discardedStaleSessionId: String?
  let retransferredExistingPackage: Bool
  let statusMessage: String
}

final class WatchBaselineLoopRunner {
  private let transportCoordinator: WatchTransportCoordinator

  init(transportCoordinator: WatchTransportCoordinator = .shared) {
    self.transportCoordinator = transportCoordinator
  }

  func run() throws -> WatchBaselineLoopRunResult {
    try transportCoordinator.activate()
    transportCoordinator.refreshStatus()
    guard let stagedPlan = try transportCoordinator.latestStagedPlan() else {
      let error = WatchTransportError.noStagedPlan
      reportStageError(
        .commit,
        error: error,
        message: "Watch baseline loop could not find a staged synthetic plan. Run One-Button Baseline on phone first, then retry the Watch baseline loop."
      )
      throw error
    }

    let plan = stagedPlan.plan
    if let existing = try retransferExistingBaselinePackageIfPossible(plan: plan) {
      return existing
    }

    let discardedStaleSessionId = try runStage(.commit) {
      try discardStaleBaselineCurrentSessionIfNeeded(for: plan)
    }
    let prepared = try runStage(.commit) {
      try makeCoordinator(
        plan: plan,
        preflightScenario: .allPass,
        requiresStartPreflight: false
      )
    }

    try runStage(.commit) {
      try prepared.coordinator.commit(plan: plan)
      try prepared.index.recordCommit(
        plan: plan,
        runtimeState: .planCommitted,
        updatedAt: WatchSyntheticRuntimeFixtures.fixtureStartDateForStorage()
      )
    }

    let committedEntry = try runStage(.receipt) {
      guard let entry = try prepared.index.load() else {
        throw WatchTransportError.noCommittedSession
      }

      try transportCoordinator.sendCommitReceipt(
        plan: plan,
        commitId: entry.commitId,
        watchState: entry.runtimeState,
        committedAt: WatchRuntimeDateFormat.date(from: entry.updatedAt) ?? Date()
      )
      return entry
    }

    let manifest = try runStage(.seal) {
      try sealSyntheticPackageIfNeeded(
        coordinator: prepared.coordinator,
        plan: plan,
        sessionStore: prepared.sessionStore,
        index: prepared.index
      )
    }
    let transferredManifest = try runStage(.transfer) {
      try transferSealedPackage(
        manifest: manifest,
        sessionStore: prepared.sessionStore,
        runtimeState: prepared.coordinator.state,
        index: prepared.index
      )
    }
    let sealedEntry = try? prepared.index.load()

    try runStage(.snapshot) {
      try transportCoordinator.sendStatusSnapshot(
        sessionId: sealedEntry?.activeSessionId ?? plan.sessionId,
        planHash: sealedEntry?.planHash ?? plan.planHash,
        watchState: sealedEntry?.runtimeState ?? prepared.coordinator.state,
        packageId: sealedEntry?.sealedPackageId ?? transferredManifest.packageId,
        packageHash: sealedEntry?.sealedPackageHash ?? transferredManifest.packageHash,
        createdAt: Date()
      )
    }

    let statusMessage: String
    if let discardedStaleSessionId {
      statusMessage = "Ran Watch baseline loop after discarding stale synthetic current session \(discardedStaleSessionId); committed latest staged plan, sent receipt/status, sealed and transferred package. Synthetic lab only; no real sensors or cues."
    } else {
      statusMessage = "Ran Watch baseline loop: committed staged plan, sent receipt/status, sealed and transferred package. Synthetic lab only; no real sensors or cues."
    }

    return WatchBaselineLoopRunResult(
      plan: plan,
      coordinator: prepared.coordinator,
      sessionStore: prepared.sessionStore,
      currentSessionIndex: prepared.index,
      activeManifest: transferredManifest,
      discardedStaleSessionId: discardedStaleSessionId,
      retransferredExistingPackage: false,
      statusMessage: statusMessage
    )
  }

  private func retransferExistingBaselinePackageIfPossible(
    plan: WatchRuntimePlanV3
  ) throws -> WatchBaselineLoopRunResult? {
    let rootDirectory = try labRootDirectory()
    let index = WatchCurrentSessionIndex(rootDirectory: rootDirectory)

    guard let entry = try index.load(),
      entry.isActiveUnacked,
      entry.activeSessionId == plan.sessionId else {
      return nil
    }

    guard entry.planHash == plan.planHash else {
      throw WatchTransportError.invalidPlanPayload
    }

    guard let sealedPackageId = entry.sealedPackageId,
      let sealedPackageHash = entry.sealedPackageHash else {
      return nil
    }

    let existingSessionStore = try WatchSessionDirectoryStore(
      rootDirectory: rootDirectory,
      sessionId: entry.activeSessionId
    )
    let packageStore = WatchPackageStore(sessionStore: existingSessionStore)

    guard let manifest = try packageStore.readManifest(),
      manifest.packageId == sealedPackageId,
      manifest.packageHash == sealedPackageHash else {
      throw WatchTransportError.packageHashMismatch
    }

    try runStage(.receipt) {
      try transportCoordinator.sendCommitReceipt(
        plan: plan,
        commitId: entry.commitId,
        watchState: entry.runtimeState,
        committedAt: WatchRuntimeDateFormat.date(from: entry.updatedAt) ?? Date()
      )
    }

    let transferredManifest = try runStage(.transfer) {
      try transferSealedPackage(
        manifest: manifest,
        sessionStore: existingSessionStore,
        runtimeState: entry.runtimeState,
        index: index
      )
    }

    try runStage(.snapshot) {
      try transportCoordinator.sendStatusSnapshot(
        sessionId: entry.activeSessionId,
        planHash: entry.planHash,
        watchState: entry.runtimeState,
        packageId: sealedPackageId,
        packageHash: sealedPackageHash,
        createdAt: Date()
      )
    }

    return WatchBaselineLoopRunResult(
      plan: plan,
      coordinator: nil,
      sessionStore: existingSessionStore,
      currentSessionIndex: index,
      activeManifest: transferredManifest,
      discardedStaleSessionId: nil,
      retransferredExistingPackage: true,
      statusMessage: "Retransferred existing sealed baseline package for the staged synthetic plan. No new session or package was created."
    )
  }

  private func discardStaleBaselineCurrentSessionIfNeeded(
    for plan: WatchRuntimePlanV3
  ) throws -> String? {
    let index = WatchCurrentSessionIndex(rootDirectory: try labRootDirectory())

    guard let entry = try index.load(),
      entry.isActiveUnacked,
      entry.activeSessionId != plan.sessionId else {
      return nil
    }

    try index.discardSyntheticLabSession(
      explicitConfirmation: true,
      discardedAt: WatchSyntheticRuntimeFixtures.fixtureStartDateForStorage()
    )
    return entry.activeSessionId
  }

  private func makeCoordinator(
    plan: WatchRuntimePlanV3,
    preflightScenario: SyntheticPreflightScenario,
    requiresStartPreflight: Bool
  ) throws -> (
    coordinator: WatchSessionCoordinator,
    sessionStore: WatchSessionDirectoryStore,
    index: WatchCurrentSessionIndex
  ) {
    let startDate = WatchSyntheticRuntimeFixtures.fixtureStartDateForStorage()
    let rootDirectory = try labRootDirectory()
    let index = WatchCurrentSessionIndex(rootDirectory: rootDirectory)
    try index.requireCanStartSession(sessionId: plan.sessionId)
    let sessionStore = try WatchSessionDirectoryStore(
      rootDirectory: rootDirectory,
      sessionId: plan.sessionId
    )
    let packageStore = WatchPackageStore(sessionStore: sessionStore)
    let coordinator = WatchSessionCoordinator(
      clock: DeterministicWatchClock(start: startDate),
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
      logStoreFactory: { _ in try WatchFileBackedLogStore(sessionStore: sessionStore) },
      preflightProvider: SyntheticPreflightProvider(scenario: preflightScenario),
      requiresStartPreflight: requiresStartPreflight
    )

    return (coordinator, sessionStore, index)
  }

  private func sealSyntheticPackageIfNeeded(
    coordinator: WatchSessionCoordinator,
    plan: WatchRuntimePlanV3,
    sessionStore: WatchSessionDirectoryStore,
    index: WatchCurrentSessionIndex
  ) throws -> WatchPackageManifestV3 {
    if coordinator.state == .planCommitted {
      try coordinator.startCommittedPlan()
      try index.recordRuntimeState(
        sessionId: plan.sessionId,
        runtimeState: coordinator.state,
        updatedAt: WatchSyntheticRuntimeFixtures.fixtureStartDateForStorage()
      )
    }

    let manifest: WatchPackageManifestV3?
    if coordinator.state == .sealedWaitingForPhone {
      manifest = coordinator.sealedManifest
    } else {
      manifest = try coordinator.stopAndSeal(reason: .manualForceSeal)
    }

    guard let manifest else {
      throw WatchTransportError.noSealedPackage
    }

    try index.recordSealedPackage(
      manifest: manifest,
      runtimeState: coordinator.state,
      updatedAt: WatchSyntheticRuntimeFixtures.fixtureStartDateForStorage()
    )
    _ = sessionStore
    return manifest
  }

  private func transferSealedPackage(
    manifest: WatchPackageManifestV3,
    sessionStore: WatchSessionDirectoryStore,
    runtimeState: WatchRuntimeState,
    index: WatchCurrentSessionIndex
  ) throws -> WatchPackageManifestV3 {
    let package = try WatchTransportPackageBuilder.buildTransferPackage(
      sessionStore: sessionStore,
      baseManifest: manifest
    )
    let packageURL = try WatchTransportPackageBuilder.writePackageFile(
      package: package,
      rootDirectory: labRootDirectory()
    )
    try index.recordSealedPackage(
      manifest: package.manifest,
      runtimeState: runtimeState,
      updatedAt: WatchSyntheticRuntimeFixtures.fixtureStartDateForStorage()
    )
    try transportCoordinator.transferPackage(
      package: package,
      fileURL: packageURL,
      createdAt: Date()
    )
    return package.manifest
  }

  private func labRootDirectory() throws -> URL {
    let root = try WatchStoragePaths.defaultRootDirectory()
      .appendingPathComponent("WatchModeLabSynthetic", isDirectory: true)
    try FileManager.default.createDirectory(
      at: root,
      withIntermediateDirectories: true,
      attributes: nil
    )
    return root
  }

  private func runStage<T>(
    _ stage: WatchBaselineLoopStage,
    _ work: () throws -> T
  ) throws -> T {
    do {
      return try work()
    } catch {
      reportStageError(stage, error: error)
      throw error
    }
  }

  private func reportStageError(
    _ stage: WatchBaselineLoopStage,
    error: Error,
    message: String? = nil
  ) {
    try? transportCoordinator.sendTransportError(
      errorCode: "watch_auto_baseline_failed",
      errorMessage: "stage=\(stage.rawValue): \(message ?? String(describing: error))",
      createdAt: Date()
    )
  }
}
#endif
