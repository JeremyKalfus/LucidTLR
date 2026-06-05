import CoreMotion
import AVFoundation
import Foundation
import HealthKit
import WatchConnectivity
import WatchKit

final class WatchSessionManager: NSObject, ObservableObject {
  @Published private(set) var displayState: WatchRuntimeDisplayState = .noPlan
  @Published private(set) var isConnected = false
  @Published private(set) var isRunning = false
  @Published private(set) var statusText = "No Watch plan"
  @Published private(set) var heartRateSampleCount = 0
  @Published private(set) var motionSampleCount = 0
  @Published private(set) var epochCount = 0
  @Published private(set) var sensorQuality = "missing"
  @Published private(set) var healthAuthorizationStatus = "unknown"
  @Published private(set) var batteryText = "unknown"
  @Published private(set) var planText = "none"
  @Published private(set) var cueingEnabled = false
  @Published private(set) var latestCueDecisionReason = "no_plan"
  @Published private(set) var latestRemProbabilityText = "unknown"
  @Published private(set) var syncPendingCount = 0
  @Published private(set) var phoneStartSyncSessionId = ""
  @Published private(set) var waitingForPhoneSync = false
  @Published private(set) var tlrPaused = false
  @Published private(set) var isTraining = false

  var shouldShowSyncPhoneScreen: Bool {
    hasPendingPhoneStartSync || shouldShowIdleSyncPhoneScreen
  }

  var canSyncPhoneFromWatch: Bool {
    hasPendingPhoneStartSync && WCSession.default.activationState == .activated && WCSession.default.isReachable
  }

  var syncPhoneScreenDetail: String {
    if hasPendingPhoneStartSync {
      return "Your watch will manage TLR through the night, then will send the data to your phone when you wake up."
    }

    return "Start Watch Mode on your iPhone, then sync here."
  }

  var shouldShowWaitingForPhoneSyncScreen: Bool {
    waitingForPhoneSync
  }

  var canControlTlrFromWatch: Bool {
    isRunning && !isTraining && activePlan?.cueMode != "none"
  }

  var tlrPauseButtonTitle: String {
    tlrPaused ? "Play TLR" : "Pause TLR"
  }

  private var hasPendingPhoneStartSync: Bool {
    !phoneStartSyncSessionId.isEmpty && !isRunning && !isStarting
  }

  private var shouldShowIdleSyncPhoneScreen: Bool {
    !isRunning && !isStarting && !waitingForPhoneSync && failedReason == nil
  }

  private let healthStore = HKHealthStore()
  private let motionManager = CMMotionManager()
  private let motionQueue = OperationQueue()
  private let isoFormatter = ISO8601DateFormatter()
  private let planStore = WatchRuntimePlanStore()
  private let remModel = WatchRemModel()
  private let cuePolicy = WatchCuePolicy()
  private let cueDelivery: WatchCueDelivering = WatchLocalCueDelivery()
  private let logWriter = WatchRuntimeLogWriter()
  private let syncQueue = WatchRuntimeSyncQueue()

  private var trainingAudioPlayer: AVAudioPlayer?
  private var trainingCueAudioPlayer: AVAudioPlayer?
  private var trainingCueTimers: [Timer] = []
  private var trainingCompletionTimer: Timer?
  private var workoutSession: HKWorkoutSession?
  private var workoutBuilder: HKLiveWorkoutBuilder?
  private var epochTimer: Timer?
  private var presenceTimer: Timer?
  private var activePlan: WatchRuntimePlan?
  private var sessionId = ""
  private var watchSessionId = UUID().uuidString
  private var sessionStartedAt = Date()
  private var plannedStopAt: Date?
  private var currentStartCommandId = ""
  private var lastEpochAt: Date?
  private var heartRates: [Double] = []
  private var motionSamples: [(t: Double, x: Double, y: Double, z: Double)] = []
  private var hrEma: Double?
  private var motionEma: Double?
  private var stableLowMovementSeconds = 0.0
  private var consecutiveLikelyRemEpochs = 0
  private var cueCountTonight = 0
  private var lastCueAt: Date?
  private var batteryStartPct: Double?
  private var trainingStartedAt: Date?
  private var trainingCompletedAt: Date?
  private var ownedEpochLogs: [[String: Any]] = []
  private var ownedCueDeliveryLogs: [[String: Any]] = []
  private var ownedRuntimeEventLogs: [[String: Any]] = []
  private var isStarting = false
  private var isStopping = false
  private var hasCompletedSession = false
  private var failedReason: String?
  private var tlrDeferredUntil: Date?
  private let hrAlpha = 0.95
  private let motionAlpha = 0.90
  private let epochIntervalSeconds = 30.0

  override init() {
    isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    activePlan = planStore.load()
    super.init()
    WKInterfaceDevice.current().isBatteryMonitoringEnabled = true
    activateConnectivity()
    batteryText = formatBattery()
    refreshPlanText()
    refreshDisplayState()
  }

