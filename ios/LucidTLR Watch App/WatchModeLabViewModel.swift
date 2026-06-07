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
  @Published private(set) var selectedPreflightScenario: SyntheticPreflightScenario = .allPass
  @Published var sleepShieldViewModel: SleepShieldViewModel?

  private var coordinator: WatchSessionCoordinator?
  private var sessionStore: WatchSessionDirectoryStore?
  private var activePlan: WatchRuntimePlanV3?
  private var activeManifest: WatchPackageManifestV3?
  private var activePreflightResult: WatchRuntimePreflightResult?

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
      statusMessage = "Force sealed synthetic package. Package is retained until a matching ack exists; no deletion was performed."
      refreshRows()
    } catch {
      handle(error: error)
    }
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
      try nextCoordinator.startCommittedPlan()
    } catch {
      coordinator = nextCoordinator
      activePlan = plan
      activePreflightResult = nextCoordinator.lastPreflightResult
      refreshRows()
      throw error
    }

    try nextCoordinator.runEpochs(20)
    activeManifest = try nextCoordinator.stopAndSeal(reason: .completed)
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

  private func refreshRows() {
    let state = coordinator?.state.rawValue ?? "idle"
    let epochCount = coordinator?.epochCount ?? 0
    let manifest = activeManifest ?? coordinator?.sealedManifest
    let ackState = ackRetentionState(for: manifest)
    let preflightResult = activePreflightResult ?? coordinator?.lastPreflightResult

    var rows = [
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
}
#endif
