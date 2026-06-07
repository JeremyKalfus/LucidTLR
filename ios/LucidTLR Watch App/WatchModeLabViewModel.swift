#if DEBUG || EXPO_CONFIGURATION_DEBUG
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
  @Published private(set) var statusMessage = "Watch Mode Lab -- synthetic only."
  @Published private(set) var statusRows: [WatchModeLabStatusRow] = [
    WatchModeLabStatusRow(id: "scope", label: "scope", value: "synthetic only"),
    WatchModeLabStatusRow(id: "public", label: "public Watch Mode", value: "disabled"),
    WatchModeLabStatusRow(id: "transport", label: "WatchConnectivity", value: "not used"),
  ]
  @Published var sleepShieldViewModel: SleepShieldViewModel?

  private var coordinator: WatchSessionCoordinator?
  private var sessionStore: WatchSessionDirectoryStore?
  private var activePlan: WatchRuntimePlanV3?
  private var activeManifest: WatchPackageManifestV3?

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
      coordinator = try makeCoordinator(plan: plan)
      try coordinator?.commit(plan: plan)
      activePlan = plan
      activeManifest = nil
      statusMessage = "Committed synthetic TLR plan locally on Watch. No phone or transport was used."
      refreshRows()
    } catch {
      handle(error: error)
    }
  }

  func runTenMinuteTlrSession() {
    do {
      let plan = WatchSyntheticRuntimeFixtures.makeTlrPlanFixture(
        sessionId: uniqueSessionId(prefix: "watch-lab-tlr")
      )
      try runTenMinuteSession(plan: plan)
      statusMessage = "Ran synthetic TLR session with file-backed storage and sealed a package."
    } catch {
      handle(error: error)
    }
  }

  func runTenMinuteSleepLogSession() {
    do {
      let plan = WatchSyntheticRuntimeFixtures.makeSleepLogPlanFixture(
        sessionId: uniqueSessionId(prefix: "watch-lab-sleep-log")
      )
      try runTenMinuteSession(plan: plan)
      statusMessage = "Ran synthetic sleep_log session with cueing disabled and sealed a package."
    } catch {
      handle(error: error)
    }
  }

  func enterSleepShield() {
    do {
      if coordinator == nil || coordinator?.state == .sealedWaitingForPhone {
        let plan = WatchSyntheticRuntimeFixtures.makeTlrPlanFixture(
          sessionId: uniqueSessionId(prefix: "watch-lab-shield")
        )
        coordinator = try makeCoordinator(plan: plan)
        try coordinator?.commit(plan: plan)
        activePlan = plan
      }

      if coordinator?.state == .planCommitted {
        try coordinator?.startCommittedPlan()
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
        coordinator = try makeCoordinator(plan: plan)
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
      statusMessage = "Force sealed synthetic package. Package is retained until a matching ack exists; no deletion was performed."
      refreshRows()
    } catch {
      handle(error: error)
    }
  }

  private func runTenMinuteSession(plan: WatchRuntimePlanV3) throws {
    let nextCoordinator = try makeCoordinator(plan: plan)

    try nextCoordinator.commit(plan: plan)
    try nextCoordinator.startCommittedPlan()
    try nextCoordinator.runEpochs(20)
    activeManifest = try nextCoordinator.stopAndSeal(reason: .completed)
    coordinator = nextCoordinator
    activePlan = plan
    sleepShieldViewModel = SleepShieldViewModel(coordinator: nextCoordinator)
    refreshRows()
  }

  private func makeCoordinator(plan: WatchRuntimePlanV3) throws -> WatchSessionCoordinator {
    let startDate = WatchSyntheticRuntimeFixtures.fixtureStartDateForStorage()
    let rootDirectory = try labRootDirectory()
    let nextSessionStore = try WatchSessionDirectoryStore(
      rootDirectory: rootDirectory,
      sessionId: plan.sessionId
    )
    let packageStore = WatchPackageStore(sessionStore: nextSessionStore)
    sessionStore = nextSessionStore

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
      logStoreFactory: { _ in try WatchFileBackedLogStore(sessionStore: nextSessionStore) }
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

  private func refreshRows() {
    let state = coordinator?.state.rawValue ?? "idle"
    let epochCount = coordinator?.epochCount ?? 0
    let manifest = activeManifest ?? coordinator?.sealedManifest
    let ackState = ackRetentionState(for: manifest)

    statusRows = [
      WatchModeLabStatusRow(id: "scope", label: "scope", value: "synthetic only"),
      WatchModeLabStatusRow(id: "storage", label: "storage", value: "file-backed JSONL"),
      WatchModeLabStatusRow(id: "session", label: "session", value: activePlan?.sessionId ?? "none"),
      WatchModeLabStatusRow(id: "state", label: "runtime state", value: state),
      WatchModeLabStatusRow(id: "epochs", label: "epoch count", value: "\(epochCount)"),
      WatchModeLabStatusRow(id: "packageId", label: "packageId", value: manifest?.packageId ?? "not sealed"),
      WatchModeLabStatusRow(id: "packageHash", label: "packageHash", value: manifest.map { String($0.packageHash.prefix(24)) } ?? "not sealed"),
      WatchModeLabStatusRow(id: "events", label: "event count", value: manifest.map { "\($0.eventCount)" } ?? "0"),
      WatchModeLabStatusRow(id: "seal", label: "seal reason", value: manifest?.sealReason ?? "not sealed"),
      WatchModeLabStatusRow(id: "ack", label: "ack retention", value: ackState),
      WatchModeLabStatusRow(id: "transport", label: "WatchConnectivity", value: "not used"),
      WatchModeLabStatusRow(id: "public", label: "public Watch Mode", value: "disabled"),
    ]
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
}
#endif
