#if DEBUG || EXPO_CONFIGURATION_DEBUG || LUCIDTLR_INTERNAL_TESTFLIGHT_LAB
import Combine
import Foundation

enum WatchModeLabDisplayMode {
  case menu
  case instructions
  case sleepShield
}

struct WatchModeLabStatusRow: Identifiable, Equatable {
  let id: String
  let label: String
  let value: String
}

@MainActor
final class WatchModeLabViewModel: ObservableObject {
  @Published var displayMode: WatchModeLabDisplayMode = .menu
  @Published var autoBaselineEnabled: Bool
  @Published private(set) var statusMessage = "Internal TestFlight Lab."
  @Published private(set) var statusRows: [WatchModeLabStatusRow] = [
    WatchModeLabStatusRow(id: "scope", label: "scope", value: "internal lab only"),
    WatchModeLabStatusRow(id: "public", label: "public Watch Mode", value: "disabled"),
    WatchModeLabStatusRow(id: "transport", label: "WatchConnectivity", value: "frozen lab path"),
  ]
  @Published private(set) var selectedPreflightScenario: SyntheticPreflightScenario = .allPass
  @Published var forcedCueAfterMinutes = 10
  @Published var applyForcedCueToNextRealSession = false
  @Published var sleepShieldViewModel: SleepShieldViewModel?

  private var coordinator: WatchSessionCoordinator?
  private var sessionStore: WatchSessionDirectoryStore?
  private var currentSessionIndex: WatchCurrentSessionIndex?
  private var activePlan: WatchRuntimePlanV3?
  private var activeManifest: WatchPackageManifestV3?
  private var activePreflightResult: WatchRuntimePreflightResult?
  private var activeProviderSet = "synthetic"
  private let transportCoordinator = WatchTransportCoordinator.shared
  private let baselineRunner: WatchBaselineLoopRunner
  private let autoBaselineController: WatchAutoBaselineController
  private let forcedCueSettings = WatchNightSessionForcedCueSettings.shared
  private let nightSessionController = WatchNightSessionController.shared
  private var cancellables = Set<AnyCancellable>()

  init() {
    let autoBaselineController = WatchAutoBaselineController.shared
    self.baselineRunner = WatchBaselineLoopRunner()
    self.autoBaselineController = autoBaselineController
    self.autoBaselineEnabled = autoBaselineController.isAutoBaselineEnabled
    self.applyForcedCueToNextRealSession = forcedCueSettings.applyToNextRealSession
    self.forcedCueAfterMinutes = forcedCueSettings.minutes

    autoBaselineController.$isAutoBaselineEnabled
      .receive(on: DispatchQueue.main)
      .sink { [weak self] isEnabled in
        self?.autoBaselineEnabled = isEnabled
        self?.refreshRows()
      }
      .store(in: &cancellables)

    autoBaselineController.$lastRunSummary
      .receive(on: DispatchQueue.main)
      .sink { [weak self] _ in
        self?.refreshRows()
      }
      .store(in: &cancellables)

    forcedCueSettings.$applyToNextRealSession
      .receive(on: DispatchQueue.main)
      .sink { [weak self] isEnabled in
        self?.applyForcedCueToNextRealSession = isEnabled
        self?.refreshRows()
      }
      .store(in: &cancellables)

    forcedCueSettings.$minutes
      .receive(on: DispatchQueue.main)
      .sink { [weak self] minutes in
        self?.forcedCueAfterMinutes = minutes
        self?.refreshRows()
      }
      .store(in: &cancellables)

    nightSessionController.$sleepShieldViewModel
      .receive(on: DispatchQueue.main)
      .sink { [weak self] viewModel in
        guard self?.activeProviderSet == "real" else {
          return
        }

        self?.sleepShieldViewModel = viewModel
      }
      .store(in: &cancellables)

    nightSessionController.$statusMessage
      .receive(on: DispatchQueue.main)
      .sink { [weak self] message in
        guard self?.activeProviderSet == "real" else {
          return
        }

        self?.statusMessage = message
        self?.refreshRows()
      }
      .store(in: &cancellables)

  }

  func showInstructions() {
    displayMode = .instructions
  }

  func showMenu() {
    refreshRows()
    displayMode = .menu
  }

  func commitSyntheticTlrPlan() {
    do {
      let plan = WatchSyntheticRuntimeFixtures.makeTlrPlanFixture(
        sessionId: uniqueSessionId(prefix: "watch-lab-tlr")
      )
      coordinator = try makeCoordinator(plan: plan, preflightScenario: .allPass)
      try coordinator?.commit(plan: plan)
      try currentSessionIndex?.recordCommit(
        plan: plan,
        runtimeState: .planCommitted,
        updatedAt: WatchSyntheticRuntimeFixtures.fixtureStartDateForStorage()
      )
      activePlan = plan
      activeManifest = nil
      activePreflightResult = nil
      statusMessage = "Committed synthetic TLR plan locally on Watch. No phone or transport was used."
      refreshRows()
    } catch {
      handle(error: error)
    }
  }

  func runTenMinuteTlrSessionWithoutPreflight() {
    do {
      let plan = WatchSyntheticRuntimeFixtures.makeTlrPlanFixture(
        sessionId: uniqueSessionId(prefix: "watch-lab-tlr")
      )
      try runTenMinuteSession(
        plan: plan,
        preflightScenario: selectedPreflightScenario,
        requiresStartPreflight: false
      )
      statusMessage = "Ran synthetic TLR session without enforcing preflight. Lab-only bypass; no real providers were used."
    } catch {
      handle(error: error)
    }
  }

