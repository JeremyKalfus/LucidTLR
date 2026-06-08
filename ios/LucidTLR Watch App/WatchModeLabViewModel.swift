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

final class WatchModeLabViewModel: ObservableObject {
  @Published var displayMode: WatchModeLabDisplayMode = .menu
  @Published private(set) var statusMessage = "Internal TestFlight Lab -- synthetic only."
  @Published private(set) var statusRows: [WatchModeLabStatusRow] = [
    WatchModeLabStatusRow(id: "scope", label: "scope", value: "synthetic only"),
    WatchModeLabStatusRow(id: "public", label: "public Watch Mode", value: "disabled"),
    WatchModeLabStatusRow(id: "transport", label: "WatchConnectivity", value: "synthetic lab only"),
  ]
  @Published private(set) var selectedPreflightScenario: SyntheticPreflightScenario = .allPass
  @Published var sleepShieldViewModel: SleepShieldViewModel?

  private var coordinator: WatchSessionCoordinator?
  private var sessionStore: WatchSessionDirectoryStore?
  private var currentSessionIndex: WatchCurrentSessionIndex?
  private var activePlan: WatchRuntimePlanV3?
  private var activeManifest: WatchPackageManifestV3?
  private var activePreflightResult: WatchRuntimePreflightResult?
  private let transportCoordinator = WatchTransportCoordinator.shared

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

      sleepShieldViewModel = SleepShieldViewModel(coordinator: coordinator)
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

  func discardCurrentSyntheticSessionWithExplicitConfirmation() {
    do {
      let index = try labIndex()
      try index.discardSyntheticLabSession(
        explicitConfirmation: true,
        discardedAt: WatchSyntheticRuntimeFixtures.fixtureStartDateForStorage()
      )
      currentSessionIndex = index
      coordinator = nil
      sessionStore = nil
      activePlan = nil
      activeManifest = nil
      activePreflightResult = nil
      sleepShieldViewModel = nil
      statusMessage = "Discarded synthetic lab session with explicit local-only confirmation. No Watch package deletion was performed."
      refreshRows()
    } catch {
      handle(error: error)
    }
  }

  private func transferSyntheticPackage() throws {
    let sealed = try sealSyntheticPackageIfNeeded()
    let package = try WatchTransportPackageBuilder.buildTransferPackage(
      sessionStore: sealed.sessionStore,
      baseManifest: sealed.manifest
    )
    let packageURL = try WatchTransportPackageBuilder.writePackageFile(
      package: package,
      rootDirectory: labRootDirectory()
    )
    try currentSessionIndex?.recordSealedPackage(
      manifest: package.manifest,
      runtimeState: coordinator?.state ?? .sealedWaitingForPhone,
      updatedAt: WatchSyntheticRuntimeFixtures.fixtureStartDateForStorage()
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
    sleepShieldViewModel = SleepShieldViewModel(coordinator: nextCoordinator)
    refreshRows()
  }

  private func makeCoordinator(
    plan: WatchRuntimePlanV3,
    preflightScenario: SyntheticPreflightScenario,
    requiresStartPreflight: Bool = true
  ) throws -> WatchSessionCoordinator {
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
      requiresStartPreflight: requiresStartPreflight
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

  private func refreshRows() {
    let state = coordinator?.state.rawValue ?? "idle"
    let epochCount = coordinator?.epochCount ?? 0
    let manifest = activeManifest ?? coordinator?.sealedManifest
    let ackState = ackRetentionState(for: manifest)
    let preflightResult = activePreflightResult ?? coordinator?.lastPreflightResult
    transportCoordinator.refreshStatus()
    let transportStatus = transportCoordinator.status
    let currentIndexEntry: WatchCurrentSessionIndexEntry?
    if let currentSessionIndex {
      currentIndexEntry = try? currentSessionIndex.load()
    } else {
      currentIndexEntry = nil
    }

    var rows = [
      WatchModeLabStatusRow(id: "scope", label: "scope", value: "synthetic only"),
      WatchModeLabStatusRow(id: "storage", label: "storage", value: "file-backed JSONL"),
      WatchModeLabStatusRow(id: "session", label: "session", value: activePlan?.sessionId ?? "none"),
      WatchModeLabStatusRow(id: "currentIndexSession", label: "current index", value: currentIndexEntry?.activeSessionId ?? "none"),
      WatchModeLabStatusRow(id: "currentIndexState", label: "current index state", value: currentIndexEntry?.runtimeState.rawValue ?? "none"),
      WatchModeLabStatusRow(id: "currentIndexUnacked", label: "active/unacked", value: currentIndexEntry?.isActiveUnacked == true ? "yes" : "no"),
      WatchModeLabStatusRow(id: "state", label: "runtime state", value: state),
      WatchModeLabStatusRow(id: "epochs", label: "epoch count", value: "\(epochCount)"),
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
      WatchModeLabStatusRow(id: "public", label: "public Watch Mode", value: "disabled"),
    ]

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
