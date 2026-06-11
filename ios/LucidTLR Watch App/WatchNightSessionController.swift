#if DEBUG || EXPO_CONFIGURATION_DEBUG || LUCIDTLR_INTERNAL_TESTFLIGHT_LAB
import Combine
import Foundation

enum WatchNightSessionSurface {
  case waitingForPlan
  case blocked
  case sleepShield
  case syncPending
}

struct WatchNightSessionStatusRow: Identifiable, Equatable {
  let id: String
  let label: String
  let value: String
}

@MainActor
final class WatchNightSessionController: ObservableObject {
  static let shared = WatchNightSessionController()

  @Published private(set) var surface: WatchNightSessionSurface = .waitingForPlan
  @Published private(set) var statusMessage = "Waiting for plan from phone."
  @Published private(set) var statusRows: [WatchNightSessionStatusRow] = []
  @Published private(set) var sleepShieldViewModel: SleepShieldViewModel?

  private enum StorageScope {
    case product
    case labReal
  }

  private let transportCoordinator = WatchTransportCoordinator.shared
  private var coordinator: WatchSessionCoordinator?
  private var sessionStore: WatchSessionDirectoryStore?
  private var currentSessionIndex: WatchCurrentSessionIndex?
  private var activePlan: WatchRuntimePlanV3?
  private var activeManifest: WatchPackageManifestV3?
  private var activePreflightResult: WatchRuntimePreflightResult?
  private var activeScope: StorageScope = .product
  private var heartRateProvider: HealthKitHeartRateProvider?
  private var motionProvider: CoreMotionProvider?
  private var batteryProvider: RealBatteryProvider?
  private var powerModeProvider: RealPowerModeProvider?
  private var cueOutputProvider: RealCueOutputProvider?
  private var epochTimer: Timer?
  private var statusTimer: Timer?

  static func isSyntheticLabPlan(_ plan: WatchRuntimePlanV3) -> Bool {
    plan.sessionId.hasPrefix("watch-mode-lab-")
  }

  static func isRealProductPlan(_ plan: WatchRuntimePlanV3) -> Bool {
    !isSyntheticLabPlan(plan)
  }

  func refreshProductSurface() {
    do {
      try transportCoordinator.activate()
      transportCoordinator.refreshStatus()
      let index = WatchCurrentSessionIndex(rootDirectory: try rootDirectory(for: .product))
      currentSessionIndex = index

      if let entry = try index.load(), entry.isActiveUnacked {
        if entry.sealedPackageId != nil {
          _ = try? transportCoordinator.recordLatestAckIfMatches(
            rootDirectory: try rootDirectory(for: .product)
          )
          surface = .syncPending
          statusMessage = "Night ended on watch. Waiting for phone import and ack."
        } else if sleepShieldViewModel != nil {
          surface = .sleepShield
          statusMessage = "Watch Mode is running."
        } else {
          surface = .sleepShield
          statusMessage = "Watch Mode is recorded as running. Keep using the Watch shield for this session."
          sleepShieldViewModel = SleepShieldViewModel(
            snapshot: .placeholder,
            interactionLogger: { _ in }
          )
        }

        refreshRows()
        return
      }

      surface = .waitingForPlan
      sleepShieldViewModel = nil
      statusMessage = "Waiting for plan from phone."
      refreshRows()
    } catch {
      handle(error: error)
    }
  }

  func startProductSession(_ stagedPlan: WatchTransportStagedPlan) {
    guard Self.isRealProductPlan(stagedPlan.plan) else {
      return
    }

    #if targetEnvironment(simulator)
    let message = "Real Watch Mode product sessions require device providers; simulator product start is blocked."
    statusMessage = message
    surface = .blocked
    try? transportCoordinator.sendTransportError(
      errorCode: "watch_product_real_providers_unavailable_on_simulator",
      errorMessage: message,
      createdAt: Date()
    )
    refreshRows()
    #else
    Task { @MainActor in
      await startDeviceRealProviderSession(
        plan: stagedPlan.plan,
        scope: .product,
        forcedCueAfterSeconds: WatchNightSessionForcedCueSettings.shared.consumeForcedCueOverrideSeconds()
      )
    }
    #endif
  }