  func runTenMinuteTlrSessionWithPreflight() {
    do {
      let plan = preflightPreviewPlan(
        prefix: "watch-lab-tlr",
        scenario: selectedPreflightScenario
      )
      try runTenMinuteSession(
        plan: plan,
        preflightScenario: selectedPreflightScenario,
        requiresStartPreflight: true
      )
      statusMessage = "Ran synthetic TLR session with \(selectedPreflightScenario.label) enforced before start."
    } catch {
      handle(error: error)
    }
  }

  func runTenMinuteSleepLogSession() {
    do {
      let plan = WatchSyntheticRuntimeFixtures.makeSleepLogPlanFixture(
        sessionId: uniqueSessionId(prefix: "watch-lab-sleep-log")
      )
      try runTenMinuteSession(
        plan: plan,
        preflightScenario: selectedPreflightScenario,
        requiresStartPreflight: true
      )
      statusMessage = "Ran synthetic sleep_log session with preflight, cueing disabled, and sealed a package."
    } catch {
      handle(error: error)
    }
  }

  func runRealProviderForcedCueSession() {
    #if targetEnvironment(simulator)
    runSyntheticForcedCueFallbackSession()
    #else
    Task { @MainActor in
      activeProviderSet = "real"
      await nightSessionController.startLabForcedCueSession(
        forcedCueAfterMinutes: forcedCueAfterMinutes
      )
      sleepShieldViewModel = nightSessionController.sleepShieldViewModel
      statusMessage = nightSessionController.statusMessage
      refreshRows()
    }
    #endif
  }

  func endRealProviderSessionAndTransfer() {
    guard activeProviderSet == "real" else {
      statusMessage = "No active real-provider session is running."
      refreshRows()
      return
    }

    nightSessionController.endActiveSessionAndTransfer()
    sleepShieldViewModel = nightSessionController.sleepShieldViewModel
    statusMessage = nightSessionController.statusMessage
    refreshRows()
  }

  func showPreflight(_ scenario: SyntheticPreflightScenario) {
    selectedPreflightScenario = scenario
    let plan = preflightPreviewPlan(prefix: "watch-lab-preflight", scenario: scenario)
    activePlan = plan
    activeManifest = nil
    activePreflightResult = WatchRuntimePreflightFixtures.result(for: scenario, plan: plan)
    statusMessage = "\(scenario.label) evaluated in the synthetic lab. No real sensors, haptics, audio, workout runtime, or transport were started."
    refreshRows()
  }

  func enterSleepShield() {
    do {
      if coordinator == nil || coordinator?.state == .sealedWaitingForPhone {
        let plan = WatchSyntheticRuntimeFixtures.makeTlrPlanFixture(
          sessionId: uniqueSessionId(prefix: "watch-lab-shield")
        )
        coordinator = try makeCoordinator(plan: plan, preflightScenario: .allPass)
        try coordinator?.commit(plan: plan)
        activePlan = plan
      }

      if coordinator?.state == .planCommitted {
        try coordinator?.startCommittedPlan()
        if let activePlan {
          try currentSessionIndex?.recordRuntimeState(
            sessionId: activePlan.sessionId,
            runtimeState: coordinator?.state ?? .training,
            updatedAt: WatchSyntheticRuntimeFixtures.fixtureStartDateForStorage()
          )
        }
      }

      guard let coordinator else {
        throw WatchSessionCoordinatorError.noCommittedPlan
      }

      sleepShieldViewModel = makeSleepShieldViewModel(coordinator: coordinator)
      statusMessage = "Entered black sleep shield. Tap logs watch_user_interaction into the synthetic coordinator."
      refreshRows()
      displayMode = .sleepShield
    } catch {
      handle(error: error)
    }
  }

  func forceSealPackage() {
    do {
      if coordinator == nil {
        let plan = WatchSyntheticRuntimeFixtures.makeTlrPlanFixture(
          sessionId: uniqueSessionId(prefix: "watch-lab-force-seal")
        )
        coordinator = try makeCoordinator(plan: plan, preflightScenario: .allPass)
        try coordinator?.commit(plan: plan)
        try coordinator?.startCommittedPlan()
        activePlan = plan
      } else if coordinator?.state == .planCommitted {
        try coordinator?.startCommittedPlan()
      }

      guard let coordinator else {
        throw WatchSessionCoordinatorError.noCommittedPlan
      }

      activeManifest = try coordinator.stopAndSeal(reason: .userWake)
      try currentSessionIndex?.recordSealedPackage(
        manifest: activeManifest!,
        runtimeState: coordinator.state,
        updatedAt: WatchSyntheticRuntimeFixtures.fixtureStartDateForStorage()
      )
      statusMessage = "Force sealed synthetic package. Package is retained until a matching ack exists; no deletion was performed."
      refreshRows()
    } catch {
      handle(error: error)
    }
  }

  func recoverCurrentSyntheticSession() {
    do {
      let index = try labIndex()
      guard let entry = try index.load() else {
        statusMessage = "No current synthetic Watch session index exists."
        refreshRows()
        return
      }

      currentSessionIndex = index
      statusMessage = "Recovered current synthetic session index \(entry.activeSessionId) in state \(entry.runtimeState.rawValue). No transport or sensor runtime was started."
      refreshRows()
    } catch {
      handle(error: error)
    }
  }