  func watchAppBecameActive() {
    sendStatus(reason: "foreground")
    presenceTimer?.invalidate()
    presenceTimer = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in
      self?.sendStatus(reason: "heartbeat")
    }
  }

  func watchAppBecameInactive() {
    presenceTimer?.invalidate()
    presenceTimer = nil
  }

  func syncPhoneFromWatch() {
    let targetSessionId = phoneStartSyncSessionId
    guard canSyncPhoneFromWatch, !targetSessionId.isEmpty else {
      return
    }

    let message: [String: Any] = [
      "schemaVersion": "watch-owned-sync-request-v2",
      "phase": "start",
      "sessionId": targetSessionId,
      "createdAt": isoFormatter.string(from: Date()),
    ]

    isStarting = true
    failedReason = nil
    refreshDisplayState()

    WCSession.default.sendMessage(message) { [weak self] reply in
      DispatchQueue.main.async {
        self?.handleStartSyncReply(reply)
      }
    } errorHandler: { [weak self] error in
      DispatchQueue.main.async {
        self?.isStarting = false
        self?.markFailed(error.localizedDescription)
      }
    }
  }

  func pushBackTlrFromWatch() {
    guard canControlTlrFromWatch else {
      return
    }

    tlrDeferredUntil = Date().addingTimeInterval(30 * 60)
    tlrPaused = false
    latestCueDecisionReason = "user_deferred_tlr"
    logEvent("watch_tlr_deferred", payload: [
      "durationSeconds": 30 * 60,
      "deferredUntil": tlrDeferredUntil.map { isoFormatter.string(from: $0) } ?? "",
    ])
    sendStatus(reason: "user_deferred_tlr")
    refreshDisplayState()
  }

  func toggleTlrPauseFromWatch() {
    guard canControlTlrFromWatch else {
      return
    }

    tlrPaused.toggle()
    if !tlrPaused {
      tlrDeferredUntil = nil
    }
    latestCueDecisionReason = tlrPaused ? "user_paused_tlr" : "user_resumed_tlr"
    logEvent(tlrPaused ? "watch_tlr_paused" : "watch_tlr_resumed", payload: [
      "userPaused": tlrPaused,
    ])
    sendStatus(reason: latestCueDecisionReason)
    refreshDisplayState()
  }

  func wakeFromWatch() {
    stopSession(reason: "watch_ui")
  }

  func stopSession(reason: String) {
    guard (isRunning || isStarting) && !isStopping else {
      return
    }

    isStopping = true
    defer {
      isStopping = false
    }

    if isRunning && reason != "planned_stop_at" && shouldEmitFinalEpoch() {
      emitEpoch(connectivityState: connectivityState(), enforceTerminalChecks: false)
    }

    epochTimer?.invalidate()
    epochTimer = nil
    cancelWatchTrainingTimers()
    trainingAudioPlayer?.stop()
    trainingCueAudioPlayer?.stop()
    trainingAudioPlayer = nil
    trainingCueAudioPlayer = nil
    motionManager.stopAccelerometerUpdates()
    finishWorkout()
    isRunning = false
    isTraining = false
    isStarting = false
    hasCompletedSession = failedReason == nil
    waitingForPhoneSync = failedReason == nil
    statusText = hasCompletedSession ? "completed" : "failed"
    logEvent("watch_runtime_stopped", payload: [
      "reason": reason,
      "epochCount": epochCount,
      "cueCountTonight": cueCountTonight,
    ])
    transferActiveLog(reason: reason)
    sendStatus(reason: reason)
    sessionId = ""
    currentStartCommandId = ""
    plannedStopAt = nil
    lastEpochAt = nil
    cueingEnabled = false
    latestRemProbabilityText = "unknown"
    trainingStartedAt = nil
    trainingCompletedAt = nil
    tlrPaused = false
    tlrDeferredUntil = nil
    refreshDisplayState()
  }

  private func startStoredPlan(
    _ plan: WatchRuntimePlan,
    commandId: String,
    source: String,
    healthPreflightCompleted: Bool = false
  ) -> [String: Any] {
    let now = Date()
    if let stopAt = plan.stopAtDate(formatter: isoFormatter), now >= stopAt {
      return startRejectedReply(
        commandId: commandId,
        sessionId: plan.sessionId,
        reason: "plan_stop_at_elapsed"
      )
    }

    if let reason = batteryStopReason(for: plan) {
      return startRejectedReply(
        commandId: commandId,
        sessionId: plan.sessionId,
        reason: reason
      )
    }

    if let reason = cueAssetStartBlockReason(for: plan) {
      return startRejectedReply(
        commandId: commandId,
        sessionId: plan.sessionId,
        reason: reason
      )
    }

    if let reason = trainingAssetStartBlockReason(for: plan) {
      return startRejectedReply(
        commandId: commandId,
        sessionId: plan.sessionId,
        reason: reason
      )
    }

    if healthAuthorizationStatus == "denied" || healthAuthorizationStatus == "unavailable" {
      return startRejectedReply(
        commandId: commandId,
        sessionId: plan.sessionId,
        reason: "health_authorization_\(healthAuthorizationStatus)"
      )
    }

    if isRunning {
      guard sessionId == plan.sessionId else {
        return startRejectedReply(
          commandId: commandId,
          sessionId: plan.sessionId,
          reason: "watch_busy"
        )
      }

      activePlan = plan
      plannedStopAt = plan.stopAtDate(formatter: isoFormatter) ?? plannedStopAt
      currentStartCommandId = commandId
      refreshDisplayState()
      return startedReply(commandId: commandId)
    }

    isStarting = true
    failedReason = nil
    hasCompletedSession = false
    activePlan = plan
    sessionId = plan.sessionId
    watchSessionId = UUID().uuidString
    currentStartCommandId = commandId
    sessionStartedAt = now
    plannedStopAt = plan.stopAtDate(formatter: isoFormatter)
    lastEpochAt = nil
    epochCount = 0
    heartRates = []
    motionSamples = []
    hrEma = nil
    motionEma = nil
    stableLowMovementSeconds = 0
    consecutiveLikelyRemEpochs = 0
    cueCountTonight = 0
    lastCueAt = nil
    batteryStartPct = currentBatteryPct()
    trainingStartedAt = nil
    trainingCompletedAt = nil
    ownedEpochLogs = []
    ownedCueDeliveryLogs = []
    ownedRuntimeEventLogs = []
    cueingEnabled = false
    waitingForPhoneSync = false
    phoneStartSyncSessionId = ""
    tlrPaused = false
    tlrDeferredUntil = nil
    latestCueDecisionReason = remModel.modelAvailable ? "waiting_for_epoch" : "model_asset_missing"
    latestRemProbabilityText = "unknown"
    statusText = "starting"
    refreshDisplayState()

    do {
      _ = try logWriter.start(sessionId: sessionId, watchSessionId: watchSessionId)
    } catch {
      markFailed("log_start_failed")
      return startRejectedReply(
        commandId: commandId,
        sessionId: plan.sessionId,
        reason: "log_start_failed"
      )
    }

    logEvent("watch_runtime_started", payload: [
      "source": source,
      "modelAvailable": remModel.modelAvailable,
      "classifierVersion": plan.classifier.classifierVersion,
    ])
    if !healthPreflightCompleted {
      requestHealthAuthorization()
    }
    startWorkout()
    startMotion()
    WKInterfaceDevice.current().enableWaterLock()
    isRunning = true
    isStarting = false
    statusText = "running"
    epochTimer?.invalidate()
    epochTimer = Timer.scheduledTimer(withTimeInterval: epochIntervalSeconds, repeats: true) { [weak self] _ in
      self?.handleEpochTimer()
    }

    do {
      if plan.training.enabled {
        try startWatchTraining(plan: plan)
      } else {
        startTlrInterval(plan: plan, reason: plan.tlrInterval.enabled ? "training_skipped" : "cueing_disabled_sleep_log")
      }
    } catch {
      logTrainingFailure(plan: plan, reason: error.localizedDescription)
      markFailed("watch_training_failed")
      stopSession(reason: "watch_training_failed")
      return startRejectedReply(
        commandId: commandId,
        sessionId: plan.sessionId,
        reason: "watch_training_failed"
      )
    }

    sendStatus(reason: "started")
    refreshDisplayState()

    return startedReply(commandId: commandId)
  }

  private func activateConnectivity() {
    guard WCSession.isSupported() else {
      statusText = "WatchConnectivity unavailable"
      refreshDisplayState()
      return
    }

    WCSession.default.delegate = self
    WCSession.default.activate()
  }

  private func requestHealthAuthorization() {
    preflightHealthAuthorization { _ in }
  }

  private func preflightHealthAuthorization(completion: @escaping (String?) -> Void) {
    guard HKHealthStore.isHealthDataAvailable() else {
      updateHealthAuthorizationStatus("unavailable", reason: "health_unavailable")
      completion("health_unavailable")
      return
    }

    guard let heartRateType = HKQuantityType.quantityType(forIdentifier: .heartRate) else {
      updateHealthAuthorizationStatus("unavailable", reason: "heart_rate_unavailable")
      completion("heart_rate_unavailable")
      return
    }

    let workoutType = HKQuantityType.workoutType()
    if healthStore.authorizationStatus(for: workoutType) == .sharingDenied {
      updateHealthAuthorizationStatus("denied", reason: "health_authorization_denied")
      completion("health_authorization_denied")
      return
    }

    healthStore.requestAuthorization(
      toShare: [workoutType],
      read: [heartRateType]
    ) { success, error in
      DispatchQueue.main.async {
        if let status = self.healthAuthorizationStatus(for: error) {
          self.updateHealthAuthorizationStatus(status, reason: "health_authorization_error")
          completion("health_authorization_\(status)")
        } else if !success {
          self.updateHealthAuthorizationStatus("denied", reason: "health_authorization_denied")
          completion("health_authorization_denied")
        } else if self.healthStore.authorizationStatus(for: workoutType) == .sharingDenied {
          self.updateHealthAuthorizationStatus("denied", reason: "health_authorization_denied")
          completion("health_authorization_denied")
        } else if success {
          self.updateHealthAuthorizationStatus("authorized", reason: "health_authorization_authorized")
          completion(nil)
        } else {
          self.sendStatus(reason: "health_authorization_unknown")
          completion("health_authorization_unknown")
        }
      }
    }
  }

  private func healthAuthorizationStatus(for error: Error?) -> String? {
    guard let error else {
      return nil
    }

    guard let hkError = error as? HKError else {
      return nil
    }

    if hkError.code == .errorAuthorizationDenied {
      return "denied"
    }

    if hkError.code == .errorHealthDataUnavailable {
      return "unavailable"
    }

    return nil
  }

  private func updateHealthAuthorizationStatus(_ status: String, reason: String) {
    guard healthAuthorizationStatus != status else {
      return
    }

    healthAuthorizationStatus = status
    sendStatus(reason: reason)
  }

  private func startWorkout() {
    let configuration = HKWorkoutConfiguration()
    configuration.activityType = .other
    configuration.locationType = .indoor

    do {
      let session = try HKWorkoutSession(
        healthStore: healthStore,
        configuration: configuration
      )
      let builder = session.associatedWorkoutBuilder()

      builder.dataSource = HKLiveWorkoutDataSource(
        healthStore: healthStore,
        workoutConfiguration: configuration
      )
      session.delegate = self
      builder.delegate = self
      session.startActivity(with: sessionStartedAt)
      builder.beginCollection(withStart: sessionStartedAt) { _, _ in }
      workoutSession = session
      workoutBuilder = builder
    } catch {
      markFailed("workout_start_failed")
      if let status = healthAuthorizationStatus(for: error) {
        updateHealthAuthorizationStatus(status, reason: "workout_health_error")
      }
    }
  }

  private func finishWorkout() {
    let builder = workoutBuilder
    workoutSession?.end()
    builder?.endCollection(withEnd: Date()) { _, _ in
      builder?.finishWorkout { _, _ in }
    }
    workoutSession = nil
    workoutBuilder = nil
  }

  private func startMotion() {
    guard motionManager.isAccelerometerAvailable else {
      sensorQuality = "degraded"
      logEvent("watch_runtime_error", payload: ["reason": "accelerometer_unavailable"])
      return
    }

    motionManager.accelerometerUpdateInterval = 1.0 / 30.0
    motionManager.startAccelerometerUpdates(to: motionQueue) { [weak self] data, _ in
      guard let self, let acceleration = data?.acceleration else {
        return
      }

      let t = Date().timeIntervalSince(self.sessionStartedAt)
      DispatchQueue.main.async {
        self.motionSamples.append((t, acceleration.x, acceleration.y, acceleration.z))
        self.motionSampleCount = self.motionSamples.count
      }
    }
  }

  private func startWatchTraining(plan: WatchRuntimePlan) throws {
    guard let url = localTrainingAssetURL(for: plan) else {
      throw runtimeError("Missing bundled Watch training asset \(plan.training.resourceName).\(plan.training.resourceExtension).")
    }

    let now = Date()
    let player = try AVAudioPlayer(contentsOf: url)
    player.numberOfLoops = 0
    player.volume = 1
    player.prepareToPlay()
    trainingAudioPlayer = player
    trainingStartedAt = now
    isTraining = true
    latestCueDecisionReason = "before_training_finished"
    cueingEnabled = false

    guard player.play() else {
      throw runtimeError("Could not start Watch training audio.")
    }

    logEvent("watch_training_started", payload: [
      "trainingAssetId": plan.training.trainingAssetId,
      "resourceName": plan.training.resourceName,
      "resourceExtension": plan.training.resourceExtension,
      "trainingStartedAt": isoFormatter.string(from: now),
      "expectedTrainingCompletedAt": plan.training.expectedCompletedAt ?? "",
      "durationSec": plan.training.durationSec,
      "fileDurationSec": player.duration,
      "cueScheduleCount": plan.training.cueSchedule.count,
      "cueId": plan.iPhoneAudio.cueId,
      "cueResourceName": plan.iPhoneAudio.cueResourceName,
      "cueResourceExtension": plan.iPhoneAudio.cueResourceExtension,
    ])

    scheduleWatchTrainingTimers(plan: plan)
    refreshDisplayState()
  }

  private func scheduleWatchTrainingTimers(plan: WatchRuntimePlan) {
    cancelWatchTrainingTimers()

    let elapsedSec = trainingAudioPlayer?.currentTime ?? 0

    for entry in plan.training.cueSchedule where entry.cueStartSec >= elapsedSec {
      let delay = max(0, entry.cueStartSec - elapsedSec)
      let timer = Timer.scheduledTimer(withTimeInterval: delay, repeats: false) { [weak self] _ in
        self?.playWatchTrainingCue(plan: plan, entry: entry)
      }

      trainingCueTimers.append(timer)
    }

    let remainingSec = max(0, plan.training.durationSec - elapsedSec)
    trainingCompletionTimer = Timer.scheduledTimer(withTimeInterval: remainingSec, repeats: false) { [weak self] _ in
      self?.completeWatchTraining(plan: plan, reason: "training_audio_finished")
    }
  }

  private func cancelWatchTrainingTimers() {
    trainingCompletionTimer?.invalidate()
    trainingCompletionTimer = nil

    for timer in trainingCueTimers {
      timer.invalidate()
    }

    trainingCueTimers = []
  }

  private func playWatchTrainingCue(
    plan: WatchRuntimePlan,
    entry: WatchRuntimePlan.Training.CueScheduleEntry
  ) {
    guard isRunning, isTraining else {
      return
    }

    let plannedTrainingStart = trainingStartedAt ?? sessionStartedAt
    let plannedAt = plannedTrainingStart.addingTimeInterval(entry.cueStartSec)
    let attemptAt = Date()
    let driftMs = Int(attemptAt.timeIntervalSince(plannedAt) * 1000)
    let cueAsset = "\(plan.iPhoneAudio.cueResourceName).\(plan.iPhoneAudio.cueResourceExtension)"

    logEvent("watch_training_cue_marker_reached", payload: [
      "markerIndex": entry.markerIndex,
      "markerMidpointSec": entry.markerMidpointSec,
      "cueStartSec": entry.cueStartSec,
      "plannedCueAt": isoFormatter.string(from: plannedAt),
      "actualCueAttemptAt": isoFormatter.string(from: attemptAt),
      "driftMs": driftMs,
      "cueId": plan.iPhoneAudio.cueId,
    ])

    do {
      guard let url = localAudioAssetURL(for: plan) else {
        throw runtimeError("Missing bundled Watch cue asset \(cueAsset).")
      }

      let player = try AVAudioPlayer(contentsOf: url)
      player.numberOfLoops = 0
      player.volume = 1
      player.prepareToPlay()
      trainingCueAudioPlayer = player

      guard player.play() else {
        throw runtimeError("Could not play Watch training cue.")
      }

      logEvent("watch_training_cue_played", payload: [
        "markerIndex": entry.markerIndex,
        "cueId": plan.iPhoneAudio.cueId,
        "cueAsset": cueAsset,
        "cueResourceName": plan.iPhoneAudio.cueResourceName,
        "cueResourceExtension": plan.iPhoneAudio.cueResourceExtension,
        "plannedCueAt": isoFormatter.string(from: plannedAt),
        "actualCueAttemptAt": isoFormatter.string(from: attemptAt),
        "durationSec": player.duration,
        "volume": 1,
        "driftMs": driftMs,
        "success": true,
      ])
    } catch {
      logEvent("watch_training_cue_failed", payload: [
        "markerIndex": entry.markerIndex,
        "cueId": plan.iPhoneAudio.cueId,
        "cueAsset": cueAsset,
        "plannedCueAt": isoFormatter.string(from: plannedAt),
        "actualCueAttemptAt": isoFormatter.string(from: attemptAt),
        "driftMs": driftMs,
        "success": false,
        "error": error.localizedDescription,
      ])
    }
  }

  private func completeWatchTraining(plan: WatchRuntimePlan, reason: String) {
    guard isRunning, isTraining else {
      return
    }

    cancelWatchTrainingTimers()
    trainingAudioPlayer?.stop()
    trainingCueAudioPlayer?.stop()
    trainingAudioPlayer = nil
    trainingCueAudioPlayer = nil

    let now = Date()
    trainingCompletedAt = now
    isTraining = false
    latestCueDecisionReason = "training_completed"

    let expectedCompletedAt = plan.training.expectedCompletedAt.flatMap {
      isoFormatter.date(from: $0)
    }
    let driftMs = expectedCompletedAt.map { Int(now.timeIntervalSince($0) * 1000) } ?? 0

    logEvent("watch_training_completed", payload: [
      "reason": reason,
      "expectedTrainingCompletedAt": plan.training.expectedCompletedAt ?? "",
      "actualTrainingCompletedAt": isoFormatter.string(from: now),
      "driftMs": driftMs,
    ])

    startTlrInterval(plan: plan, reason: "training_completed")
    sendStatus(reason: "training_completed")
    refreshDisplayState()
  }

  private func startTlrInterval(plan: WatchRuntimePlan, reason: String) {
    guard plan.tlrInterval.enabled else {
      latestCueDecisionReason = "cueing_disabled_sleep_log"
      cueingEnabled = false
      refreshDisplayState()
      return
    }

    shiftCueWindowAfterActualTrainingCompletion(plan: plan)
    latestCueDecisionReason = "waiting_for_epoch"
    cueingEnabled = false

    logEvent("watch_tlr_interval_started", payload: [
      "reason": reason,
      "derivedFrom": plan.tlrInterval.derivedFrom,
      "tlrIntervalStartedAt": isoFormatter.string(from: Date()),
      "earliestCueAt": activePlan?.safety.cueWindowStartAt ?? plan.tlrInterval.earliestCueAt,
      "stopAt": plan.tlrInterval.stopAt,
      "cueMode": plan.cueMode,
      "cueBudget": plan.cuePolicy.maxCuesTonight,
    ])
  }

  private func shiftCueWindowAfterActualTrainingCompletion(plan: WatchRuntimePlan) {
    guard plan.training.enabled,
      let actualCompletedAt = trainingCompletedAt,
      let expectedCompletedAt = plan.trainingExpectedCompletedDate(formatter: isoFormatter),
      let expectedCueWindowStart = plan.cueWindowStartDate(formatter: isoFormatter)
    else {
      return
    }

    let offset = expectedCueWindowStart.timeIntervalSince(expectedCompletedAt)
    let adjustedCueWindowStart = isoFormatter.string(
      from: actualCompletedAt.addingTimeInterval(offset)
    )

    if var adjustedPlan = activePlan {
      adjustedPlan.safety.cueWindowStartAt = adjustedCueWindowStart
      adjustedPlan.tlrInterval.earliestCueAt = adjustedCueWindowStart
      activePlan = adjustedPlan
      try? planStore.save(adjustedPlan)
    }
  }

  private func logTrainingFailure(plan: WatchRuntimePlan, reason: String) {
    logEvent("watch_training_failed", payload: [
      "reason": reason,
      "trainingAssetId": plan.training.trainingAssetId,
      "resourceName": plan.training.resourceName,
      "resourceExtension": plan.training.resourceExtension,
    ])
  }

  private func handleEpochTimer() {
    if let plannedStopAt, Date() >= plannedStopAt {
      stopSession(reason: "planned_stop_at")
      return
    }

    if let activePlan, let reason = batteryStopReason(for: activePlan) {
      stopSession(reason: reason)
      return
    }

    emitEpoch(connectivityState: connectivityState())
  }

  private func shouldEmitFinalEpoch() -> Bool {
    Date().timeIntervalSince(lastEpochAt ?? sessionStartedAt) >= epochIntervalSeconds
  }

  private func emitEpoch(connectivityState: String, enforceTerminalChecks: Bool = true) {
    guard isRunning, !sessionId.isEmpty, let activePlan else {
      return
    }

    if enforceTerminalChecks, let plannedStopAt, Date() >= plannedStopAt {
      stopSession(reason: "planned_stop_at")
      return
    }

    if enforceTerminalChecks, let reason = batteryStopReason(for: activePlan) {
      stopSession(reason: reason)
      return
    }

    let now = Date()
    let epochStart = now.addingTimeInterval(-epochIntervalSeconds)
    let hrSamples = heartRates
    let motion = motionSamples
    heartRates = []
    motionSamples = []
    heartRateSampleCount = 0
    motionSampleCount = 0
    epochCount += 1

    let avgHr = hrSamples.isEmpty
      ? nil
      : hrSamples.reduce(0, +) / Double(hrSamples.count)

    if let avgHr {
      hrEma = hrEma.map { (1 - hrAlpha) * avgHr + hrAlpha * $0 } ?? avgHr
    }

    let magnitudes = motion.map { sample in
      sqrt(sample.x * sample.x + sample.y * sample.y + sample.z * sample.z)
    }
    let motionSum = magnitudes.reduce(0, +)
    let motionTotal = motionSum * motionSum

    if !motion.isEmpty {
      motionEma = motionEma.map { (1 - motionAlpha) * motionTotal + motionAlpha * $0 } ?? motionTotal
    }

    let elapsed = now.timeIntervalSince(sessionStartedAt)
    let epochDurationSeconds = max(0, now.timeIntervalSince(epochStart))
    let hrFeature = hrEma.map { pow($0, 3) / 1000 }
    let motionFeature = motionEma.map { $0 / 1e9 }
    let quality = sensorQualityFor(hrCount: hrSamples.count, motionCount: motion.count)
    let roughIntensity = roughMovementIntensity(magnitudes: magnitudes)
    if (roughIntensity == "still" || roughIntensity == "light") && quality != "missing" {
      stableLowMovementSeconds += epochDurationSeconds
    } else {
      stableLowMovementSeconds = 0
    }
    sensorQuality = quality
    batteryText = formatBattery()
    lastEpochAt = now

    let features = WatchEpochFeatures(
      epochIndex: epochCount,
      epochStart: epochStart,
      epochEnd: now,
      elapsedSessionSeconds: elapsed,
      hrFeature: hrFeature,
      motionFeature: motionFeature,
      stableLowMovementSeconds: stableLowMovementSeconds,
      sensorQuality: quality,
      roughMovementIntensity: roughIntensity,
      watchBatteryLevel: Double(WKInterfaceDevice.current().batteryLevel)
    )
    let prediction = remModel.predict(features: features, plan: activePlan)
    var decision: WatchCueDecision
    if isTraining {
      decision = WatchCueDecision(
        shouldPlayCue: false,
        reason: "before_training_finished",
        cueingEnabled: false,
        consecutiveLikelyRemEpochs: 0
      )
    } else {
      decision = cuePolicy.decide(
        now: now,
        plan: activePlan,
        features: features,
        prediction: prediction,
        consecutiveLikelyRemEpochs: consecutiveLikelyRemEpochs,
        cueCountTonight: cueCountTonight,
        lastCueAt: lastCueAt,
        formatter: isoFormatter
      )
    }

    if !isTraining && activePlan.cueMode != "none" && tlrPaused {
      decision = WatchCueDecision(
        shouldPlayCue: false,
        reason: "user_paused_tlr",
        cueingEnabled: false,
        consecutiveLikelyRemEpochs: decision.consecutiveLikelyRemEpochs
      )
    } else if !isTraining,
      activePlan.cueMode != "none",
      let tlrDeferredUntil,
      now < tlrDeferredUntil
    {
      decision = WatchCueDecision(
        shouldPlayCue: false,
        reason: "user_deferred_tlr",
        cueingEnabled: false,
        consecutiveLikelyRemEpochs: decision.consecutiveLikelyRemEpochs
      )
    } else if let tlrDeferredUntil, now >= tlrDeferredUntil {
      self.tlrDeferredUntil = nil
    }
    consecutiveLikelyRemEpochs = decision.consecutiveLikelyRemEpochs
    cueingEnabled = decision.cueingEnabled
    latestCueDecisionReason = decision.reason
    latestRemProbabilityText = prediction.remProbability.map { String(format: "%.2f", $0) } ?? "unknown"

    if decision.shouldPlayCue {
      let result = cueDelivery.deliverCue(plan: activePlan)
      let deliveredCue = result.deliveredHaptic || result.deliveredAudio
      if deliveredCue {
        cueCountTonight += 1
        lastCueAt = now
      }
      let deliveryLog = ownedCueDeliveryLog(
        now: now,
        plan: activePlan,
        epochIndex: epochCount,
        result: result
      )
      ownedCueDeliveryLogs.append(deliveryLog)
      let deliveryPayload: [String: Any] = [
        "cueMode": activePlan.cueMode,
        "deliveredHaptic": result.deliveredHaptic,
        "deliveredAudio": result.deliveredAudio,
        "reason": result.reason,
      ]
      logEvent(deliveredCue ? "watch_cue_played" : "watch_cue_failed", payload: deliveryPayload)
    }

    let ownedEpochLog = ownedEpochLog(
      now: now,
      epochStart: epochStart,
      elapsed: elapsed,
      avgHr: avgHr,
      hrSamples: hrSamples,
      motion: motion,
      motionSum: motionSum,
      magnitudes: magnitudes,
      quality: quality,
      prediction: prediction,
      decision: decision
    )
    ownedEpochLogs.append(ownedEpochLog)
    logWriter.appendJSONObject(ownedEpochLog)
    sendStatus(reason: "epoch_closed")
    refreshDisplayState()
  }

  private func ownedCueDeliveryLog(
    now: Date,
    plan: WatchRuntimePlan,
    epochIndex: Int,
    result: WatchCueDeliveryResult
  ) -> [String: Any] {
    let hapticRequested = plan.cueMode == "haptic_only" || plan.cueMode == "audio_haptic"
    let audioRequested = plan.cueMode == "audio_only" || plan.cueMode == "audio_haptic"
    let succeeded = result.deliveredHaptic || result.deliveredAudio
    var log: [String: Any] = [
      "protocol": "watch-cue-delivery-v2",
      "id": "\(plan.sessionId):watch-cue:\(watchSessionId):\(epochIndex)",
      "sessionId": plan.sessionId,
      "epochIndex": epochIndex,
      "requestedAt": isoFormatter.string(from: now),
      "cueMode": plan.cueMode,
      "cueId": plan.iPhoneAudio.cueId,
      "deliveryDevice": "watch",
      "hapticRequested": hapticRequested,
      "audioRequested": audioRequested,
      "succeeded": succeeded,
    ]

    if !succeeded || (audioRequested && !result.deliveredAudio) {
      log["errorCode"] = result.reason
      log["errorMessage"] = result.reason
    }

    return log
  }

  private func ownedEpochLog(
    now: Date,
    epochStart: Date,
    elapsed: Double,
    avgHr: Double?,
    hrSamples: [Double],
    motion: [(t: Double, x: Double, y: Double, z: Double)],
    motionSum: Double,
    magnitudes: [Double],
    quality: String,
    prediction: WatchRemPrediction,
    decision: WatchCueDecision
  ) -> [String: Any] {
    var log: [String: Any] = [
      "protocol": "watch-epoch-v2",
      "sessionId": sessionId,
      "watchSessionId": watchSessionId,
      "epochIndex": epochCount,
      "startedAt": isoFormatter.string(from: epochStart),
      "endedAt": isoFormatter.string(from: now),
      "elapsedSec": elapsed,
      "heartRateSampleCount": hrSamples.count,
      "heartRateMissing": avgHr == nil,
      "accelSampleCount": motion.count,
      "accelMissing": motion.isEmpty,
      "movementGateTriggered": decision.reason == "movement_pause"
        || decision.reason == "waiting_for_stable_low_movement",
      "lowPowerModeEnabled": ProcessInfo.processInfo.isLowPowerModeEnabled,
      "modelVersion": prediction.classifierVersion,
      "remLabel": prediction.remLabel,
      "likelyRem": prediction.remLabel == "likely_rem",
      "consecutiveLikelyRemEpochs": decision.consecutiveLikelyRemEpochs,
      "cueDecisionAction": decision.shouldPlayCue
        ? "play_cue"
        : (decision.cueingEnabled ? "pause" : "suppress"),
      "cueDecisionReason": decision.reason,
    ]

    if let avgHr {
      log["heartRateMeanBpm"] = avgHr
    }
    if let minBpm = hrSamples.min() {
      log["heartRateMinBpm"] = minBpm
    }
    if let maxBpm = hrSamples.max() {
      log["heartRateMaxBpm"] = maxBpm
    }
    if !magnitudes.isEmpty {
      log["motionMean"] = motionSum / Double(magnitudes.count)
    }
    if let maxMagnitude = magnitudes.max() {
      log["motionMax"] = maxMagnitude
    }
    if let batteryPct = currentBatteryPct() {
      log["batteryPct"] = batteryPct
    }
    if let remProbability = prediction.remProbability {
      log["remProbability"] = remProbability
    }
    if quality == "missing" {
      log["cueDecisionReason"] = "sensor_quality_missing"
    }

    return log
  }

  private func sendStatus(reason: String) {
    guard WCSession.default.activationState == .activated else {
      return
    }

    let message = statusPayload(reason: reason)

    if WCSession.default.isReachable {
      WCSession.default.sendMessage(message) { [weak self] reply in
        DispatchQueue.main.async {
          self?.handleWatchCommand(reply)
        }
      } errorHandler: { [weak self] _ in
        self?.syncQueue.transferUserInfo(message)
        DispatchQueue.main.async {
          self?.refreshDisplayState()
        }
      }
    } else {
      syncQueue.transferUserInfo(message)
      refreshDisplayState()
    }
  }

  private func statusPayload(reason: String) -> [String: Any] {
    var message: [String: Any] = [
      "schemaVersion": "watch-owned-status-v2",
      "protocol": "watch-owned-status-v2",
      "available": true,
      "runtimeOwner": "watch",
      "preparedSessionId": activePlan?.sessionId ?? "",
      "sessionId": isRunning ? sessionId : activePlan?.sessionId ?? sessionId,
      "watchSessionId": watchSessionId,
      "reason": reason,
      "state": displayState.statusState,
      "isRunning": isRunning,
      "status": statusText,
      "displayState": displayState.title,
      "sentAt": isoFormatter.string(from: Date()),
      "startedAt": isRunning ? isoFormatter.string(from: sessionStartedAt) : "",
      "isTraining": isTraining,
      "trainingStartedAt": trainingStartedAt.map { isoFormatter.string(from: $0) } ?? "",
      "trainingCompletedAt": trainingCompletedAt.map { isoFormatter.string(from: $0) } ?? "",
      "stopAt": plannedStopAt.map { isoFormatter.string(from: $0) } ?? "",
      "epochCount": epochCount,
      "lastEpochAt": lastEpochAt.map { isoFormatter.string(from: $0) } ?? "",
      "healthAuthorizationStatus": healthAuthorizationStatus,
      "cueingEnabled": cueingEnabled,
      "latestCueDecisionReason": latestCueDecisionReason,
      "syncPendingCount": syncPendingCount,
      "syncPending": syncPendingCount > 0,
      "tlrPaused": tlrPaused,
      "tlrDeferredUntil": tlrDeferredUntil.map { isoFormatter.string(from: $0) } ?? "",
      "modelAvailable": remModel.modelAvailable,
      "lowPowerModeEnabled": ProcessInfo.processInfo.isLowPowerModeEnabled,
      "watchReachable": WCSession.default.isReachable,
      "connectivityState": connectivityState(),
    ]

    if let batteryPct = currentBatteryPct() {
      message["batteryPct"] = batteryPct
      message["batteryLevel"] = batteryPct / 100
    }
    if !currentStartCommandId.isEmpty {
      message["commandId"] = currentStartCommandId
    }
    if let activePlan {
      message["storedPlanSessionId"] = activePlan.sessionId
      message["classifierVersion"] = activePlan.classifier.classifierVersion
      message["cueMode"] = activePlan.cueMode
    }
    if let failedReason {
      message["failedReason"] = failedReason
    }
    if let lastEpochAt {
      message["latestEpochAt"] = isoFormatter.string(from: lastEpochAt)
    }
    if let latestRemProbability = Double(latestRemProbabilityText) {
      message["latestRemProbability"] = latestRemProbability
    }

    return message
  }

  private func startedReply(commandId: String) -> [String: Any] {
    [
      "schemaVersion": "watch-owned-started-v2",
      "commandId": commandId,
      "sessionId": sessionId,
      "watchSessionId": watchSessionId,
      "startedAt": isoFormatter.string(from: sessionStartedAt),
      "isRunning": isRunning,
      "healthAuthorizationStatus": healthAuthorizationStatus,
      "stopAt": plannedStopAt.map { isoFormatter.string(from: $0) } ?? ""
    ]
  }

  private func startRejectedReply(
    commandId: String,
    sessionId: String,
    reason: String
  ) -> [String: Any] {
    [
      "schemaVersion": "watch-owned-start-rejected-v2",
      "commandId": commandId,
      "sessionId": sessionId,
      "reason": reason,
      "isRunning": isRunning,
      "watchSessionId": watchSessionId,
      "healthAuthorizationStatus": healthAuthorizationStatus
    ]
  }

  private func sensorQualityFor(hrCount: Int, motionCount: Int) -> String {
    if hrCount == 0 && motionCount == 0 {
      return "missing"
    }

    if hrCount == 0 || motionCount < 600 {
      return "degraded"
    }

    return "good"
  }

  private func roughMovementIntensity(magnitudes: [Double]) -> String {
    guard let maxMagnitude = magnitudes.max() else {
      return "still"
    }

    if maxMagnitude >= 1.45 {
      return "large"
    }

    if maxMagnitude >= 1.18 {
      return "moderate"
    }

    if maxMagnitude >= 1.06 {
      return "light"
    }

    return "still"
  }

  private func connectivityState() -> String {
    guard WCSession.isSupported(),
      WCSession.default.activationState == .activated
    else {
      return "unknown"
    }

    return WCSession.default.isReachable ? "connected" : "delayed"
  }

  private func formatBattery() -> String {
    let level = WKInterfaceDevice.current().batteryLevel

    return level < 0 ? "unknown" : "\(Int(level * 100))%"
  }

  private func currentBatteryPct() -> Double? {
    let level = WKInterfaceDevice.current().batteryLevel

    return level < 0 ? nil : Double(level * 100)
  }

  private func batteryStopReason(for plan: WatchRuntimePlan) -> String? {
    guard let batteryPct = currentBatteryPct() else {
      return nil
    }

    if batteryPct < plan.batteryPolicy.hardStopBelowPct {
      return "battery_hard_stop"
    }

    if batteryPct < plan.batteryPolicy.stopRuntimeBelowPct {
      return "battery_stop"
    }

    return nil
  }

  private func cueAssetStartBlockReason(for plan: WatchRuntimePlan) -> String? {
    let overnightCueNeedsAudio = plan.cueMode == "audio_only" || plan.cueMode == "audio_haptic"
    let trainingNeedsAudio = plan.training.enabled

    guard overnightCueNeedsAudio || trainingNeedsAudio else {
      return nil
    }

    return localAudioAssetURL(for: plan) == nil ? "watch_audio_asset_missing" : nil
  }

  private func trainingAssetStartBlockReason(for plan: WatchRuntimePlan) -> String? {
    guard plan.training.enabled else {
      return nil
    }

    if plan.training.durationSec <= 0 {
      return "watch_training_duration_invalid"
    }

    return localTrainingAssetURL(for: plan) == nil ? "watch_training_asset_missing" : nil
  }

  private func localTrainingAssetURL(for plan: WatchRuntimePlan) -> URL? {
    guard !plan.training.resourceName.isEmpty else {
      return nil
    }

    return Bundle.main.url(
      forResource: plan.training.resourceName,
      withExtension: plan.training.resourceExtension
    )
  }

  private func localAudioAssetURL(for plan: WatchRuntimePlan) -> URL? {
    guard !plan.iPhoneAudio.cueResourceName.isEmpty else {
      return nil
    }

    return Bundle.main.url(
      forResource: plan.iPhoneAudio.cueResourceName,
      withExtension: plan.iPhoneAudio.cueResourceExtension
    )
  }

  private func runtimeError(_ message: String) -> NSError {
    NSError(domain: "LucidCueWatchRuntime", code: -1, userInfo: [
      NSLocalizedDescriptionKey: message
    ])
  }

  private func refreshPlanText() {
    guard let activePlan else {
      planText = "none"
      return
    }

    planText = activePlan.sessionId
  }

  private func refreshDisplayState() {
    syncPendingCount = syncQueue.pendingCount

    if let failedReason {
      displayState = .failed(failedReason)
    } else if waitingForPhoneSync {
      displayState = .waitingForPhoneSync
    } else if hasPendingPhoneStartSync {
      displayState = .startSyncWaiting
    } else if isStarting {
      displayState = .starting
    } else if isRunning {
      displayState = runningDisplayState()
    } else if syncPendingCount > 0 {
      displayState = .syncPending
    } else if hasCompletedSession {
      displayState = .completed
    } else if activePlan == nil {
      displayState = .noPlan
    } else {
      displayState = .ready
    }

    statusText = displayState.title
  }

  private func runningDisplayState() -> WatchRuntimeDisplayState {
    if isTraining {
      return .training
    }

    if latestCueDecisionReason == "low_battery" {
      return .cueingDisabledLowBattery
    }

    if let activePlan,
      let cueWindowStart = activePlan.cueWindowStartDate(formatter: isoFormatter),
      Date() < cueWindowStart
    {
      return .cueWindowPending
    }

    if cueingEnabled {
      return .cueingEnabled
    }

    return .running
  }

  private func logEvent(_ eventType: String, payload: [String: Any]) {
    guard !sessionId.isEmpty else {
      return
    }

    let timestamp = isoFormatter.string(from: Date())
    logWriter.append(
      eventType: eventType,
      sessionId: sessionId,
      watchSessionId: watchSessionId,
      timestamp: timestamp,
      payload: payload
    )

    if shouldIncludeOwnedRuntimeEvent(eventType) {
      ownedRuntimeEventLogs.append([
        "protocol": "watch-runtime-event-v2",
        "id": ownedRuntimeEventId(
          eventType: eventType,
          timestamp: timestamp,
          payload: payload
        ),
        "sessionId": sessionId,
        "watchSessionId": watchSessionId,
        "timestamp": timestamp,
        "eventType": eventType,
        "payload": payload,
      ])
    }
  }

  private func shouldIncludeOwnedRuntimeEvent(_ eventType: String) -> Bool {
    eventType.hasPrefix("watch_training_") || eventType == "watch_tlr_interval_started"
  }

  private func ownedRuntimeEventId(
    eventType: String,
    timestamp: String,
    payload: [String: Any]
  ) -> String {
    let suffix = payload["markerIndex"].map { String(describing: $0) }
      ?? payload["reason"].map { String(describing: $0) }
      ?? "event"

    return "\(sessionId):\(eventType):\(watchSessionId):\(timestamp):\(suffix)"
  }

  private func transferActiveLog(reason: String) {
    guard let url = logWriter.activeLogURL else {
      return
    }

    syncQueue.transferFile(url, metadata: [
      "schemaVersion": "watch-runtime-log-file-v2",
      "sessionId": sessionId,
      "watchSessionId": watchSessionId,
      "reason": reason,
    ])
    transferOwnedLogPackage(reason: reason)
    waitingForPhoneSync = true
    refreshDisplayState()
  }

  private func transferOwnedLogPackage(reason: String) {
    guard !sessionId.isEmpty else {
      return
    }

    var summary: [String: Any] = [
      "protocol": "watch-session-summary-v2",
      "sessionId": sessionId,
      "startedAt": isoFormatter.string(from: sessionStartedAt),
      "stoppedAt": isoFormatter.string(from: Date()),
      "stopReason": ownedStopReason(reason),
      "epochCount": epochCount,
      "validEpochCount": ownedEpochLogs.filter { epoch in
        (epoch["heartRateMissing"] as? Bool) != true
          || (epoch["accelMissing"] as? Bool) != true
      }.count,
      "cueCount": cueCountTonight,
      "batteryEndPct": currentBatteryPct() ?? batteryStartPct ?? 0,
      "syncStatus": "queued",
    ]

    if let batteryStartPct {
      summary["batteryStartPct"] = batteryStartPct
    }
    if let activePlan {
      summary["modelVersion"] = activePlan.classifier.classifierVersion
    }

    let package: [String: Any] = [
      "schemaVersion": "watch-owned-log-package-v2",
      "sessionId": sessionId,
      "watchSessionId": watchSessionId,
      "sentAt": isoFormatter.string(from: Date()),
      "runtimeEvents": ownedRuntimeEventLogs,
      "epochs": ownedEpochLogs,
      "cueDeliveries": ownedCueDeliveryLogs,
      "summary": summary,
    ]

    guard JSONSerialization.isValidJSONObject(package) else {
      return
    }

    if WCSession.default.activationState == .activated && WCSession.default.isReachable {
      WCSession.default.sendMessage(package) { _ in } errorHandler: { [weak self] _ in
        self?.syncQueue.transferUserInfo(package)
      }
    }

    syncQueue.transferUserInfo(package)
  }

  private func ownedStopReason(_ reason: String) -> String {
    switch reason {
    case "planned_stop_at":
      return "completed_stop_at"
    case "watch_ui", "iphone_command":
      return "manual_stop"
    case "battery_stop", "battery_hard_stop":
      return "battery_stop"
    case "workout_start_failed":
      return "workout_failure"
    default:
      return failedReason == nil ? "unknown_failure" : "sensor_failure"
    }
  }

  private func markFailed(_ reason: String) {
    failedReason = reason
    statusText = reason
    logEvent("watch_runtime_error", payload: ["reason": reason])
    refreshDisplayState()
  }
}