  func startLabForcedCueSession(forcedCueAfterMinutes: Int) async {
    #if targetEnvironment(simulator)
    statusMessage = "Real providers are device-only; the lab simulator fallback owns synthetic forced-cue validation."
    surface = .blocked
    refreshRows()
    #else
    let startDate = Date()
    let plan = phaseCForcedCuePlan(
      sessionId: uniqueSessionId(prefix: "watch-lab-real-forced-cue"),
      startedAt: startDate
    )

    await startDeviceRealProviderSession(
      plan: plan,
      scope: .labReal,
      forcedCueAfterSeconds: TimeInterval(forcedCueAfterMinutes * 60)
    )
    #endif
  }

  func endActiveSessionAndTransfer() {
    do {
      guard let coordinator, let activePlan, let sessionStore else {
        statusMessage = "No active real-provider session is running."
        refreshRows()
        return
      }

      invalidateTimers()
      activeManifest = try coordinator.stopAndSeal(reason: .userWake)
      stopRealProviders()

      if let activeManifest {
        try currentSessionIndex?.recordSealedPackage(
          manifest: activeManifest,
          runtimeState: coordinator.state,
          updatedAt: Date()
        )
        try transferSealedPackage(
          manifest: activeManifest,
          sessionStore: sessionStore,
          runtimeState: coordinator.state,
          updatedAt: Date()
        )
      }

      sleepShieldViewModel = nil
      surface = .syncPending
      statusMessage = "Ended real-provider session \(activePlan.sessionId), sealed package, and queued transfer through the frozen transport path."
      refreshRows()
    } catch {
      handle(error: error)
    }
  }

  #if !targetEnvironment(simulator)
  private func startDeviceRealProviderSession(
    plan: WatchRuntimePlanV3,
    scope: StorageScope,
    forcedCueAfterSeconds: TimeInterval?
  ) async {
    do {
      invalidateTimers()
      stopRealProviders()

      let startDate = Date()
      let prepared = try makeRealCoordinator(
        plan: plan,
        scope: scope,
        forcedCueAfterSeconds: forcedCueAfterSeconds
      )
      let authorization = try await prepared.heartRateProvider.requestAuthorization()

      activeScope = scope
      activePlan = plan
      activeManifest = nil
      activePreflightResult = nil
      heartRateProvider = prepared.heartRateProvider
      motionProvider = prepared.motionProvider
      batteryProvider = prepared.batteryProvider
      powerModeProvider = prepared.powerModeProvider
      cueOutputProvider = prepared.cueOutputProvider
      coordinator = prepared.coordinator
      sessionStore = prepared.sessionStore
      currentSessionIndex = prepared.index

      try prepared.coordinator.commit(plan: plan)
      try prepared.index.recordCommit(
        plan: plan,
        runtimeState: .planCommitted,
        updatedAt: startDate
      )
      if let entry = try prepared.index.load() {
        try transportCoordinator.sendCommitReceipt(
          plan: plan,
          commitId: entry.commitId,
          watchState: entry.runtimeState,
          committedAt: WatchRuntimeDateFormat.date(from: entry.updatedAt) ?? startDate
        )
      }

      try prepared.heartRateProvider.startWorkoutRuntime(at: startDate)
      try prepared.motionProvider.start(sampleHz: plan.epoching.motionSampleHz)
      try prepared.coordinator.startCommittedPlan()
      activePreflightResult = prepared.coordinator.lastPreflightResult
      try prepared.index.recordRuntimeState(
        sessionId: plan.sessionId,
        runtimeState: prepared.coordinator.state,
        updatedAt: Date()
      )
      try transportCoordinator.sendStatusSnapshot(
        sessionId: plan.sessionId,
        planHash: plan.planHash,
        watchState: prepared.coordinator.state,
        packageId: nil,
        packageHash: nil,
        createdAt: Date()
      )

      sleepShieldViewModel = makeSleepShieldViewModel(coordinator: prepared.coordinator)
      surface = .sleepShield
      startTimers(plan: plan)
      statusMessage = "Started real-provider Watch session. HealthKit authorization: \(authorization.rawValue)."
      refreshRows()
    } catch {
      stopRealProviders()
      surface = .blocked
      activePreflightResult = coordinator?.lastPreflightResult ?? activePreflightResult
      try? transportCoordinator.sendTransportError(
        errorCode: "watch_product_real_session_start_failed",
        errorMessage: String(describing: error),
        createdAt: Date()
      )
      handle(error: error)
    }
  }