  func sealCurrentSyntheticSession() {
    forceSealPackage()
  }

  func recordSyntheticAck() {
    do {
      let index = try labIndex()
      let entry = try index.load()
      let manifest = activeManifest ?? coordinator?.sealedManifest
      let packageId = manifest?.packageId ?? entry?.sealedPackageId
      let packageHash = manifest?.packageHash ?? entry?.sealedPackageHash

      guard let packageId, let packageHash else {
        throw WatchCurrentSessionIndexError.missingCurrentSession
      }

      let rootDirectory = try labRootDirectory()
      let sessionId = manifest?.sessionId ?? entry?.activeSessionId ?? activePlan?.sessionId
      guard let sessionId else {
        throw WatchCurrentSessionIndexError.missingCurrentSession
      }

      let store = try WatchSessionDirectoryStore(
        rootDirectory: rootDirectory,
        sessionId: sessionId
      )
      let ackDate = WatchSyntheticRuntimeFixtures.fixtureStartDateForStorage()
      try WatchPackageAckStore(sessionStore: store).recordAck(
        packageId: packageId,
        packageHash: packageHash,
        acknowledgedAt: ackDate
      )
      try index.recordAck(
        packageId: packageId,
        packageHash: packageHash,
        updatedAt: ackDate
      )
      currentSessionIndex = index
      statusMessage = "Recorded synthetic ack for current package. This unlocks retention but does not delete package files."
      refreshRows()
    } catch {
      handle(error: error)
    }
  }

  func activateTransport() {
    do {
      try transportCoordinator.activate()
      statusMessage = "Activated synthetic WatchConnectivity transport. Reachability is informational only and is not Watch runtime truth."
      refreshRows()
    } catch {
      handle(error: error)
    }
  }

  func checkOrPullStagedSyntheticPlan() {
    do {
      transportCoordinator.refreshStatus()
      guard let stagedPlan = try transportCoordinator.latestStagedPlan() else {
        statusMessage = "No staged synthetic plan is available from transport."
        refreshRows()
        return
      }

      activePlan = stagedPlan.plan
      activeManifest = nil
      activePreflightResult = nil
      statusMessage = "Pulled staged synthetic plan \(stagedPlan.sessionId). This did not start runtime."
      refreshRows()
    } catch {
      handle(error: error)
    }
  }

  func commitStagedTransportPlan() {
    do {
      guard let stagedPlan = try transportCoordinator.latestStagedPlan() else {
        throw WatchTransportError.noStagedPlan
      }

      let plan = stagedPlan.plan
      let nextCoordinator = try makeCoordinator(
        plan: plan,
        preflightScenario: .allPass,
        requiresStartPreflight: false
      )
      try nextCoordinator.commit(plan: plan)
      try currentSessionIndex?.recordCommit(
        plan: plan,
        runtimeState: .planCommitted,
        updatedAt: WatchSyntheticRuntimeFixtures.fixtureStartDateForStorage()
      )
      coordinator = nextCoordinator
      activePlan = plan
      activeManifest = nil
      activePreflightResult = nil
      statusMessage = "Committed staged synthetic transport plan locally on Watch. Runtime was not started."
      refreshRows()
    } catch {
      handle(error: error)
    }
  }

  func sendTransportCommitReceipt() {
    do {
      let stagedPlan = try transportCoordinator.latestStagedPlan()?.plan
      guard let plan = activePlan ?? stagedPlan else {
        throw WatchTransportError.noStagedPlan
      }
      guard let entry = try currentSessionIndex?.load() else {
        throw WatchTransportError.noCommittedSession
      }

      try transportCoordinator.sendCommitReceipt(
        plan: plan,
        commitId: entry.commitId,
        watchState: entry.runtimeState,
        committedAt: WatchRuntimeDateFormat.date(from: entry.updatedAt) ?? Date()
      )
      statusMessage = "Queued synthetic Watch commit receipt over WatchConnectivity."
      refreshRows()
    } catch {
      handle(error: error)
    }
  }

  func sendTransportStatusSnapshot() {
    do {
      transportCoordinator.refreshStatus()
      let entry = try currentSessionIndex?.load()
      let stagedPlan = try transportCoordinator.latestStagedPlan()?.plan
      let plan = activePlan ?? stagedPlan
      let manifest = activeManifest ?? coordinator?.sealedManifest
      try transportCoordinator.sendStatusSnapshot(
        sessionId: entry?.activeSessionId ?? plan?.sessionId,
        planHash: entry?.planHash ?? plan?.planHash,
        watchState: entry?.runtimeState ?? coordinator?.state ?? .idle,
        packageId: entry?.sealedPackageId ?? manifest?.packageId,
        packageHash: entry?.sealedPackageHash ?? manifest?.packageHash,
        createdAt: Date()
      )
      statusMessage = "Queued last-known synthetic Watch status snapshot. Reachability was not treated as running truth."
      refreshRows()
    } catch {
      handle(error: error)
    }
  }

  func transferSealedSyntheticPackage() {
    do {
      try transferSyntheticPackage()
      statusMessage = "Queued sealed synthetic package manifest and file transfer. Package remains on Watch until matching ack."
      refreshRows()
    } catch {
      reportTransportPackageError(error)
      handle(error: error)
    }
  }