extension WatchSessionManager: WCSessionDelegate {
  func session(
    _ session: WCSession,
    activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {
    DispatchQueue.main.async {
      self.isConnected = activationState == .activated
      if let error {
        self.markFailed(error.localizedDescription)
      } else {
        self.sendStatus(reason: "activated")
        self.refreshDisplayState()
      }
    }
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    DispatchQueue.main.async {
      _ = self.handleWatchCommand(message)
    }
  }

  func session(
    _ session: WCSession,
    didReceiveMessage message: [String: Any],
    replyHandler: @escaping ([String: Any]) -> Void
  ) {
    DispatchQueue.main.async {
      replyHandler(self.handleWatchCommand(message))
    }
  }

  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
    DispatchQueue.main.async {
      _ = self.handleWatchCommand(userInfo)
    }
  }

  func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
    DispatchQueue.main.async {
      _ = self.handleWatchCommand(applicationContext)
    }
  }

  @discardableResult
  private func handleWatchCommand(_ message: [String: Any]) -> [String: Any] {
    let schemaVersion = message["schemaVersion"] as? String

    if schemaVersion == "watch-owned-command-v2" {
      return handleWatchOwnedCommand(message)
    }

    if schemaVersion == "watch-owned-sync-state-v2" {
      return handleWatchOwnedSyncState(message)
    }

    return ["schemaVersion": "watch-owned-ack-v2"]
  }

  private func handleWatchOwnedCommand(_ message: [String: Any]) -> [String: Any] {
    let command = message["command"] as? String
    let commandSessionId = message["sessionId"] as? String

    if command == "status" {
      return statusPayload(reason: "query")
    }

    if command == "stop" {
      if commandSessionId?.isEmpty != false
        || commandSessionId == sessionId
        || commandSessionId == activePlan?.sessionId
      {
        stopSession(reason: message["reason"] as? String ?? "iphone_command")
      }
      return statusPayload(reason: "stop_command")
    }

    if command == "sync_logs" {
      transferOwnedLogPackage(reason: "phone_sync_button")
      sendStatus(reason: "phone_sync_button")
      return statusPayload(reason: "phone_sync_button")
    }

    if command == "ack_logs_imported" {
      if commandSessionId?.isEmpty != false
        || commandSessionId == activePlan?.sessionId
        || commandSessionId == sessionId
      {
        waitingForPhoneSync = false
        hasCompletedSession = true
        refreshDisplayState()
        sendStatus(reason: "logs_imported_on_phone")
      }
      return statusPayload(reason: "logs_imported_on_phone")
    }

    if command == "start" {
      return [
        "schemaVersion": "watch-owned-ack-v2",
        "accepted": false,
        "reason": "manual_watch_start_required",
      ]
    }

    return [
      "schemaVersion": "watch-owned-ack-v2",
      "accepted": true,
      "reason": "command_ignored",
    ]
  }

  private func handleWatchOwnedSyncState(_ message: [String: Any]) -> [String: Any] {
    let phase = message["phase"] as? String ?? ""
    let state = message["state"] as? String ?? ""
    let syncSessionId = message["sessionId"] as? String ?? ""

    if phase == "start" && state == "waiting_for_watch_sync" && !syncSessionId.isEmpty {
      phoneStartSyncSessionId = syncSessionId
      waitingForPhoneSync = false
      failedReason = nil
      refreshDisplayState()
      sendStatus(reason: "phone_waiting_for_watch_sync")
      return statusPayload(reason: "phone_waiting_for_watch_sync")
    }

    return ["schemaVersion": "watch-owned-ack-v2"]
  }

  private func handleStartSyncReply(_ reply: [String: Any]) {
    guard reply["schemaVersion"] as? String == "watch-owned-start-sync-v2",
      reply["accepted"] as? Bool == true,
      let rawPlan = reply["plan"] as? [String: Any]
    else {
      isStarting = false
      markFailed(reply["reason"] as? String ?? "watch_sync_rejected")
      return
    }

    let commandId = "watch-sync-\(UUID().uuidString)"
    let plan: WatchRuntimePlan
    do {
      plan = try WatchRuntimePlan.fromDictionary(
        rawPlan,
        fallbackSessionId: reply["sessionId"] as? String ?? phoneStartSyncSessionId,
        receivedAt: Date(),
        formatter: isoFormatter
      )
      try planStore.save(plan)
      activePlan = plan
      phoneStartSyncSessionId = ""
      refreshPlanText()
    } catch {
      isStarting = false
      markFailed("invalid_watch_sync_plan")
      return
    }

    preflightHealthAuthorization { [weak self] blockReason in
      guard let self, self.isStarting else {
        return
      }

      if let blockReason {
        self.isStarting = false
        self.markFailed(blockReason)
        self.sendStatus(reason: blockReason)
        return
      }

      let startReply = self.startStoredPlan(
        plan,
        commandId: commandId,
        source: "watch_sync_phone",
        healthPreflightCompleted: true
      )

      if startReply["schemaVersion"] as? String == "watch-owned-start-rejected-v2" {
        self.isStarting = false
        self.markFailed(startReply["reason"] as? String ?? "watch_start_rejected")
        self.sendStatus(reason: startReply["reason"] as? String ?? "watch_start_rejected")
      }
    }
  }
}