  private func makeRealCoordinator(
    plan: WatchRuntimePlanV3,
    scope: StorageScope,
    forcedCueAfterSeconds: TimeInterval?
  ) throws -> (
    coordinator: WatchSessionCoordinator,
    sessionStore: WatchSessionDirectoryStore,
    index: WatchCurrentSessionIndex,
    heartRateProvider: HealthKitHeartRateProvider,
    motionProvider: CoreMotionProvider,
    batteryProvider: RealBatteryProvider,
    powerModeProvider: RealPowerModeProvider,
    cueOutputProvider: RealCueOutputProvider
  ) {
    let rootDirectory = try rootDirectory(for: scope)
    let index = WatchCurrentSessionIndex(rootDirectory: rootDirectory)
    try index.requireCanStartSession(sessionId: plan.sessionId)
    let nextSessionStore = try WatchSessionDirectoryStore(
      rootDirectory: rootDirectory,
      sessionId: plan.sessionId
    )
    let packageStore = WatchPackageStore(sessionStore: nextSessionStore)
    let heartRateProvider = HealthKitHeartRateProvider()
    let motionProvider = CoreMotionProvider()
    let batteryProvider = RealBatteryProvider()
    let powerModeProvider = RealPowerModeProvider()
    let cueOutputProvider = RealCueOutputProvider()
    let coordinator = WatchSessionCoordinator(
      clock: RealtimeWatchClock(),
      heartRateProvider: heartRateProvider,
      motionProvider: motionProvider,
      batteryProvider: batteryProvider,
      powerModeProvider: powerModeProvider,
      cueOutputProvider: cueOutputProvider,
      packageSealer: packageStore,
      logStoreFactory: { _ in try WatchFileBackedLogStore(sessionStore: nextSessionStore) },
      preflightProvider: RealWatchRuntimePreflightProvider(
        batteryProvider: batteryProvider,
        powerModeProvider: powerModeProvider,
        heartRateProvider: heartRateProvider,
        motionProvider: motionProvider,
        cueOutputProvider: cueOutputProvider,
        planCommitted: true,
        storageAvailable: true
      ),
      requiresStartPreflight: true,
      forcedCueAfterSeconds: forcedCueAfterSeconds
    )

    return (
      coordinator,
      nextSessionStore,
      index,
      heartRateProvider,
      motionProvider,
      batteryProvider,
      powerModeProvider,
      cueOutputProvider
    )
  }
  #endif