  func retryTransportPackageTransfer() {
    do {
      try transferSyntheticPackage()
      statusMessage = "Retried sealed synthetic package transfer with the same session/package identity."
      refreshRows()
    } catch {
      reportTransportPackageError(error)
      handle(error: error)
    }
  }

  func recordReceivedTransportAck() {
    do {
      let recorded = try transportCoordinator.recordLatestAckIfMatches(
        rootDirectory: labRootDirectory()
      )
      statusMessage = recorded
        ? "Recorded received package ack into Watch storage and current session index."
        : "No received package ack is waiting to be recorded."
      refreshRows()
    } catch {
      handle(error: error)
    }
  }

  func reloadTransportCurrentSessionIndex() {
    do {
      currentSessionIndex = try labIndex()
      transportCoordinator.refreshStatus()
      statusMessage = "Reloaded current session index and synthetic transport status from local Watch storage."
      refreshRows()
    } catch {
      handle(error: error)
    }
  }

  func setAutoBaselineEnabled(_ isEnabled: Bool) {
    autoBaselineController.setAutoBaselineEnabled(isEnabled)
  }

  func setApplyForcedCueToNextRealSession(_ isEnabled: Bool) {
    forcedCueSettings.setApplyToNextRealSession(isEnabled)
  }

  func setForcedCueAfterMinutes(_ minutes: Int) {
    forcedCueSettings.setMinutes(minutes)
  }

  func runWatchBaselineTransportLoop() {
    do {
      let result = try baselineRunner.run()
      coordinator = result.coordinator
      sessionStore = result.sessionStore
      currentSessionIndex = result.currentSessionIndex
      activePlan = result.plan
      activeManifest = result.activeManifest
      activePreflightResult = nil
      sleepShieldViewModel = nil
      statusMessage = result.statusMessage
      refreshRows()
    } catch {
      handle(error: error)
    }
  }

  func discardCurrentSyntheticSessionWithExplicitConfirmation() {
    do {
      let index = try labIndex()
      let entry = try index.load()
      if entry != nil {
        try index.discardSyntheticLabSession(
          explicitConfirmation: true,
          discardedAt: WatchSyntheticRuntimeFixtures.fixtureStartDateForStorage()
        )
      }
      transportCoordinator.clearLabStatus()
      currentSessionIndex = index
      coordinator = nil
      sessionStore = nil
      activePlan = nil
      activeManifest = nil
      activePreflightResult = nil
      sleepShieldViewModel = nil
      statusMessage = entry == nil
        ? "Cleared Watch synthetic transport lab state. No current session index existed and no package deletion was performed."
        : "Discarded synthetic Watch lab session and cleared Watch transport lab state with explicit local-only confirmation. No package deletion was performed."
      refreshRows()
    } catch {
      handle(error: error)
    }
  }

  private func transferSyntheticPackage() throws {
    let sealed = try sealSyntheticPackageIfNeeded()
    try transferSealedPackage(
      manifest: sealed.manifest,
      sessionStore: sealed.sessionStore,
      runtimeState: coordinator?.state ?? .sealedWaitingForPhone
    )
  }

  private func transferSealedPackage(
    manifest: WatchPackageManifestV3,
    sessionStore: WatchSessionDirectoryStore,
    runtimeState: WatchRuntimeState,
    updatedAt: Date = WatchSyntheticRuntimeFixtures.fixtureStartDateForStorage()
  ) throws {
    let package = try WatchTransportPackageBuilder.buildTransferPackage(
      sessionStore: sessionStore,
      baseManifest: manifest
    )
    let packageURL = try WatchTransportPackageBuilder.writePackageFile(
      package: package,
      rootDirectory: labRootDirectory()
    )
    try currentSessionIndex?.recordSealedPackage(
      manifest: package.manifest,
      runtimeState: runtimeState,
      updatedAt: updatedAt
    )
    activeManifest = package.manifest
    try transportCoordinator.transferPackage(
      package: package,
      fileURL: packageURL,
      createdAt: Date()
    )
  }

  private func sealSyntheticPackageIfNeeded() throws -> (
    manifest: WatchPackageManifestV3,
    sessionStore: WatchSessionDirectoryStore
  ) {
    if let activeManifest, let sessionStore {
      return (activeManifest, sessionStore)
    }

    if coordinator == nil {
      let stagedPlan = try transportCoordinator.latestStagedPlan()?.plan
      let plan = activePlan ?? stagedPlan ?? WatchSyntheticRuntimeFixtures.makeTlrPlanFixture(
        sessionId: uniqueSessionId(prefix: "watch-lab-transport-seal")
      )
      coordinator = try makeCoordinator(plan: plan, preflightScenario: .allPass)
      try coordinator?.commit(plan: plan)
      try currentSessionIndex?.recordCommit(
        plan: plan,
        runtimeState: .planCommitted,
        updatedAt: WatchSyntheticRuntimeFixtures.fixtureStartDateForStorage()
      )
      activePlan = plan
    }

    if coordinator?.state == .planCommitted {
      try coordinator?.startCommittedPlan()
      if let activePlan {
        try currentSessionIndex?.recordRuntimeState(
          sessionId: activePlan.sessionId,
          runtimeState: coordinator?.state ?? .training,
          updatedAt: WatchSyntheticRuntimeFixtures.fixtureStartDateForStorage()
        )
      }
    }

    guard let coordinator else {
      throw WatchSessionCoordinatorError.noCommittedPlan
    }

    if coordinator.state != .sealedWaitingForPhone {
      activeManifest = try coordinator.stopAndSeal(reason: .manualForceSeal)
    } else {
      activeManifest = coordinator.sealedManifest
    }

    guard let manifest = activeManifest, let sessionStore else {
      throw WatchTransportError.noSealedPackage
    }

    try currentSessionIndex?.recordSealedPackage(
      manifest: manifest,
      runtimeState: coordinator.state,
      updatedAt: WatchSyntheticRuntimeFixtures.fixtureStartDateForStorage()
    )
    return (manifest, sessionStore)
  }