extension WatchSessionManager: HKWorkoutSessionDelegate {
  func workoutSession(
    _ workoutSession: HKWorkoutSession,
    didChangeTo toState: HKWorkoutSessionState,
    from fromState: HKWorkoutSessionState,
    date: Date
  ) {}

  func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
    DispatchQueue.main.async {
      self.markFailed(error.localizedDescription)
    }
  }
}

extension WatchSessionManager: HKLiveWorkoutBuilderDelegate {
  func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

  func workoutBuilder(
    _ workoutBuilder: HKLiveWorkoutBuilder,
    didCollectDataOf collectedTypes: Set<HKSampleType>
  ) {
    guard let heartRateType = HKQuantityType.quantityType(forIdentifier: .heartRate),
      collectedTypes.contains(heartRateType),
      let statistics = workoutBuilder.statistics(for: heartRateType)
    else {
      return
    }

    let unit = HKUnit.count().unitDivided(by: .minute())
    let bpm = statistics.mostRecentQuantity()?.doubleValue(for: unit)

    DispatchQueue.main.async {
      if let bpm {
        self.updateHealthAuthorizationStatus("authorized", reason: "heart_rate_sample_received")
        self.heartRates.append(bpm)
        self.heartRateSampleCount = self.heartRates.count
      }
    }
  }
}