  private func startTimers(plan: WatchRuntimePlanV3) {
    invalidateTimers()

    epochTimer = Timer.scheduledTimer(
      withTimeInterval: TimeInterval(plan.epoching.epochSeconds),
      repeats: true
    ) { [weak self] _ in
      Task { @MainActor in
        self?.stepRealProviderEpoch()
      }
    }

    statusTimer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
      Task { @MainActor in
        self?.refreshRows()
      }
    }
  }

  private func stepRealProviderEpoch() {
    guard let coordinator, let activePlan else {
      return
    }

    do {
      _ = try coordinator.stepEpoch()
      try currentSessionIndex?.recordRuntimeState(
        sessionId: activePlan.sessionId,
        runtimeState: coordinator.state,
        updatedAt: Date()
      )

      if let sealedManifest = coordinator.sealedManifest, let sessionStore {
        activeManifest = sealedManifest
        invalidateTimers()
        stopRealProviders()
        try transferSealedPackage(
          manifest: sealedManifest,
          sessionStore: sessionStore,
          runtimeState: coordinator.state,
          updatedAt: Date()
        )
        sleepShieldViewModel = nil
        surface = .syncPending
        statusMessage = "Real-provider session safe-sealed and queued transfer through the frozen transport path."
      }

      refreshRows()
    } catch {
      handle(error: error)
    }
  }

  private func invalidateTimers() {
    epochTimer?.invalidate()
    epochTimer = nil
    statusTimer?.invalidate()
    statusTimer = nil
  }

  private func stopRealProviders() {
    heartRateProvider?.stopWorkoutRuntime(at: Date())
    motionProvider?.stop()
  }

  private func transferSealedPackage(
    manifest: WatchPackageManifestV3,
    sessionStore: WatchSessionDirectoryStore,
    runtimeState: WatchRuntimeState,
    updatedAt: Date
  ) throws {
    let package = try WatchTransportPackageBuilder.buildTransferPackage(
      sessionStore: sessionStore,
      baseManifest: manifest
    )
    let packageURL = try WatchTransportPackageBuilder.writePackageFile(
      package: package,
      rootDirectory: rootDirectory(for: activeScope)
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
          self?.endActiveSessionAndTransfer()
        }
      }
    )
  }

  private func refreshRows() {
    let now = Date()
    let manifest = activeManifest ?? coordinator?.sealedManifest
    let preflightResult = activePreflightResult ?? coordinator?.lastPreflightResult
    let currentIndexEntry: WatchCurrentSessionIndexEntry?

    if let currentSessionIndex {
      currentIndexEntry = try? currentSessionIndex.load()
    } else {
      currentIndexEntry = nil
    }

    var rows = [
      WatchNightSessionStatusRow(id: "scope", label: "scope", value: activeScope == .product ? "internal product" : "internal lab real"),
      WatchNightSessionStatusRow(id: "providerSet", label: "provider set", value: "real"),
      WatchNightSessionStatusRow(id: "session", label: "session", value: activePlan?.sessionId ?? currentIndexEntry?.activeSessionId ?? "none"),
      WatchNightSessionStatusRow(id: "currentIndexState", label: "current index state", value: currentIndexEntry?.runtimeState.rawValue ?? "none"),
      WatchNightSessionStatusRow(id: "currentIndexUnacked", label: "active/unacked", value: currentIndexEntry?.isActiveUnacked == true ? "yes" : "no"),
      WatchNightSessionStatusRow(id: "state", label: "runtime state", value: coordinator?.state.rawValue ?? currentIndexEntry?.runtimeState.rawValue ?? "idle"),
      WatchNightSessionStatusRow(id: "epochs", label: "epoch count", value: "\(coordinator?.epochCount ?? 0)"),
      WatchNightSessionStatusRow(id: "cueStatus", label: "cue fired/suppressed", value: latestCueStatusLabel()),
      WatchNightSessionStatusRow(id: "hrFreshness", label: "HR freshness", value: heartRateFreshnessLabel(at: now)),
      WatchNightSessionStatusRow(id: "motionActivity", label: "motion activity", value: motionActivityLabel(at: now)),
      WatchNightSessionStatusRow(id: "realProviderError", label: "real provider error", value: heartRateProvider?.lastError ?? "none"),
      WatchNightSessionStatusRow(id: "packageId", label: "packageId", value: manifest?.packageId ?? currentIndexEntry?.sealedPackageId ?? "not sealed"),
      WatchNightSessionStatusRow(id: "packageHash", label: "packageHash", value: manifest.map { String($0.packageHash.prefix(24)) } ?? currentIndexEntry?.sealedPackageHash.map { String($0.prefix(24)) } ?? "not sealed"),
      WatchNightSessionStatusRow(id: "seal", label: "seal reason", value: manifest?.sealReason ?? "not sealed"),
    ]

    if let preflightResult {
      rows.append(contentsOf: preflightRows(from: preflightResult))
    } else {
      rows.append(WatchNightSessionStatusRow(id: "preflight", label: "preflight", value: "not evaluated"))
    }

    statusRows = rows
  }

  private func preflightRows(from result: WatchRuntimePreflightResult) -> [WatchNightSessionStatusRow] {
    [
      WatchNightSessionStatusRow(id: "preflight", label: "preflight", value: result.canStart ? "can start" : "blocked"),
      WatchNightSessionStatusRow(id: "preflightBlocks", label: "blocking reasons", value: blockingReasonLabel(result)),
      WatchNightSessionStatusRow(id: "preflightBattery", label: "battery", value: batteryLabel(result.batteryLevel)),
      WatchNightSessionStatusRow(id: "preflightLowPower", label: "Low Power Mode", value: result.lowPowerModeEnabled ? "on" : "off"),
      WatchNightSessionStatusRow(id: "preflightHealth", label: "HealthKit authorization", value: result.healthKitAuthorization.rawValue),
      WatchNightSessionStatusRow(id: "preflightWorkout", label: "workout runtime", value: passFail(result.workoutRuntimeAvailable)),
      WatchNightSessionStatusRow(id: "preflightMotion", label: "motion", value: passFail(result.motionAvailable)),
      WatchNightSessionStatusRow(id: "preflightHaptic", label: "haptic preflight", value: preflightLabel(required: result.hapticPreflightRequired, passed: result.hapticPreflightPassed, available: result.hapticOutputAvailable)),
      WatchNightSessionStatusRow(id: "preflightAudio", label: "audio preflight", value: preflightLabel(required: result.audioPreflightRequired, passed: result.audioPreflightPassed, available: result.audioOutputAvailable)),
      WatchNightSessionStatusRow(id: "preflightAssets", label: "assets", value: passFail(result.requiredAssetsPresent)),
      WatchNightSessionStatusRow(id: "preflightModel", label: "model", value: passFail(result.requiredModelPresent)),
      WatchNightSessionStatusRow(id: "preflightCommit", label: "plan commit", value: passFail(result.planCommitted)),
    ]
  }

  private func rootDirectory(for scope: StorageScope) throws -> URL {
    let child = scope == .product ? "WatchModeNightSessions" : "WatchModeLabSynthetic"
    let root = try WatchStoragePaths.defaultRootDirectory()
      .appendingPathComponent(child, isDirectory: true)
    try FileManager.default.createDirectory(
      at: root,
      withIntermediateDirectories: true,
      attributes: nil
    )
    return root
  }

  private func latestCueStatusLabel() -> String {
    if let cue = coordinator?.logStore?.cueRecords.last {
      if cue.delivered {
        return "fired \(cue.outputChannel)"
      }

      return "failed \(cue.failureReason ?? "unknown")"
    }

    let reason = coordinator?.latestCueDecisionReason ?? "not_started"
    return reason == "not_started" ? "not scheduled" : "suppressed \(reason)"
  }

  private func heartRateFreshnessLabel(at date: Date) -> String {
    guard let provider = heartRateProvider else {
      return "n/a"
    }

    let bpm = provider.latestBeatsPerMinute.map { "\(Int($0.rounded())) bpm" } ?? "no bpm"
    let freshness = provider.lastSampleFreshnessSeconds(at: date).map {
      "\(Int($0.rounded()))s old"
    } ?? "no samples"

    return "\(bpm), \(freshness), workout \(provider.workoutState)"
  }

  private func motionActivityLabel(at date: Date) -> String {
    guard let provider = motionProvider else {
      return "n/a"
    }

    let freshness = provider.lastSampleFreshnessSeconds(at: date).map {
      "\(Int($0.rounded()))s old"
    } ?? "no samples"

    return String(format: "%.3f, %@", provider.latestIntensity, freshness)
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
        lowBatteryWarningLevel: 0.25,
        safeSealBatteryLevel: 0.18,
        emergencyStopBatteryLevel: 0.1
      ),
      assets: [
        WatchRuntimeAssetV3(
          id: "harp-flourish",
          kind: "cue",
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

  private func uniqueSessionId(prefix: String) -> String {
    "\(prefix)-\(Int(Date().timeIntervalSince1970))-\(Int.random(in: 1000...9999))"
  }

  private func handle(error: Error) {
    statusMessage = "Watch night session error: \(String(describing: error))"
    refreshRows()
  }
}

final class WatchNightSessionForcedCueSettings: ObservableObject {
  static let shared = WatchNightSessionForcedCueSettings()

  private let enabledKey = "lucidtlr.watchNightSession.forcedCueNextReal.enabled.v1"
  private let minutesKey = "lucidtlr.watchNightSession.forcedCueNextReal.minutes.v1"
  private let defaults: UserDefaults

  @Published private(set) var applyToNextRealSession: Bool
  @Published private(set) var minutes: Int

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
    self.applyToNextRealSession = defaults.bool(forKey: enabledKey)
    let storedMinutes = defaults.integer(forKey: minutesKey)
    self.minutes = storedMinutes > 0 ? storedMinutes : 10
  }

  func setApplyToNextRealSession(_ enabled: Bool) {
    applyToNextRealSession = enabled
    defaults.set(enabled, forKey: enabledKey)
  }

  func setMinutes(_ minutes: Int) {
    let bounded = min(90, max(1, minutes))
    self.minutes = bounded
    defaults.set(bounded, forKey: minutesKey)
  }

  func consumeForcedCueOverrideSeconds() -> TimeInterval? {
    guard applyToNextRealSession else {
      return nil
    }

    setApplyToNextRealSession(false)
    return TimeInterval(minutes * 60)
  }
}
#endif