  private func runTenMinuteSession(
    plan: WatchRuntimePlanV3,
    preflightScenario: SyntheticPreflightScenario,
    requiresStartPreflight: Bool
  ) throws {
    let nextCoordinator = try makeCoordinator(
      plan: plan,
      preflightScenario: preflightScenario,
      requiresStartPreflight: requiresStartPreflight
    )

    do {
      try nextCoordinator.commit(plan: plan)
      try currentSessionIndex?.recordCommit(
        plan: plan,
        runtimeState: .planCommitted,
        updatedAt: WatchSyntheticRuntimeFixtures.fixtureStartDateForStorage()
      )
      try nextCoordinator.startCommittedPlan()
      try currentSessionIndex?.recordRuntimeState(
        sessionId: plan.sessionId,
        runtimeState: nextCoordinator.state,
        updatedAt: WatchSyntheticRuntimeFixtures.fixtureStartDateForStorage()
      )
    } catch {
      coordinator = nextCoordinator
      activePlan = plan
      activePreflightResult = nextCoordinator.lastPreflightResult
      refreshRows()
      throw error
    }

    try nextCoordinator.runEpochs(20)
    activeManifest = try nextCoordinator.stopAndSeal(reason: .completed)
    if let activeManifest {
      try currentSessionIndex?.recordSealedPackage(
        manifest: activeManifest,
        runtimeState: nextCoordinator.state,
        updatedAt: WatchSyntheticRuntimeFixtures.fixtureStartDateForStorage()
      )
    }
    coordinator = nextCoordinator
    activePlan = plan
    activePreflightResult = nextCoordinator.lastPreflightResult
    sleepShieldViewModel = makeSleepShieldViewModel(coordinator: nextCoordinator)
    refreshRows()
  }

  private func runSyntheticForcedCueFallbackSession() {
    do {
      let startDate = WatchSyntheticRuntimeFixtures.fixtureStartDateForStorage()
      let plan = phaseCForcedCuePlan(
        sessionId: uniqueSessionId(prefix: "watch-lab-forced-cue-sim"),
        startedAt: startDate
      )
      let nextCoordinator = try makeCoordinator(
        plan: plan,
        preflightScenario: .allPass,
        requiresStartPreflight: true,
        forcedCueAfterSeconds: TimeInterval(forcedCueAfterMinutes * 60)
      )
      activeProviderSet = "synthetic simulator fallback"
      try nextCoordinator.commit(plan: plan)
      try currentSessionIndex?.recordCommit(
        plan: plan,
        runtimeState: .planCommitted,
        updatedAt: startDate
      )
      try nextCoordinator.startCommittedPlan()
      try currentSessionIndex?.recordRuntimeState(
        sessionId: plan.sessionId,
        runtimeState: nextCoordinator.state,
        updatedAt: startDate
      )

      let epochCount = max(
        1,
        Int(ceil((Double(forcedCueAfterMinutes * 60) + 60.0) / Double(plan.epoching.epochSeconds)))
      )
      try nextCoordinator.runEpochs(epochCount)
      activeManifest = try nextCoordinator.stopAndSeal(reason: .completed)
      if let activeManifest {
        try currentSessionIndex?.recordSealedPackage(
          manifest: activeManifest,
          runtimeState: nextCoordinator.state,
          updatedAt: WatchSyntheticRuntimeFixtures.fixtureStartDateForStorage()
        )
      }

      coordinator = nextCoordinator
      activePlan = plan
      activePreflightResult = nextCoordinator.lastPreflightResult
      sleepShieldViewModel = makeSleepShieldViewModel(coordinator: nextCoordinator)
      statusMessage = "Simulator fallback ran a synthetic forced-cue session. Real providers are device-only."
      refreshRows()
    } catch {
      handle(error: error)
    }
  }

  private func makeCoordinator(
    plan: WatchRuntimePlanV3,
    preflightScenario: SyntheticPreflightScenario,
    requiresStartPreflight: Bool = true,
    forcedCueAfterSeconds: TimeInterval? = nil
  ) throws -> WatchSessionCoordinator {
    activeProviderSet = "synthetic"
    let startDate = WatchSyntheticRuntimeFixtures.fixtureStartDateForStorage()
    let rootDirectory = try labRootDirectory()
    let index = WatchCurrentSessionIndex(rootDirectory: rootDirectory)
    try index.requireCanStartSession(sessionId: plan.sessionId)
    let nextSessionStore = try WatchSessionDirectoryStore(
      rootDirectory: rootDirectory,
      sessionId: plan.sessionId
    )
    let packageStore = WatchPackageStore(sessionStore: nextSessionStore)
    sessionStore = nextSessionStore
    currentSessionIndex = index

    return WatchSessionCoordinator(
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
      logStoreFactory: { _ in try WatchFileBackedLogStore(sessionStore: nextSessionStore) },
      preflightProvider: SyntheticPreflightProvider(scenario: preflightScenario),
      requiresStartPreflight: requiresStartPreflight,
      forcedCueAfterSeconds: forcedCueAfterSeconds
    )
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

  private func labIndex() throws -> WatchCurrentSessionIndex {
    let index = WatchCurrentSessionIndex(rootDirectory: try labRootDirectory())
    currentSessionIndex = index
    return index
  }

  private func makeSleepShieldViewModel(coordinator: WatchSessionCoordinator) -> SleepShieldViewModel {
    SleepShieldViewModel(
      snapshot: SleepShieldRuntimeSnapshot.from(coordinator: coordinator),
      interactionLogger: { coordinator.recordUserInteraction(kind: $0) },
      pushBackAction: { try? coordinator.deferTlrInterval(by: 30 * 60) },
      pauseResumeAction: {
        if coordinator.isTlrPaused {
          try? coordinator.resumeTlr()
        } else {
          try? coordinator.pauseTlr()
        }
      },
      wakeAction: { [weak self] in
        Task { @MainActor in
          self?.endActiveSessionFromSleepShield()
        }
      }
    )
  }

  private func endActiveSessionFromSleepShield() {
    if activeProviderSet == "real" {
      endRealProviderSessionAndTransfer()
    } else {
      forceSealPackage()
      sleepShieldViewModel = nil
      showMenu()
    }
  }

  private func refreshRows() {
    let state = coordinator?.state.rawValue ?? "idle"
    let epochCount = coordinator?.epochCount ?? 0
    let manifest = activeManifest ?? coordinator?.sealedManifest
    let ackState = ackRetentionState(for: manifest)
    let preflightResult: WatchRuntimePreflightResult? = activeProviderSet == "real"
      ? nil
      : activePreflightResult ?? coordinator?.lastPreflightResult
    transportCoordinator.refreshStatus()
    let transportStatus = transportCoordinator.status
    let currentIndexEntry: WatchCurrentSessionIndexEntry?
    if let currentSessionIndex {
      currentIndexEntry = try? currentSessionIndex.load()
    } else {
      currentIndexEntry = nil
    }

    var rows = [
      WatchModeLabStatusRow(id: "scope", label: "scope", value: "internal lab only"),
      WatchModeLabStatusRow(id: "providerSet", label: "provider set", value: activeProviderSet),
      WatchModeLabStatusRow(id: "storage", label: "storage", value: "file-backed JSONL"),
      WatchModeLabStatusRow(id: "session", label: "session", value: activePlan?.sessionId ?? "none"),
      WatchModeLabStatusRow(id: "currentIndexSession", label: "current index", value: currentIndexEntry?.activeSessionId ?? "none"),
      WatchModeLabStatusRow(id: "currentIndexState", label: "current index state", value: currentIndexEntry?.runtimeState.rawValue ?? "none"),
      WatchModeLabStatusRow(id: "currentIndexUnacked", label: "active/unacked", value: currentIndexEntry?.isActiveUnacked == true ? "yes" : "no"),
      WatchModeLabStatusRow(id: "state", label: "runtime state", value: state),
      WatchModeLabStatusRow(id: "epochs", label: "epoch count", value: "\(epochCount)"),
      WatchModeLabStatusRow(id: "forcedCue", label: "forced cue", value: "+\(forcedCueAfterMinutes) min"),
      WatchModeLabStatusRow(id: "forcedCueNextReal", label: "forced cue next real", value: applyForcedCueToNextRealSession ? "on" : "off"),
      WatchModeLabStatusRow(id: "cueStatus", label: "cue fired/suppressed", value: latestCueStatusLabel()),
      WatchModeLabStatusRow(id: "packageId", label: "packageId", value: manifest?.packageId ?? "not sealed"),
      WatchModeLabStatusRow(id: "packageHash", label: "packageHash", value: manifest.map { String($0.packageHash.prefix(24)) } ?? "not sealed"),
      WatchModeLabStatusRow(id: "events", label: "event count", value: manifest.map { "\($0.eventCount)" } ?? "0"),
      WatchModeLabStatusRow(id: "seal", label: "seal reason", value: manifest?.sealReason ?? "not sealed"),
      WatchModeLabStatusRow(id: "ack", label: "ack retention", value: ackState),
      WatchModeLabStatusRow(id: "transport", label: "WatchConnectivity", value: "synthetic lab only"),
      WatchModeLabStatusRow(id: "transportActivation", label: "WC activation", value: transportStatus.activationState),
      WatchModeLabStatusRow(id: "transportReachable", label: "reachable", value: transportStatus.reachable ? "yes -- informational only" : "no -- informational only"),
      WatchModeLabStatusRow(id: "transportLastMessage", label: "last WC message", value: transportStatus.lastMessageType ?? "none"),
      WatchModeLabStatusRow(id: "transportLastAt", label: "last WC time", value: transportStatus.lastMessageAt ?? "none"),
      WatchModeLabStatusRow(id: "transportStagedPlan", label: "staged plan", value: transportStatus.latestStagedPlanSessionId ?? "none"),
      WatchModeLabStatusRow(id: "transportCommit", label: "commit receipt", value: transportStatus.latestCommitReceiptSessionId ?? "not sent"),
      WatchModeLabStatusRow(id: "transportPackage", label: "package transfer", value: transportStatus.latestPackageId ?? "not transferred"),
      WatchModeLabStatusRow(id: "transportPackageStage", label: "package stage", value: transportStatus.latestPackageTransfer?.stage ?? "none"),
      WatchModeLabStatusRow(id: "transportPackageBytes", label: "package bytes", value: packageTransferBytesLabel(transportStatus.latestPackageTransfer)),
      WatchModeLabStatusRow(id: "transportOutstanding", label: "WC outstanding", value: packageTransferOutstandingLabel(transportStatus.latestPackageTransfer)),
      WatchModeLabStatusRow(id: "transportPackageError", label: "package error", value: transportStatus.latestPackageTransfer?.errorMessage ?? transportStatus.lastError ?? "none"),
      WatchModeLabStatusRow(id: "transportAck", label: "ack status", value: transportStatus.latestAckRecorded ? "matching ack recorded" : transportStatus.latestAckPackageId ?? "no ack"),
      WatchModeLabStatusRow(id: "autoBaseline", label: "auto baseline", value: autoBaselineEnabled ? "on" : "off"),
      WatchModeLabStatusRow(id: "lastAutoBaseline", label: "last auto run", value: autoBaselineController.lastRunSummary),
      WatchModeLabStatusRow(id: "transportStaleIgnored", label: "stale ignored", value: transportStatus.latestStaleIgnoredSummary ?? "none"),
      WatchModeLabStatusRow(id: "transportStaleIgnoredCount", label: "stale ignored count", value: "\(transportStatus.staleIgnoredCount)"),
      WatchModeLabStatusRow(id: "transportDuplicateIgnoredCount", label: "dupes ignored", value: "\(transportStatus.duplicateIgnoredCount)"),
      WatchModeLabStatusRow(id: "public", label: "public Watch Mode", value: "disabled"),
    ]

    if activeProviderSet == "real" {
      rows.append(contentsOf: nightSessionController.statusRows.map { row in
        WatchModeLabStatusRow(
          id: "night-\(row.id)",
          label: row.label,
          value: row.value
        )
      })
    }

    if let preflightResult {
      rows.append(contentsOf: preflightRows(from: preflightResult))
    } else {
      rows.append(WatchModeLabStatusRow(id: "preflight", label: "preflight", value: "not evaluated"))
    }

    statusRows = rows
  }

  private func preflightRows(from result: WatchRuntimePreflightResult) -> [WatchModeLabStatusRow] {
    [
      WatchModeLabStatusRow(id: "preflight", label: "preflight", value: result.canStart ? "can start" : "blocked"),
      WatchModeLabStatusRow(id: "preflightScenario", label: "fixture", value: selectedPreflightScenario.label),
      WatchModeLabStatusRow(id: "preflightBlocks", label: "blocking reasons", value: blockingReasonLabel(result)),
      WatchModeLabStatusRow(id: "preflightBattery", label: "battery", value: batteryLabel(result.batteryLevel)),
      WatchModeLabStatusRow(id: "preflightLowPower", label: "Low Power Mode", value: result.lowPowerModeEnabled ? "on" : "off"),
      WatchModeLabStatusRow(id: "preflightHealth", label: "HealthKit authorization", value: result.healthKitAuthorization.rawValue),
      WatchModeLabStatusRow(id: "preflightWorkout", label: "workout runtime", value: passFail(result.workoutRuntimeAvailable)),
      WatchModeLabStatusRow(id: "preflightMotion", label: "motion", value: passFail(result.motionAvailable)),
      WatchModeLabStatusRow(id: "preflightHaptic", label: "haptic preflight", value: preflightLabel(required: result.hapticPreflightRequired, passed: result.hapticPreflightPassed, available: result.hapticOutputAvailable)),
      WatchModeLabStatusRow(id: "preflightAudio", label: "audio preflight", value: preflightLabel(required: result.audioPreflightRequired, passed: result.audioPreflightPassed, available: result.audioOutputAvailable)),
      WatchModeLabStatusRow(id: "preflightAssets", label: "assets", value: passFail(result.requiredAssetsPresent)),
      WatchModeLabStatusRow(id: "preflightModel", label: "model", value: passFail(result.requiredModelPresent)),
      WatchModeLabStatusRow(id: "preflightCommit", label: "plan commit", value: passFail(result.planCommitted)),
    ]
  }

  private func phaseCForcedCuePlan(
    sessionId: String,
    startedAt: Date
  ) -> WatchRuntimePlanV3 {
    let createdAt = WatchRuntimeDateFormat.string(from: startedAt)
    let latestCueAt = WatchRuntimeDateFormat.string(
      from: startedAt.addingTimeInterval(12 * 60 * 60)
    )
    let cueHash = "a4e2932b7e4e76a837b2c4d011dcba508c5f6d7d496698180bfa109a5c6749be"
    let classifierVersion = "lucidtlr-rem-v0-2026-06"

    return WatchRuntimePlanV3(
      schemaVersion: WatchRuntimePlanV3Schema.schemaVersion,
      sessionId: sessionId,
      participantId: "internal-lab-phase-c",
      sessionType: "tlr",
      mode: "watch",
      createdAt: createdAt,
      protocolVersion: "tlr-protocol-v3-phase-c-lab",
      watchPolicyVersion: "watch-policy-v3-phase-c-real-provider-lab-2026-06-10",
      remModelVersion: classifierVersion,
      planHash: WatchRuntimeStructuralHash.placeholderHex("phase-c-forced|\(sessionId)|\(createdAt)"),
      selectedCueId: "harp-flourish",
      cue: WatchRuntimeCueV3(
        cueId: "harp-flourish",
        assetId: "harp-flourish",
        resourceName: "harp_flourish",
        resourceExtension: "mp3",
        durationSeconds: 2.48975,
        sha256: cueHash
      ),
      cueOutput: WatchRuntimeCueOutputV3(
        hapticEnabled: true,
        audioEnabled: true,
        audioRequiresPreflight: true,
        preflightRequired: true,
        defaultOutput: "haptic"
      ),
      training: WatchRuntimeTrainingV3(
        enabled: false,
        skipped: true,
        audioResourceName: "",
        audioResourceExtension: "mp3",
        durationSeconds: 0,
        cueSchedule: [],
        sha256: ""
      ),
      tlrInterval: WatchRuntimeTlrIntervalV3(
        enabled: true,
        earliestCueAt: createdAt,
        latestCueAt: latestCueAt,
        derivedFrom: "watch_training_completed_at_plus_protocol_delay"
      ),
      epoching: WatchRuntimeEpochingV3(
        epochSeconds: 30,
        motionSampleHz: 1,
        rawMotionPersistence: false
      ),
      remPolicy: WatchRuntimeRemPolicyV3(
        classifierVersion: classifierVersion,
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
        maxCuesTonight: 1,
        minimumSecondsSinceLastCue: 180
      ),
      safety: WatchRuntimeSafetyV3(
        requireWorkoutSession: true,
        requireHealthKitAuthorization: true,
        requireMotion: true,
        requireLowPowerModeOff: true,
        minimumStartBatteryLevel: 0.35,
        lowBatteryWarningLevel: 0.5,
        safeSealBatteryLevel: 0.18,
        emergencyStopBatteryLevel: 0.1
      ),
      assets: [
        WatchRuntimeAssetV3(
          id: "harp-flourish",
          kind: "cue",
          owner: "watch",
          fileName: "harp_flourish.mp3",
          resourceName: "harp_flourish",
          resourceExtension: "mp3",
          sha256: cueHash,
          byteLength: 20_588
        ),
      ],
      model: WatchRuntimeModelV3(
        modelId: "lucidtlr-watch-rem-informed-v0",
        modelVersion: classifierVersion,
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

  private func preflightPreviewPlan(
    prefix: String,
    scenario: SyntheticPreflightScenario
  ) -> WatchRuntimePlanV3 {
    let plan = WatchSyntheticRuntimeFixtures.makeTlrPlanFixture(
      sessionId: uniqueSessionId(prefix: prefix)
    )

    if scenario == .missingAudioPreflight {
      return WatchRuntimePreflightFixtures.audioEnabledPlan(from: plan)
    }

    return plan
  }

  private func latestCueStatusLabel() -> String {
    if activeProviderSet == "real" {
      return nightSessionController.statusRows
        .first { $0.id == "cueStatus" }?
        .value ?? "not scheduled"
    }

    if let cue = coordinator?.logStore?.cueRecords.last {
      if cue.delivered {
        return "fired \(cue.outputChannel)"
      }

      return "failed \(cue.failureReason ?? "unknown")"
    }

    let reason = coordinator?.latestCueDecisionReason ?? "not_started"
    return reason == "not_started" ? "not scheduled" : "suppressed \(reason)"
  }

  private func blockingReasonLabel(_ result: WatchRuntimePreflightResult) -> String {
    result.blockingReasons.isEmpty
      ? "none"
      : result.blockingReasons.map(\.rawValue).joined(separator: ", ")
  }

  private func batteryLabel(_ level: Double?) -> String {
    guard let level else {
      return "unknown"
    }

    return "\(Int((level * 100).rounded()))%"
  }

  private func passFail(_ value: Bool) -> String {
    value ? "pass" : "fail"
  }

  private func packageTransferBytesLabel(
    _ status: WatchTransportPackageTransferStatus?
  ) -> String {
    guard let status else {
      return "none"
    }

    return "manifest \(status.manifestJsonByteCount), file \(status.packageFileByteCount)"
  }

  private func packageTransferOutstandingLabel(
    _ status: WatchTransportPackageTransferStatus?
  ) -> String {
    guard let status else {
      return "none"
    }

    return "userInfo \(status.outstandingUserInfoTransferCount), file \(status.outstandingFileTransferCount)"
  }

  private func preflightLabel(required: Bool, passed: Bool, available: Bool) -> String {
    if !required {
      return available ? "not required / available" : "not required"
    }

    return passed ? "required / pass" : "required / blocked"
  }

  private func ackRetentionState(for manifest: WatchPackageManifestV3?) -> String {
    guard let manifest, let sessionStore else {
      return "not sealed"
    }

    let ackStore = WatchPackageAckStore(sessionStore: sessionStore)
    return ackStore.canDeletePackageAfterAck(manifest)
      ? "matching ack stored"
      : "retained until matching ack"
  }

  private func uniqueSessionId(prefix: String) -> String {
    "\(prefix)-\(Int(Date().timeIntervalSince1970))-\(Int.random(in: 1000...9999))"
  }

  private func handle(error: Error) {
    statusMessage = "Lab error: \(String(describing: error))"
    refreshRows()
  }

  private func reportTransportPackageError(_ error: Error) {
    try? transportCoordinator.sendTransportError(
      errorCode: "watch_package_transfer_failed_before_queue",
      errorMessage: String(describing: error),
      createdAt: Date()
    )
  }
}
#endif
