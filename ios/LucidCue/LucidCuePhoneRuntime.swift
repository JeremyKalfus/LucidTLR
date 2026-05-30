import AVFoundation
import CoreMotion
import React
import UIKit

private struct PhoneRuntimePlan: Codable {
  struct Training: Codable {
    let guidedTrainingSkipped: Bool
  }

  struct AudioBed: Codable {
    let enabled: Bool
    let assetId: String
    let volume: Double
  }

  struct BackgroundAudio: Codable {
    let option: String
    let enabled: Bool
    let volume: Double
    let binauralCarrierFrequencyHz: Double
    let binauralBeatFrequencyHz: Double
  }

  struct Cue: Codable {
    let cueId: String
    let assetId: String
    let resourceName: String
    let resourceExtension: String
    let durationSeconds: Double
    let startVolume: Double
    let rampPerCue: Double
    let capVolume: Double
  }

  struct Timing: Codable {
    struct PredictedRemWindow: Codable {
      let startAt: String
      let endAt: String
      let confidence: Double
      let source: String
    }

    let earliestCueAt: String
    let latestCueAt: String
    let predictedRemWindows: [PredictedRemWindow]
    let cueIntervalRangeSeconds: [Double]
  }

  struct Movement: Codable {
    let enabled: Bool
    let summaryIntervalSeconds: Double
    let stableLowMovementRequiredSeconds: Double
    let largeMovementThreshold: Double
    let cueAssociatedMovementWindowSeconds: Double
    let cueAssociatedMovementPauseSeconds: Double
  }

  struct Budget: Codable {
    let maxCuesTonight: Int
    let maxCuesPerBlock: Int
    let maxBlockDurationMinutes: Double
    let minRestBetweenBlocksMinutes: Double
  }

  struct Pauses: Codable {
    let minimumSecondsSinceLastCue: Double
    let userReportedAwakeningPauseSeconds: Double
  }

  struct Safety: Codable {
    let requireAudioBed: Bool
    let stopAt: String?
  }

  struct Alarm: Codable {
    let enabled: Bool
    let fireAt: String?
    let autoShutoff: Bool
    let ringDurationSeconds: Double?
    let volume: Double
  }

  let sessionId: String
  let protocolVersion: String
  let nativePolicyVersion: String
  let mode: String
  let startedAt: String
  let trainingStartedAt: String
  let trainingEndedAt: String
  let training: Training
  let audioBed: AudioBed
  let backgroundAudio: BackgroundAudio
  let cue: Cue
  let timing: Timing
  let movement: Movement
  let budget: Budget
  let pauses: Pauses
  let safety: Safety
  let alarm: Alarm
}

private struct PhoneRuntimeState: Codable {
  let sessionId: String
  var runtimeStartedAt: String
  var cueCount: Int
  var cuesInBlock: Int
  var blockStartedAt: String?
  var blockRestUntil: String?
  var lastCueAt: String?
  var nextCueCandidateAt: String?
  var movementPauseUntil: String?
  var cueAssociatedMovementPauseUntil: String?
  var stableLowMovementSeconds: Double
  var latestDecisionReason: String?
  var latestMovementIntensity: String?
  var latestMotionSummaryAt: String?
  var latestRuntimeError: String?
  var alarmRinging: Bool
  var alarmFireAt: String?
  var alarmFiredAt: String?
}

private struct RuntimeSnapshot: Codable {
  let plan: PhoneRuntimePlan
  let state: PhoneRuntimeState
}

@objc(LucidCuePhoneRuntime)
class LucidCuePhoneRuntime: NSObject {
  private let queue = DispatchQueue(label: "com.lucidcue.phone-runtime")
  private let isoFormatter = ISO8601DateFormatter()
  private let motionManager = CMMotionManager()
  private let motionQueue = OperationQueue()
  private var activePlan: PhoneRuntimePlan?
  private var state: PhoneRuntimeState?
  private var activeLogs: [[String: Any]] = []
  private var decisionTimer: DispatchSourceTimer?
  private var motionSummaryTimer: DispatchSourceTimer?
  private var batteryTimer: DispatchSourceTimer?
  private var alarmTimer: DispatchSourceTimer?
  private var alarmStopTimer: DispatchSourceTimer?
  private var audioEngine: AVAudioEngine?
  private var audioBedPlayer: AVAudioPlayerNode?
  private var backgroundAudioPlayer: AVAudioPlayerNode?
  private var cuePlayer: AVAudioPlayerNode?
  private var alarmPlayer: AVAudioPlayerNode?
  private var motionSampleCount = 0
  private var motionMagnitudeSum = 0.0
  private var motionMagnitudeMax = 0.0
  private var lastMotionSummaryAt: Date?
  private var lastCueAssociatedMovementAt: String?
  private var audioInterruptionActive = false
  private var audioRecoveryGraceUntil: Date?
  private var nextAudioRecoveryAttemptAt: Date?
  private let activeInterruptionRecoveryRetrySeconds: TimeInterval = 15
  private let postInterruptionRecoveryGraceSeconds: TimeInterval = 30
  private let routeChangeRecoveryGraceSeconds: TimeInterval = 20
  private let routeChangeRecoveryDelaySeconds: TimeInterval = 2

  override init() {
    isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    super.init()
    UIDevice.current.isBatteryMonitoringEnabled = true
    observeSystemEvents()
    restoreRuntimeIfNeeded()
  }

  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc(startPhoneTlrSession:resolver:rejecter:)
  func startPhoneTlrSession(
    _ planDictionary: NSDictionary,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let plan: PhoneRuntimePlan

    do {
      plan = try decodePlan(planDictionary)
      try validatePlan(plan)
    } catch {
      reject("invalid_phone_runtime_plan", error.localizedDescription, error)
      return
    }

    queue.async {
      self.stopRuntime(reason: "replaced_by_new_session", errorMessage: nil, logEvent: true)
      self.activePlan = plan
      self.audioInterruptionActive = false
      self.audioRecoveryGraceUntil = nil
      self.nextAudioRecoveryAttemptAt = nil
      self.state = PhoneRuntimeState(
        sessionId: plan.sessionId,
        runtimeStartedAt: self.formatDate(Date()),
        cueCount: 0,
        cuesInBlock: 0,
        stableLowMovementSeconds: 0,
        latestDecisionReason: "runtime_started",
        alarmRinging: false,
        alarmFireAt: plan.alarm.fireAt,
        alarmFiredAt: nil
      )
      self.activeLogs = self.loadLogs(sessionId: plan.sessionId)

      self.appendEvent("runtime_started", payload: [
        "protocolVersion": plan.protocolVersion,
        "nativePolicyVersion": plan.nativePolicyVersion,
        "startedAt": plan.startedAt,
        "trainingStartedAt": plan.trainingStartedAt,
        "trainingEndedAt": plan.trainingEndedAt,
        "earliestCueAt": plan.timing.earliestCueAt,
        "latestCueAt": plan.timing.latestCueAt,
        "predictedRemWindowPolicy": self.usesHistoricalRemWindows(plan: plan)
          ? "historical_rem_only_no_shoulder"
          : "broad_cue_window",
        "audioBedAsset": plan.audioBed.assetId,
        "backgroundAudioOption": plan.backgroundAudio.option,
        "backgroundAudioEnabled": plan.backgroundAudio.enabled,
        "guidedTrainingSkipped": plan.training.guidedTrainingSkipped,
        "alarmEnabled": plan.alarm.enabled,
        "alarmFireAt": plan.alarm.fireAt ?? "",
        "alarmAutoShutoff": plan.alarm.autoShutoff,
        "alarmRingDurationSeconds": plan.alarm.ringDurationSeconds ?? 0,
        "cueAsset": plan.cue.assetId,
        "cueId": plan.cue.cueId,
        "cueResourceName": plan.cue.resourceName,
        "cueResourceExtension": plan.cue.resourceExtension,
        "appState": self.currentAppState()
      ])

      do {
        try self.configureAudioSession()
        try self.startAudioBed(plan: plan)
        try self.startBackgroundAudio(plan: plan)
        try self.startMotionSummaries(plan: plan)
        self.logBatterySummary(reason: "runtime_start")
        self.scheduleDecisionLoop()
        self.scheduleBatteryTimer()
        self.scheduleAlarmIfNeeded(plan: plan)
        self.persistRuntimeSnapshot()
        resolve(nil)
      } catch {
        self.appendEvent("runtime_error", payload: [
          "operation": "start_runtime",
          "error": error.localizedDescription
        ])
        self.stopRuntime(reason: "error", errorMessage: error.localizedDescription, logEvent: true)
        reject("phone_runtime_start_failed", error.localizedDescription, error)
      }
    }
  }

  @objc(stopPhoneTlrSession:resolver:rejecter:)
  func stopPhoneTlrSession(
    _ options: NSDictionary?,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let reason = options?["reason"] as? String ?? "user_stopped"

    queue.async {
      self.stopRuntime(reason: reason, errorMessage: nil, logEvent: true)
      resolve(nil)
    }
  }

  @objc(getPhoneRuntimeStatus:rejecter:)
  func getPhoneRuntimeStatus(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async {
      resolve(self.statusPayload())
    }
  }

  @objc(getPhoneRuntimeLogs:resolver:rejecter:)
  func getPhoneRuntimeLogs(
    _ sessionId: NSString,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async {
      resolve(self.loadLogs(sessionId: sessionId as String))
    }
  }

  @objc(clearPhoneRuntimeLogs:resolver:rejecter:)
  func clearPhoneRuntimeLogs(
    _ sessionId: NSString,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async {
      let id = sessionId as String

      if id.isEmpty {
        self.activeLogs = []
        try? FileManager.default.removeItem(at: self.storageDirectory())
      } else {
        if id == self.activePlan?.sessionId {
          self.activeLogs = []
        }

        try? FileManager.default.removeItem(at: self.logsURL(sessionId: id))
      }

      resolve(nil)
    }
  }

  private func decodePlan(_ dictionary: NSDictionary) throws -> PhoneRuntimePlan {
    let data = try JSONSerialization.data(withJSONObject: dictionary, options: [])

    return try JSONDecoder().decode(PhoneRuntimePlan.self, from: data)
  }

  private func validatePlan(_ plan: PhoneRuntimePlan) throws {
    guard plan.mode == "phone" else {
      throw runtimeError("Phone runtime only accepts mode=phone.")
    }

    guard plan.audioBed.enabled && plan.safety.requireAudioBed else {
      throw runtimeError("Phone runtime requires an audible audio bed.")
    }

    guard plan.audioBed.volume > 0 else {
      throw runtimeError("Phone runtime audio bed volume must be audible.")
    }

    guard
      plan.backgroundAudio.option == "none" ||
      plan.backgroundAudio.option == "white_noise" ||
      plan.backgroundAudio.option == "binaural_beats"
    else {
      throw runtimeError("Phone runtime background audio option is invalid.")
    }

    guard !(plan.backgroundAudio.option == "none" && plan.backgroundAudio.enabled) else {
      throw runtimeError("Background audio cannot be enabled when option is none.")
    }

    guard !(plan.backgroundAudio.option != "none" && !plan.backgroundAudio.enabled) else {
      throw runtimeError("Background audio must be enabled for the selected option.")
    }

    guard plan.backgroundAudio.volume >= 0 && plan.backgroundAudio.volume <= 1 else {
      throw runtimeError("Background audio volume must be between 0 and 1.")
    }

    guard !plan.cue.assetId.isEmpty && !plan.cue.resourceName.isEmpty else {
      throw runtimeError("Phone runtime requires a bundled cue asset.")
    }

    guard plan.cue.resourceExtension == "mp3" || plan.cue.resourceExtension == "wav" else {
      throw runtimeError("Phone runtime cue resource extension is invalid.")
    }

    guard plan.cue.durationSeconds > 0 && plan.cue.durationSeconds <= 3 else {
      throw runtimeError("Phone runtime cue duration must be 3 seconds or shorter.")
    }

    guard plan.timing.cueIntervalRangeSeconds.count == 2 else {
      throw runtimeError("Phone runtime requires a cue interval range.")
    }

    if plan.alarm.enabled {
      guard let fireAt = plan.alarm.fireAt, parseDate(fireAt) != nil else {
        throw runtimeError("Alarm requires a valid fire time.")
      }

      guard plan.alarm.volume > 0 && plan.alarm.volume <= 1 else {
        throw runtimeError("Alarm volume must be between 0 and 1.")
      }

      if plan.alarm.autoShutoff {
        guard let ringDurationSeconds = plan.alarm.ringDurationSeconds,
          ringDurationSeconds > 0 else {
          throw runtimeError("Alarm auto shutoff requires a positive ring duration.")
        }
      }
    }
  }

  private func configureAudioSession() throws {
    let session = AVAudioSession.sharedInstance()
    var lastError: Error?

    for candidate in audioSessionOptionCandidates() {
      do {
        try session.setCategory(.playback, mode: .default, options: candidate.options)
        try session.setActive(true)
        var payload = audioSessionPayload()
        payload["configurationAttempt"] = candidate.name
        appendEvent("audio_session_configured", payload: payload)
        return
      } catch {
        lastError = error
      }
    }

    throw lastError ?? runtimeError("Could not configure AVAudioSession.")
  }

  private func audioSessionOptionCandidates() -> [(name: String, options: AVAudioSession.CategoryOptions)] {
    [
      ("playback_mix", [.mixWithOthers]),
      ("playback_plain", [])
    ]
  }

  private func startAudioBed(plan: PhoneRuntimePlan) throws {
    let engine = ensureAudioEngine()
    let format = engine.mainMixerNode.outputFormat(forBus: 0)
    let buffer = makeSineBuffer(
      format: format,
      frequency: 220,
      durationSeconds: 6,
      amplitude: 0.18
    )

    audioBedPlayer?.stop()
    audioBedPlayer?.volume = Float(clamp(plan.audioBed.volume, min: 0, max: 1))
    audioBedPlayer?.scheduleBuffer(buffer, at: nil, options: .loops)

    if !engine.isRunning {
      try engine.start()
    }

    audioBedPlayer?.play()
    appendEvent("audio_bed_started", payload: [
      "assetId": plan.audioBed.assetId,
      "volume": plan.audioBed.volume,
      "audible": true,
      "toneHz": 220
    ])
  }

  private func startBackgroundAudio(plan: PhoneRuntimePlan) throws {
    guard plan.backgroundAudio.enabled else {
      backgroundAudioPlayer?.stop()
      return
    }

    let engine = ensureAudioEngine()
    let format = engine.mainMixerNode.outputFormat(forBus: 0)
    let buffer: AVAudioPCMBuffer

    switch plan.backgroundAudio.option {
    case "white_noise":
      buffer = makeWhiteNoiseBuffer(
        format: format,
        durationSeconds: 4,
        amplitude: 0.22
      )
    case "binaural_beats":
      buffer = makeBinauralBuffer(
        format: format,
        carrierFrequency: plan.backgroundAudio.binauralCarrierFrequencyHz,
        beatFrequency: plan.backgroundAudio.binauralBeatFrequencyHz,
        durationSeconds: 8,
        amplitude: 0.18
      )
    default:
      throw runtimeError("Unsupported background audio option.")
    }

    backgroundAudioPlayer?.stop()
    backgroundAudioPlayer?.volume = Float(clamp(plan.backgroundAudio.volume, min: 0, max: 1))
    backgroundAudioPlayer?.scheduleBuffer(buffer, at: nil, options: .loops)

    if !engine.isRunning {
      try engine.start()
    }

    backgroundAudioPlayer?.play()
    appendEvent("background_audio_started", payload: [
      "option": plan.backgroundAudio.option,
      "volume": plan.backgroundAudio.volume,
      "binauralCarrierFrequencyHz": plan.backgroundAudio.binauralCarrierFrequencyHz,
      "binauralBeatFrequencyHz": plan.backgroundAudio.binauralBeatFrequencyHz
    ])
  }

  private func recoverAudioBedIfNeeded(
    reason: String,
    stopOnFailure: Bool = true
  ) -> Bool {
    guard let plan = activePlan else {
      return false
    }

    do {
      try configureAudioSession()
      if state?.alarmRinging == true {
        try startAlarmPlayback(plan: plan)
        audioInterruptionActive = false
        audioRecoveryGraceUntil = nil
        nextAudioRecoveryAttemptAt = nil
        appendEvent("decision_tick", payload: [
          "reason": "alarm_audio_recovered",
          "recoveryReason": reason
        ])
        return true
      }

      try startAudioBed(plan: plan)
      try startBackgroundAudio(plan: plan)
      audioInterruptionActive = false
      audioRecoveryGraceUntil = nil
      nextAudioRecoveryAttemptAt = nil
      appendEvent("decision_tick", payload: [
        "reason": "audio_bed_recovered",
        "recoveryReason": reason
      ])
      return true
    } catch {
      appendEvent("audio_bed_failed", payload: [
        "reason": reason,
        "error": error.localizedDescription,
        "willRetry": !stopOnFailure
      ])
      if stopOnFailure {
        appendEvent("runtime_error", payload: [
          "operation": "recover_audio_bed",
          "error": error.localizedDescription
        ])
        stopRuntime(reason: "error", errorMessage: error.localizedDescription, logEvent: true)
      }
      return false
    }
  }

  private func startMotionSummaries(plan: PhoneRuntimePlan) throws {
    guard plan.movement.enabled else {
      throw runtimeError("Phone runtime requires movement summaries.")
    }

    guard motionManager.isAccelerometerAvailable else {
      throw runtimeError("Accelerometer is unavailable.")
    }

    motionSampleCount = 0
    motionMagnitudeSum = 0
    motionMagnitudeMax = 0
    lastMotionSummaryAt = Date()
    motionManager.accelerometerUpdateInterval = 0.2
    motionManager.startAccelerometerUpdates(to: motionQueue) { [weak self] data, error in
      guard let self else {
        return
      }

      if let error {
        self.logEvent("runtime_error", payload: [
          "operation": "accelerometer_update",
          "error": error.localizedDescription
        ])
        return
      }

      guard let acceleration = data?.acceleration else {
        return
      }

      let magnitude = sqrt(
        acceleration.x * acceleration.x +
          acceleration.y * acceleration.y +
          acceleration.z * acceleration.z
      )

      self.queue.async {
        self.motionSampleCount += 1
        self.motionMagnitudeSum += magnitude
        self.motionMagnitudeMax = max(self.motionMagnitudeMax, magnitude)
      }
    }

    motionSummaryTimer?.cancel()
    motionSummaryTimer = makeTimer(
      after: max(1, plan.movement.summaryIntervalSeconds),
      repeating: max(1, plan.movement.summaryIntervalSeconds)
    ) { [weak self] in
      self?.appendMotionSummary()
    }

    appendEvent("motion_started", payload: [
      "source": "phone_accelerometer",
      "updateInterval": motionManager.accelerometerUpdateInterval,
      "summaryIntervalSeconds": plan.movement.summaryIntervalSeconds
    ])
  }

  private func appendMotionSummary() {
    guard let plan = activePlan, var state else {
      return
    }

    let now = Date()
    let sampleCount = motionSampleCount
    let mean = sampleCount > 0 ? motionMagnitudeSum / Double(sampleCount) : 0
    let maxMagnitude = motionMagnitudeMax
    let lastSummaryAt = lastMotionSummaryAt ?? now
    let elapsed = now.timeIntervalSince(lastSummaryAt)
    let intensity = movementIntensity(mean: mean, max: maxMagnitude, sampleCount: sampleCount)

    if intensity == "still" || intensity == "light" {
      state.stableLowMovementSeconds += elapsed
    } else {
      state.stableLowMovementSeconds = 0
    }

    if intensity == "large" {
      startMovementPause(
        state: &state,
        reason: "movement",
        now: now,
        durationSeconds: plan.movement.stableLowMovementRequiredSeconds,
        roughMovementIntensity: intensity
      )
    }

    handleCueAssociatedMovementIfNeeded(
      state: &state,
      now: now,
      roughMovementIntensity: intensity
    )

    state.latestMovementIntensity = intensity
    state.latestMotionSummaryAt = formatDate(now)
    self.state = state

    appendEvent("motion_summary", payload: [
      "sampleCount": sampleCount,
      "meanAccelerationMagnitude": mean,
      "maxAccelerationMagnitude": maxMagnitude,
      "roughMovementIntensity": intensity,
      "movementIntensity": movementIntensityScore(intensity),
      "stableLowMovementSeconds": state.stableLowMovementSeconds,
      "largeMovementThreshold": plan.movement.largeMovementThreshold,
      "orientation": orientationString(UIDevice.current.orientation),
      "updateInterval": motionManager.accelerometerUpdateInterval,
      "backgroundState": currentAppState(),
      "timeSinceLastSummary": elapsed
    ])

    motionSampleCount = 0
    motionMagnitudeSum = 0
    motionMagnitudeMax = 0
    lastMotionSummaryAt = now
    persistRuntimeSnapshot()
  }

  private func handleCueAssociatedMovementIfNeeded(
    state: inout PhoneRuntimeState,
    now: Date,
    roughMovementIntensity: String
  ) {
    guard
      roughMovementIntensity != "still",
      let plan = activePlan,
      let lastCueAt = state.lastCueAt,
      let lastCueDate = parseDate(lastCueAt)
    else {
      return
    }

    let secondsAfterCue = now.timeIntervalSince(lastCueDate)

    guard secondsAfterCue >= 0,
      secondsAfterCue <= plan.movement.cueAssociatedMovementWindowSeconds
    else {
      return
    }

    let movementAt = formatDate(now)

    guard lastCueAssociatedMovementAt != movementAt else {
      return
    }

    lastCueAssociatedMovementAt = movementAt
    let pauseUntil = now.addingTimeInterval(plan.movement.cueAssociatedMovementPauseSeconds)
    state.cueAssociatedMovementPauseUntil = formatDate(pauseUntil)
    appendEvent("cue_associated_movement", payload: [
      "lastCueAt": lastCueAt,
      "movementAt": movementAt,
      "secondsAfterCue": secondsAfterCue,
      "roughMovementIntensity": roughMovementIntensity,
      "pauseUntil": formatDate(pauseUntil)
    ])
    appendEvent("movement_pause_started", payload: [
      "reason": "cue_associated_movement",
      "roughMovementIntensity": roughMovementIntensity,
      "pauseUntil": formatDate(pauseUntil)
    ])
  }

  private func startMovementPause(
    state: inout PhoneRuntimeState,
    reason: String,
    now: Date,
    durationSeconds: Double,
    roughMovementIntensity: String
  ) {
    let pauseUntil = now.addingTimeInterval(durationSeconds)
    let pauseUntilString = formatDate(pauseUntil)
    let currentPauseUntil = state.movementPauseUntil.flatMap(parseDate)

    if currentPauseUntil == nil || currentPauseUntil! < pauseUntil {
      state.movementPauseUntil = pauseUntilString
      appendEvent("movement_pause_started", payload: [
        "reason": reason,
        "roughMovementIntensity": roughMovementIntensity,
        "pauseUntil": pauseUntilString
      ])
    }
  }

  private func scheduleDecisionLoop() {
    decisionTimer?.cancel()
    decisionTimer = makeTimer(after: 5, repeating: 5) { [weak self] in
      self?.decisionTick()
    }
  }

  private func scheduleAlarmIfNeeded(plan: PhoneRuntimePlan) {
    alarmTimer?.cancel()
    alarmTimer = nil

    guard plan.alarm.enabled, let fireAtString = plan.alarm.fireAt,
      let fireAt = parseDate(fireAtString)
    else {
      return
    }

    if var state {
      state.alarmFireAt = fireAtString
      self.state = state
    }

    let delay = fireAt.timeIntervalSince(Date())

    appendEvent("alarm_scheduled", payload: [
      "fireAt": fireAtString,
      "autoShutoff": plan.alarm.autoShutoff,
      "ringDurationSeconds": plan.alarm.ringDurationSeconds ?? 0,
      "secondsUntilAlarm": max(0, delay)
    ])

    if delay <= 0 {
      startAlarm(plan: plan, fireAt: fireAt)
      return
    }

    alarmTimer = makeTimer(after: delay) { [weak self] in
      self?.startAlarm(plan: plan, fireAt: fireAt)
    }
  }

  private func startAlarmIfDue(plan: PhoneRuntimePlan, now: Date) -> Bool {
    guard plan.alarm.enabled, let fireAt = plan.alarm.fireAt.flatMap(parseDate) else {
      return false
    }

    if state?.alarmRinging == true {
      return true
    }

    guard now >= fireAt else {
      return false
    }

    startAlarm(plan: plan, fireAt: fireAt)
    return true
  }

  private func startAlarm(plan: PhoneRuntimePlan, fireAt: Date) {
    guard var state else {
      return
    }

    if state.alarmRinging {
      return
    }

    decisionTimer?.cancel()
    decisionTimer = nil
    motionSummaryTimer?.cancel()
    motionSummaryTimer = nil
    alarmTimer?.cancel()
    alarmTimer = nil

    if motionManager.isAccelerometerActive {
      appendMotionSummary()
      motionManager.stopAccelerometerUpdates()
    }

    audioBedPlayer?.stop()
    backgroundAudioPlayer?.stop()
    cuePlayer?.stop()

    let now = Date()
    state.alarmRinging = true
    state.alarmFireAt = plan.alarm.fireAt ?? formatDate(fireAt)
    state.alarmFiredAt = formatDate(now)
    state.latestDecisionReason = "alarm_ringing"
    self.state = state

    do {
      try startAlarmPlayback(plan: plan)
      appendEvent("alarm_started", payload: [
        "fireAt": plan.alarm.fireAt ?? formatDate(fireAt),
        "actualStartedAt": formatDate(now),
        "autoShutoff": plan.alarm.autoShutoff,
        "ringDurationSeconds": plan.alarm.ringDurationSeconds ?? 0,
        "volume": plan.alarm.volume,
        "cueingStopped": true
      ])

      if plan.alarm.autoShutoff {
        let ringDurationSeconds = max(1, plan.alarm.ringDurationSeconds ?? 300)

        alarmStopTimer?.cancel()
        alarmStopTimer = makeTimer(after: ringDurationSeconds) { [weak self] in
          self?.stopRuntime(
            reason: "alarm_auto_shutoff",
            errorMessage: nil,
            logEvent: true
          )
        }
      }

      persistRuntimeSnapshot()
    } catch {
      self.state?.latestRuntimeError = error.localizedDescription
      appendEvent("runtime_error", payload: [
        "operation": "start_alarm",
        "error": error.localizedDescription
      ])
      stopRuntime(reason: "error", errorMessage: error.localizedDescription, logEvent: true)
    }
  }

  private func startAlarmPlayback(plan: PhoneRuntimePlan) throws {
    let engine = ensureAudioEngine()
    let format = engine.mainMixerNode.outputFormat(forBus: 0)
    let buffer = makeAlarmBuffer(format: format, durationSeconds: 1.2)

    alarmPlayer?.stop()
    alarmPlayer?.volume = Float(clamp(plan.alarm.volume, min: 0, max: 1))
    alarmPlayer?.scheduleBuffer(buffer, at: nil, options: .loops)

    if !engine.isRunning {
      try engine.start()
    }

    alarmPlayer?.play()
  }

  private func decisionTick() {
    guard let plan = activePlan, var state else {
      return
    }

    let now = Date()

    if startAlarmIfDue(plan: plan, now: now) {
      return
    }

    if let stopAt = plan.safety.stopAt.flatMap(parseDate), now >= stopAt {
      stopRuntime(reason: "completed", errorMessage: nil, logEvent: true)
      return
    }

    if !isAudioBedRunning(),
      handleStoppedAudioBedDuringDecision(state: &state, now: now) {
      return
    }

    let reason = evaluateDecision(plan: plan, state: &state, now: now)
    state.latestDecisionReason = reason
    self.state = state

    appendEvent("decision_tick", payload: [
      "reason": reason,
      "cueCount": state.cueCount,
      "cuesInBlock": state.cuesInBlock,
      "stableLowMovementSeconds": state.stableLowMovementSeconds,
      "nextCueCandidateAt": state.nextCueCandidateAt ?? "",
      "appState": currentAppState()
    ])
    persistRuntimeSnapshot()
  }

  private func handleStoppedAudioBedDuringDecision(
    state: inout PhoneRuntimeState,
    now: Date
  ) -> Bool {
    if audioInterruptionActive {
      if shouldAttemptAudioRecovery(now: now),
        recoverAudioBedIfNeeded(reason: "active_interruption_retry", stopOnFailure: false) {
        state.latestDecisionReason = "audio_bed_recovered"
        return false
      }

      let nextCheckAt = nextAudioRecoveryAttemptAt ?? now.addingTimeInterval(
        activeInterruptionRecoveryRetrySeconds
      )
      state.latestDecisionReason = "audio_interruption"
      self.state = state
      appendCueSuppressed(reason: "audio_interruption", nextCheckAt: nextCheckAt)
      appendAudioRecoveryDecisionTick(
        reason: "audio_interruption",
        state: state,
        nextCheckAt: nextCheckAt
      )
      persistRuntimeSnapshot()
      return true
    }

    if let graceUntil = audioRecoveryGraceUntil, now < graceUntil {
      if shouldAttemptAudioRecovery(now: now),
        recoverAudioBedIfNeeded(reason: "audio_recovery_grace", stopOnFailure: false) {
        state.latestDecisionReason = "audio_bed_recovered"
        return false
      }

      let nextCheckAt = nextAudioRecoveryAttemptAt ?? graceUntil
      state.latestDecisionReason = "audio_recovery_pending"
      self.state = state
      appendCueSuppressed(reason: "audio_recovery_pending", nextCheckAt: nextCheckAt)
      appendAudioRecoveryDecisionTick(
        reason: "audio_recovery_pending",
        state: state,
        nextCheckAt: nextCheckAt
      )
      persistRuntimeSnapshot()
      return true
    }

    if recoverAudioBedIfNeeded(reason: "decision_tick_audio_bed_stopped", stopOnFailure: false) {
      state.latestDecisionReason = "audio_bed_recovered"
      return false
    }

    appendEvent("runtime_error", payload: [
      "operation": "decision_tick_audio_bed",
      "error": "Audio bed stopped."
    ])
    stopRuntime(reason: "error", errorMessage: "Audio bed stopped.", logEvent: true)
    return true
  }

  private func shouldAttemptAudioRecovery(now: Date) -> Bool {
    if let nextAudioRecoveryAttemptAt, now < nextAudioRecoveryAttemptAt {
      return false
    }

    nextAudioRecoveryAttemptAt = now.addingTimeInterval(activeInterruptionRecoveryRetrySeconds)
    return true
  }

  private func appendAudioRecoveryDecisionTick(
    reason: String,
    state: PhoneRuntimeState,
    nextCheckAt: Date?
  ) {
    appendEvent("decision_tick", payload: [
      "reason": reason,
      "cueCount": state.cueCount,
      "cuesInBlock": state.cuesInBlock,
      "stableLowMovementSeconds": state.stableLowMovementSeconds,
      "nextCueCandidateAt": state.nextCueCandidateAt ?? "",
      "nextCheckAt": nextCheckAt.map(formatDate) ?? "",
      "audioInterruptionActive": audioInterruptionActive,
      "audioRecoveryGraceUntil": audioRecoveryGraceUntil.map(formatDate) ?? "",
      "appState": currentAppState()
    ])
  }

  private func evaluateDecision(
    plan: PhoneRuntimePlan,
    state: inout PhoneRuntimeState,
    now: Date
  ) -> String {
    clearExpiredPauses(state: &state, now: now)

    guard let earliestCueAt = parseDate(plan.timing.earliestCueAt),
      let latestCueAt = parseDate(plan.timing.latestCueAt)
    else {
      appendEvent("runtime_error", payload: [
        "operation": "parse_cue_window",
        "error": "invalid cue window"
      ])
      return "runtime_error"
    }

    if now < earliestCueAt {
      appendCueSuppressed(reason: "before_cue_window", nextCheckAt: earliestCueAt)
      return "before_cue_window"
    }

    if now > latestCueAt {
      appendCueSuppressed(reason: "outside_cue_window", nextCheckAt: nil)
      return "outside_cue_window"
    }

    let remGate = predictedRemGate(plan: plan, now: now)

    if !remGate.allowed {
      appendCueSuppressed(
        reason: "outside_predicted_rem_window",
        nextCheckAt: remGate.nextCheckAt
      )
      return "outside_predicted_rem_window"
    }

    if let pauseUntil = state.movementPauseUntil.flatMap(parseDate), now < pauseUntil {
      appendCueSuppressed(reason: "movement", nextCheckAt: pauseUntil)
      return "movement"
    }

    if let pauseUntil = state.cueAssociatedMovementPauseUntil.flatMap(parseDate),
      now < pauseUntil {
      appendCueSuppressed(reason: "cue_associated_movement", nextCheckAt: pauseUntil)
      return "cue_associated_movement"
    }

    if state.stableLowMovementSeconds < plan.movement.stableLowMovementRequiredSeconds {
      appendCueSuppressed(
        reason: "movement",
        nextCheckAt: now.addingTimeInterval(
          plan.movement.stableLowMovementRequiredSeconds - state.stableLowMovementSeconds
        )
      )
      return "movement"
    }

    if let lastCueAt = state.lastCueAt.flatMap(parseDate) {
      let nextAllowedCueAt = lastCueAt.addingTimeInterval(plan.pauses.minimumSecondsSinceLastCue)

      if now < nextAllowedCueAt {
        appendCueSuppressed(reason: "recent_cue", nextCheckAt: nextAllowedCueAt)
        return "recent_cue"
      }
    }

    if let budgetReason = applyBudgetGate(plan: plan, state: &state, now: now) {
      return budgetReason
    }

    if state.nextCueCandidateAt == nil {
      scheduleNextCueCandidate(plan: plan, state: &state, after: now)
      appendCueSuppressed(reason: "waiting_for_next_candidate", nextCheckAt: state.nextCueCandidateAt.flatMap(parseDate))
      return "waiting_for_next_candidate"
    }

    if let candidateAt = state.nextCueCandidateAt.flatMap(parseDate), now < candidateAt {
      appendCueSuppressed(reason: "waiting_for_next_candidate", nextCheckAt: candidateAt)
      return "waiting_for_next_candidate"
    }

    appendEvent("cue_candidate", payload: [
      "candidateAt": state.nextCueCandidateAt ?? formatDate(now),
      "windowMatch": remGate.windowMatch,
      "cueCount": state.cueCount,
      "cuesInBlock": state.cuesInBlock
    ])
    playCue(plan: plan, state: &state, plannedAt: state.nextCueCandidateAt.flatMap(parseDate) ?? now)
    scheduleNextCueCandidate(plan: plan, state: &state, after: now)
    return "cue_played"
  }

  private func clearExpiredPauses(state: inout PhoneRuntimeState, now: Date) {
    if let pauseUntil = state.movementPauseUntil.flatMap(parseDate), now >= pauseUntil {
      appendEvent("movement_pause_ended", payload: [
        "reason": "movement",
        "pauseEndedAt": formatDate(now)
      ])
      state.movementPauseUntil = nil
    }

    if let pauseUntil = state.cueAssociatedMovementPauseUntil.flatMap(parseDate),
      now >= pauseUntil {
      appendEvent("movement_pause_ended", payload: [
        "reason": "cue_associated_movement",
        "pauseEndedAt": formatDate(now)
      ])
      state.cueAssociatedMovementPauseUntil = nil
    }
  }

  private func applyBudgetGate(
    plan: PhoneRuntimePlan,
    state: inout PhoneRuntimeState,
    now: Date
  ) -> String? {
    if state.cueCount >= plan.budget.maxCuesTonight {
      appendEvent("budget_exhausted", payload: [
        "reason": "nightly_budget_exhausted",
        "cueCount": state.cueCount,
        "maxCuesTonight": plan.budget.maxCuesTonight
      ])
      appendCueSuppressed(reason: "cue_budget_exhausted", nextCheckAt: nil)
      return "cue_budget_exhausted"
    }

    if let blockRestUntil = state.blockRestUntil.flatMap(parseDate) {
      if now < blockRestUntil {
        appendCueSuppressed(reason: "cue_budget_exhausted", nextCheckAt: blockRestUntil)
        return "cue_budget_exhausted"
      }

      state.blockRestUntil = nil
      state.blockStartedAt = nil
      state.cuesInBlock = 0
    }

    let blockStartedAt = state.blockStartedAt.flatMap(parseDate)
    let blockDurationExhausted =
      blockStartedAt.map {
        now.timeIntervalSince($0) >= plan.budget.maxBlockDurationMinutes * 60
      } ?? false

    if state.cuesInBlock >= plan.budget.maxCuesPerBlock || blockDurationExhausted {
      let restUntil = now.addingTimeInterval(plan.budget.minRestBetweenBlocksMinutes * 60)
      state.blockRestUntil = formatDate(restUntil)
      appendEvent("budget_exhausted", payload: [
        "reason": state.cuesInBlock >= plan.budget.maxCuesPerBlock
          ? "block_cue_count_exhausted"
          : "block_duration_exhausted",
        "cuesInBlock": state.cuesInBlock,
        "restUntil": formatDate(restUntil)
      ])
      appendCueSuppressed(reason: "cue_budget_exhausted", nextCheckAt: restUntil)
      return "cue_budget_exhausted"
    }

    return nil
  }

  private func scheduleNextCueCandidate(
    plan: PhoneRuntimePlan,
    state: inout PhoneRuntimeState,
    after date: Date
  ) {
    let intervalMin = max(1, plan.timing.cueIntervalRangeSeconds[0])
    let intervalMax = max(intervalMin, plan.timing.cueIntervalRangeSeconds[1])
    let interval = Double.random(in: intervalMin...intervalMax)
    let rawCandidateAt = date.addingTimeInterval(interval)
    let candidateAt = nextCueCandidateDate(
      plan: plan,
      after: date,
      rawCandidateAt: rawCandidateAt
    )

    state.nextCueCandidateAt = formatDate(candidateAt)
    appendEvent("cue_candidate", payload: [
      "candidateAt": formatDate(candidateAt),
      "rawCandidateAt": formatDate(rawCandidateAt),
      "intervalSeconds": interval,
      "windowPolicy": usesHistoricalRemWindows(plan: plan)
        ? "historical_rem_only_no_shoulder"
        : "broad_cue_window",
      "reason": "scheduled_next_candidate"
    ])
  }

  private func appendCueSuppressed(reason: String, nextCheckAt: Date?) {
    appendEvent("cue_suppressed", payload: [
      "reason": reason,
      "nextCheckAt": nextCheckAt.map(formatDate) ?? ""
    ])
  }

  private func playCue(
    plan: PhoneRuntimePlan,
    state: inout PhoneRuntimeState,
    plannedAt: Date
  ) {
    let attemptAt = Date()
    let volume = min(
      plan.cue.capVolume,
      plan.cue.startVolume + plan.cue.rampPerCue * Double(state.cueCount)
    )
    let driftMs = Int(attemptAt.timeIntervalSince(plannedAt) * 1000)
    let cueAsset = "\(plan.cue.resourceName).\(plan.cue.resourceExtension)"

    appendEvent("cue_play_attempted", payload: [
      "cueId": plan.cue.cueId,
      "cueAsset": cueAsset,
      "cueResourceName": plan.cue.resourceName,
      "cueResourceExtension": plan.cue.resourceExtension,
      "plannedCueAt": formatDate(plannedAt),
      "actualCueAttemptAt": formatDate(attemptAt),
      "volume": volume,
      "driftMs": driftMs
    ])

    do {
      guard let url = Bundle.main.url(
        forResource: plan.cue.resourceName,
        withExtension: plan.cue.resourceExtension
      ) else {
        throw runtimeError("Missing bundled cue asset \(cueAsset).")
      }

      let engine = ensureAudioEngine()
      let file = try AVAudioFile(forReading: url)

      cuePlayer?.stop()
      cuePlayer?.volume = Float(clamp(volume, min: 0, max: 1))
      cuePlayer?.scheduleFile(file, at: nil)

      if !engine.isRunning {
        try engine.start()
      }

      cuePlayer?.play()

      if state.blockStartedAt == nil {
        state.blockStartedAt = formatDate(attemptAt)
      }

      state.cueCount += 1
      state.cuesInBlock += 1
      state.lastCueAt = formatDate(attemptAt)

      appendEvent("cue_played", payload: [
        "cueId": plan.cue.cueId,
        "cueAsset": cueAsset,
        "cueResourceName": plan.cue.resourceName,
        "cueResourceExtension": plan.cue.resourceExtension,
        "plannedCueAt": formatDate(plannedAt),
        "actualCueAttemptAt": formatDate(attemptAt),
        "actualCuePlayedAt": formatDate(Date()),
        "durationSeconds": Double(file.length) / file.fileFormat.sampleRate,
        "sampleRate": file.fileFormat.sampleRate,
        "channelCount": file.fileFormat.channelCount,
        "volume": volume,
        "driftMs": driftMs,
        "success": true
      ])
    } catch {
      appendEvent("cue_failed", payload: [
        "cueId": plan.cue.cueId,
        "cueAsset": cueAsset,
        "cueResourceName": plan.cue.resourceName,
        "cueResourceExtension": plan.cue.resourceExtension,
        "plannedCueAt": formatDate(plannedAt),
        "actualCueAttemptAt": formatDate(attemptAt),
        "volume": volume,
        "driftMs": driftMs,
        "success": false,
        "error": error.localizedDescription
      ])
    }
  }

  private func windowMatch(plan: PhoneRuntimePlan, now: Date) -> String {
    for window in plan.timing.predictedRemWindows {
      guard let start = parseDate(window.startAt), let end = parseDate(window.endAt) else {
        continue
      }

      if now >= start && now <= end {
        return window.source
      }
    }

    return "cue_window"
  }

  private func predictedRemGate(
    plan: PhoneRuntimePlan,
    now: Date
  ) -> (allowed: Bool, nextCheckAt: Date?, windowMatch: String) {
    let windows = historicalRemWindows(plan: plan)

    if windows.isEmpty {
      return (true, nil, windowMatch(plan: plan, now: now))
    }

    if windows.contains(where: { now >= $0.start && now <= $0.end }) {
      return (true, nil, "historical_sleep")
    }

    let nextWindow = windows
      .filter { $0.start > now }
      .sorted { $0.start < $1.start }
      .first

    return (false, nextWindow?.start, "outside_predicted_rem_window")
  }

  private func nextCueCandidateDate(
    plan: PhoneRuntimePlan,
    after date: Date,
    rawCandidateAt: Date
  ) -> Date {
    let windows = historicalRemWindows(plan: plan)

    if windows.isEmpty {
      return rawCandidateAt
    }

    if windows.contains(where: { rawCandidateAt >= $0.start && rawCandidateAt <= $0.end }) {
      return rawCandidateAt
    }

    let nextWindowAfterRaw = windows
      .filter { $0.start >= rawCandidateAt }
      .sorted { $0.start < $1.start }
      .first

    if let nextWindow = nextWindowAfterRaw {
      return nextWindow.start
    }

    let nextWindowAfterDate = windows
      .filter { $0.start > date }
      .sorted { $0.start < $1.start }
      .first

    if let nextWindow = nextWindowAfterDate {
      return nextWindow.start
    }

    return rawCandidateAt
  }

  private func historicalRemWindows(plan: PhoneRuntimePlan) -> [(start: Date, end: Date)] {
    plan.timing.predictedRemWindows.compactMap { window in
      guard window.source == "historical_sleep",
        let start = parseDate(window.startAt),
        let end = parseDate(window.endAt),
        end > start
      else {
        return nil
      }

      return (start, end)
    }.sorted { $0.start < $1.start }
  }

  private func usesHistoricalRemWindows(plan: PhoneRuntimePlan) -> Bool {
    !historicalRemWindows(plan: plan).isEmpty
  }

  private func stopRuntime(
    reason: String,
    errorMessage: String?,
    logEvent: Bool
  ) {
    decisionTimer?.cancel()
    decisionTimer = nil
    motionSummaryTimer?.cancel()
    motionSummaryTimer = nil
    batteryTimer?.cancel()
    batteryTimer = nil
    alarmTimer?.cancel()
    alarmTimer = nil
    alarmStopTimer?.cancel()
    alarmStopTimer = nil

    if motionManager.isAccelerometerActive {
      appendMotionSummary()
      motionManager.stopAccelerometerUpdates()
    }

    let wasBackgroundAudioRunning = backgroundAudioPlayer?.isPlaying == true
    let wasAlarmRinging = state?.alarmRinging == true

    audioBedPlayer?.stop()
    backgroundAudioPlayer?.stop()
    cuePlayer?.stop()
    alarmPlayer?.stop()
    audioEngine?.stop()
    audioEngine = nil
    audioBedPlayer = nil
    backgroundAudioPlayer = nil
    cuePlayer = nil
    alarmPlayer = nil

    if logEvent, let plan = activePlan {
      if let errorMessage {
        state?.latestRuntimeError = errorMessage
      }

      if wasBackgroundAudioRunning {
        appendEvent("background_audio_stopped", payload: [
          "reason": reason,
          "option": plan.backgroundAudio.option
        ])
      }

      if wasAlarmRinging {
        appendEvent("alarm_stopped", payload: [
          "reason": reason,
          "stoppedAt": formatDate(Date())
        ])
      }

      appendEvent("runtime_stopped", payload: [
        "reason": reason,
        "stoppedAt": formatDate(Date()),
        "cueCount": state?.cueCount ?? 0,
        "cuesInBlock": state?.cuesInBlock ?? 0,
        "alarmRinging": wasAlarmRinging,
        "alarmFiredAt": state?.alarmFiredAt ?? "",
        "error": errorMessage ?? ""
      ])
      persistLogs(sessionId: plan.sessionId)
    }

    activePlan = nil
    state = nil
    activeLogs = []
    lastCueAssociatedMovementAt = nil
    audioInterruptionActive = false
    audioRecoveryGraceUntil = nil
    nextAudioRecoveryAttemptAt = nil
    clearRuntimeSnapshot()
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }

  private func ensureAudioEngine() -> AVAudioEngine {
    if let audioEngine {
      return audioEngine
    }

    let engine = AVAudioEngine()
    let bedPlayer = AVAudioPlayerNode()
    let backgroundPlayer = AVAudioPlayerNode()
    let cuePlayer = AVAudioPlayerNode()
    let alarmPlayer = AVAudioPlayerNode()

    engine.attach(bedPlayer)
    engine.attach(backgroundPlayer)
    engine.attach(cuePlayer)
    engine.attach(alarmPlayer)
    engine.connect(bedPlayer, to: engine.mainMixerNode, format: nil)
    engine.connect(backgroundPlayer, to: engine.mainMixerNode, format: nil)
    engine.connect(cuePlayer, to: engine.mainMixerNode, format: nil)
    engine.connect(alarmPlayer, to: engine.mainMixerNode, format: nil)

    audioEngine = engine
    audioBedPlayer = bedPlayer
    backgroundAudioPlayer = backgroundPlayer
    self.cuePlayer = cuePlayer
    self.alarmPlayer = alarmPlayer

    return engine
  }

  private func isAudioBedRunning() -> Bool {
    audioEngine?.isRunning == true && audioBedPlayer?.isPlaying == true
  }

  private func isBackgroundAudioRunning() -> Bool {
    audioEngine?.isRunning == true && backgroundAudioPlayer?.isPlaying == true
  }

  private func makeSineBuffer(
    format: AVAudioFormat,
    frequency: Double,
    durationSeconds: Double,
    amplitude: Double
  ) -> AVAudioPCMBuffer {
    let sampleRate = format.sampleRate
    let frameCount = AVAudioFrameCount(sampleRate * durationSeconds)
    let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount)!
    buffer.frameLength = frameCount

    guard let channels = buffer.floatChannelData else {
      return buffer
    }

    for frame in 0..<Int(frameCount) {
      let time = Double(frame) / sampleRate
      let sample = Float(sin(2 * Double.pi * frequency * time) * amplitude)

      for channelIndex in 0..<Int(format.channelCount) {
        channels[channelIndex][frame] = sample
      }
    }

    return buffer
  }

  private func makeWhiteNoiseBuffer(
    format: AVAudioFormat,
    durationSeconds: Double,
    amplitude: Double
  ) -> AVAudioPCMBuffer {
    let sampleRate = format.sampleRate
    let frameCount = AVAudioFrameCount(sampleRate * durationSeconds)
    let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount)!
    buffer.frameLength = frameCount

    guard let channels = buffer.floatChannelData else {
      return buffer
    }

    for frame in 0..<Int(frameCount) {
      for channelIndex in 0..<Int(format.channelCount) {
        channels[channelIndex][frame] = Float.random(in: -1...1) * Float(amplitude)
      }
    }

    return buffer
  }

  private func makeBinauralBuffer(
    format: AVAudioFormat,
    carrierFrequency: Double,
    beatFrequency: Double,
    durationSeconds: Double,
    amplitude: Double
  ) -> AVAudioPCMBuffer {
    let sampleRate = format.sampleRate
    let frameCount = AVAudioFrameCount(sampleRate * durationSeconds)
    let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount)!
    buffer.frameLength = frameCount

    guard let channels = buffer.floatChannelData else {
      return buffer
    }

    let rightFrequency = carrierFrequency + beatFrequency

    for frame in 0..<Int(frameCount) {
      let time = Double(frame) / sampleRate
      let leftSample = Float(sin(2 * Double.pi * carrierFrequency * time) * amplitude)
      let rightSample = Float(sin(2 * Double.pi * rightFrequency * time) * amplitude)

      for channelIndex in 0..<Int(format.channelCount) {
        channels[channelIndex][frame] = channelIndex == 1 ? rightSample : leftSample
      }
    }

    return buffer
  }

  private func makeAlarmBuffer(
    format: AVAudioFormat,
    durationSeconds: Double
  ) -> AVAudioPCMBuffer {
    let sampleRate = format.sampleRate
    let frameCount = AVAudioFrameCount(sampleRate * durationSeconds)
    let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount)!
    buffer.frameLength = frameCount

    guard let channels = buffer.floatChannelData else {
      return buffer
    }

    for frame in 0..<Int(frameCount) {
      let time = Double(frame) / sampleRate
      let pulseTime = time.truncatingRemainder(dividingBy: 0.6)
      let amplitude = pulseTime < 0.28 ? 0.36 : 0
      let frequency = pulseTime < 0.14 ? 880.0 : 660.0
      let sample = Float(sin(2 * Double.pi * frequency * time) * amplitude)

      for channelIndex in 0..<Int(format.channelCount) {
        channels[channelIndex][frame] = sample
      }
    }

    return buffer
  }

  private func makeTimer(
    after seconds: TimeInterval,
    repeating: TimeInterval? = nil,
    handler: @escaping () -> Void
  ) -> DispatchSourceTimer {
    let timer = DispatchSource.makeTimerSource(queue: queue)

    if let repeating {
      timer.schedule(deadline: .now() + seconds, repeating: repeating)
    } else {
      timer.schedule(deadline: .now() + seconds)
    }

    timer.setEventHandler(handler: handler)
    timer.resume()

    return timer
  }

  private func scheduleBatteryTimer() {
    batteryTimer?.cancel()
    batteryTimer = makeTimer(after: 60, repeating: 60) { [weak self] in
      self?.logBatterySummary(reason: "periodic")
    }
  }

  private func observeSystemEvents() {
    let center = NotificationCenter.default

    center.addObserver(
      self,
      selector: #selector(handleAudioInterruption),
      name: AVAudioSession.interruptionNotification,
      object: AVAudioSession.sharedInstance()
    )
    center.addObserver(
      self,
      selector: #selector(handleAudioRouteChange),
      name: AVAudioSession.routeChangeNotification,
      object: AVAudioSession.sharedInstance()
    )
    center.addObserver(
      self,
      selector: #selector(handleBatteryChange),
      name: UIDevice.batteryLevelDidChangeNotification,
      object: nil
    )
    center.addObserver(
      self,
      selector: #selector(handleBatteryChange),
      name: UIDevice.batteryStateDidChangeNotification,
      object: nil
    )
    center.addObserver(
      self,
      selector: #selector(handleLowPowerModeChange),
      name: Notification.Name.NSProcessInfoPowerStateDidChange,
      object: nil
    )
    center.addObserver(
      self,
      selector: #selector(handleThermalStateChange),
      name: ProcessInfo.thermalStateDidChangeNotification,
      object: nil
    )
  }

  @objc private func handleAudioInterruption(_ notification: Notification) {
    let rawType = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
    let type = rawType.flatMap(AVAudioSession.InterruptionType.init(rawValue:))
    let payload: [String: Any] = [
      "rawType": rawType ?? 0,
      "type": type?.description ?? "unknown",
      "options": notification.userInfo?[AVAudioSessionInterruptionOptionKey] ?? 0
    ]

    if type == .began {
      queue.async {
        self.audioInterruptionActive = self.activePlan != nil
        self.audioRecoveryGraceUntil = nil
        self.nextAudioRecoveryAttemptAt = Date().addingTimeInterval(
          self.activeInterruptionRecoveryRetrySeconds
        )
        self.appendEvent("interruption_started", payload: payload)
      }
      return
    }

    queue.async {
      self.audioInterruptionActive = false
      self.audioRecoveryGraceUntil = Date().addingTimeInterval(
        self.postInterruptionRecoveryGraceSeconds
      )
      self.nextAudioRecoveryAttemptAt = Date()
      self.appendEvent("interruption_ended", payload: payload)
      _ = self.recoverAudioBedIfNeeded(reason: "interruption_ended", stopOnFailure: false)
    }
  }

  @objc private func handleAudioRouteChange(_ notification: Notification) {
    let rawReason = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt
    let reason = rawReason.flatMap(AVAudioSession.RouteChangeReason.init(rawValue:))
    var payload = audioRoutePayload()
    payload["reason"] = reason?.description ?? "unknown"
    payload["rawReason"] = rawReason ?? 0

    queue.async {
      self.appendEvent("route_changed", payload: payload)

      guard self.activePlan != nil else {
        return
      }

      self.audioRecoveryGraceUntil = Date().addingTimeInterval(
        self.routeChangeRecoveryGraceSeconds
      )
      self.nextAudioRecoveryAttemptAt = Date().addingTimeInterval(
        self.routeChangeRecoveryDelaySeconds
      )

      let recoveryReason = "route_change_\(reason?.description ?? "unknown")"
      self.queue.asyncAfter(deadline: .now() + self.routeChangeRecoveryDelaySeconds) { [weak self] in
        guard let self, self.activePlan != nil, !self.audioInterruptionActive else {
          return
        }

        guard !self.isAudioBedRunning() else {
          self.audioRecoveryGraceUntil = nil
          self.nextAudioRecoveryAttemptAt = nil
          return
        }

        _ = self.recoverAudioBedIfNeeded(reason: recoveryReason, stopOnFailure: false)
      }
    }
  }

  @objc private func handleBatteryChange() {
    logEvent("battery_summary", payload: batteryPayload(reason: "battery_notification"))
  }

  @objc private func handleLowPowerModeChange() {
    logEvent("battery_summary", payload: batteryPayload(reason: "low_power_mode_change"))
  }

  @objc private func handleThermalStateChange() {
    logEvent("thermal_state_changed", payload: [
      "thermalState": thermalStateString(ProcessInfo.processInfo.thermalState)
    ])
  }

  private func logBatterySummary(reason: String) {
    appendEvent("battery_summary", payload: batteryPayload(reason: reason))
  }

  private func statusPayload() -> [String: Any] {
    guard let plan = activePlan, let state else {
      return [
        "available": true,
        "running": false,
        "audioBedRunning": false,
        "backgroundAudioRunning": false,
        "alarmRinging": false,
        "motionRunning": false,
        "cueCount": 0,
        "cuesInBlock": 0
      ]
    }

    return [
      "available": true,
      "running": true,
      "sessionId": plan.sessionId,
      "audioBedRunning": isAudioBedRunning(),
      "backgroundAudioRunning": isBackgroundAudioRunning(),
      "alarmRinging": state.alarmRinging,
      "alarmFireAt": state.alarmFireAt ?? plan.alarm.fireAt ?? "",
      "motionRunning": motionManager.isAccelerometerActive,
      "cueCount": state.cueCount,
      "cuesInBlock": state.cuesInBlock,
      "lastCueAt": state.lastCueAt ?? "",
      "nextCueCandidateAt": state.nextCueCandidateAt ?? "",
      "latestDecisionReason": state.latestDecisionReason ?? "",
      "latestMovementIntensity": state.latestMovementIntensity ?? "",
      "latestMotionSummaryAt": state.latestMotionSummaryAt ?? "",
      "latestRuntimeError": state.latestRuntimeError ?? ""
    ]
  }

  private func appendEvent(_ eventType: String, payload: [String: Any]) {
    guard let sessionId = activePlan?.sessionId ?? state?.sessionId else {
      return
    }

    let event: [String: Any] = [
      "id": UUID().uuidString,
      "sessionId": sessionId,
      "timestamp": formatDate(Date()),
      "eventType": eventType,
      "payload": sanitizePayload(payload)
    ]

    activeLogs.append(event)
    persistLogs(sessionId: sessionId)
  }

  private func logEvent(_ eventType: String, payload: [String: Any]) {
    queue.async {
      self.appendEvent(eventType, payload: payload)
    }
  }

  private func persistLogs(sessionId: String) {
    do {
      let data = try JSONSerialization.data(withJSONObject: activeLogs, options: [.prettyPrinted])
      try ensureStorageDirectory()
      try data.write(to: logsURL(sessionId: sessionId), options: [.atomic])
    } catch {
      NSLog("LucidCue phone runtime log write failed: \(error.localizedDescription)")
    }
  }

  private func loadLogs(sessionId: String) -> [[String: Any]] {
    guard
      let data = try? Data(contentsOf: logsURL(sessionId: sessionId)),
      let decoded = try? JSONSerialization.jsonObject(with: data),
      let logs = decoded as? [[String: Any]]
    else {
      return []
    }

    return logs
  }

  private func persistRuntimeSnapshot() {
    guard let activePlan, let state else {
      return
    }

    if let data = try? JSONEncoder().encode(RuntimeSnapshot(plan: activePlan, state: state)) {
      UserDefaults.standard.set(data, forKey: "lucidcue_phone_runtime_active_snapshot")
    }
  }

  private func clearRuntimeSnapshot() {
    UserDefaults.standard.removeObject(forKey: "lucidcue_phone_runtime_active_snapshot")
  }

  private func restoreRuntimeIfNeeded() {
    guard
      let data = UserDefaults.standard.data(forKey: "lucidcue_phone_runtime_active_snapshot"),
      let snapshot = try? JSONDecoder().decode(RuntimeSnapshot.self, from: data)
    else {
      return
    }

    activePlan = snapshot.plan
    state = snapshot.state
    activeLogs = loadLogs(sessionId: snapshot.plan.sessionId)
    appendEvent("decision_tick", payload: [
      "reason": "runtime_restored",
      "sessionId": snapshot.plan.sessionId
    ])

    queue.async {
      do {
        try self.configureAudioSession()
        if snapshot.state.alarmRinging ||
          self.startAlarmIfDue(plan: snapshot.plan, now: Date()) {
          if snapshot.state.alarmRinging {
            self.state?.alarmRinging = false
            self.startAlarm(
              plan: snapshot.plan,
              fireAt: snapshot.plan.alarm.fireAt.flatMap(self.parseDate) ?? Date()
            )
          }
        } else {
          try self.startAudioBed(plan: snapshot.plan)
          try self.startBackgroundAudio(plan: snapshot.plan)
          try self.startMotionSummaries(plan: snapshot.plan)
          self.scheduleDecisionLoop()
          self.scheduleBatteryTimer()
          self.scheduleAlarmIfNeeded(plan: snapshot.plan)
        }
      } catch {
        self.appendEvent("runtime_error", payload: [
          "operation": "restore_runtime",
          "error": error.localizedDescription
        ])
        self.stopRuntime(reason: "error", errorMessage: error.localizedDescription, logEvent: true)
      }
    }
  }

  private func logsURL(sessionId: String) -> URL {
    storageDirectory().appendingPathComponent("\(sessionId)-events.json")
  }

  private func storageDirectory() -> URL {
    FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("LucidCuePhoneRuntime", isDirectory: true)
  }

  private func ensureStorageDirectory() throws {
    try FileManager.default.createDirectory(
      at: storageDirectory(),
      withIntermediateDirectories: true
    )
  }

  private func sanitizePayload(_ value: Any) -> Any {
    if JSONSerialization.isValidJSONObject(["value": value]) {
      return value
    }

    if let error = value as? Error {
      return error.localizedDescription
    }

    return String(describing: value)
  }

  private func runtimeError(_ message: String) -> NSError {
    NSError(
      domain: "LucidCuePhoneRuntime",
      code: -1,
      userInfo: [NSLocalizedDescriptionKey: message]
    )
  }

  private func formatDate(_ date: Date) -> String {
    isoFormatter.string(from: date)
  }

  private func parseDate(_ value: String) -> Date? {
    isoFormatter.date(from: value) ?? ISO8601DateFormatter().date(from: value)
  }

  private func movementIntensity(mean: Double, max: Double, sampleCount: Int) -> String {
    if sampleCount == 0 {
      return "still"
    }

    if max >= 1.45 {
      return "large"
    }

    if max >= 1.18 {
      return "moderate"
    }

    if max >= 1.06 || abs(mean - 1.0) >= 0.04 {
      return "light"
    }

    return "still"
  }

  private func movementIntensityScore(_ intensity: String) -> Double {
    switch intensity {
    case "large":
      return 1
    case "moderate":
      return 0.66
    case "light":
      return 0.33
    default:
      return 0
    }
  }

  private func clamp(_ value: Double, min: Double, max: Double) -> Double {
    Swift.min(max, Swift.max(min, value))
  }

  private func batteryPayload(reason: String) -> [String: Any] {
    [
      "reason": reason,
      "batteryLevel": UIDevice.current.batteryLevel,
      "batteryState": batteryStateString(UIDevice.current.batteryState),
      "lowPowerMode": ProcessInfo.processInfo.isLowPowerModeEnabled,
      "thermalState": thermalStateString(ProcessInfo.processInfo.thermalState),
      "appState": currentAppState()
    ]
  }

  private func audioSessionPayload() -> [String: Any] {
    var payload = audioRoutePayload()
    let session = AVAudioSession.sharedInstance()

    payload["category"] = session.category.rawValue
    payload["mode"] = session.mode.rawValue
    payload["options"] = audioOptionsPayload(session.categoryOptions)
    payload["sampleRate"] = session.sampleRate
    payload["isOtherAudioPlaying"] = session.isOtherAudioPlaying

    return payload
  }

  private func audioRoutePayload() -> [String: Any] {
    let route = AVAudioSession.sharedInstance().currentRoute

    return [
      "inputs": route.inputs.map { port in
        [
          "portName": port.portName,
          "portType": port.portType.rawValue,
          "uid": port.uid
        ]
      },
      "outputs": route.outputs.map { port in
        [
          "portName": port.portName,
          "portType": port.portType.rawValue,
          "uid": port.uid
        ]
      }
    ]
  }

  private func audioOptionsPayload(_ options: AVAudioSession.CategoryOptions) -> [String] {
    var values: [String] = []

    if options.contains(.mixWithOthers) {
      values.append("mixWithOthers")
    }

    if options.contains(.duckOthers) {
      values.append("duckOthers")
    }

    if options.contains(.allowBluetooth) {
      values.append("allowBluetooth")
    }

    if options.contains(.allowAirPlay) {
      values.append("allowAirPlay")
    }

    if options.contains(.defaultToSpeaker) {
      values.append("defaultToSpeaker")
    }

    return values
  }

  private func currentAppState() -> String {
    switch UIApplication.shared.applicationState {
    case .active:
      return "active"
    case .background:
      return "background"
    case .inactive:
      return "inactive"
    @unknown default:
      return "unknown"
    }
  }

  private func orientationString(_ orientation: UIDeviceOrientation) -> String {
    switch orientation {
    case .portrait:
      return "portrait"
    case .portraitUpsideDown:
      return "portrait_upside_down"
    case .landscapeLeft:
      return "landscape_left"
    case .landscapeRight:
      return "landscape_right"
    case .faceUp:
      return "face_up"
    case .faceDown:
      return "face_down"
    case .unknown:
      return "unknown"
    @unknown default:
      return "unknown"
    }
  }

  private func batteryStateString(_ state: UIDevice.BatteryState) -> String {
    switch state {
    case .unknown:
      return "unknown"
    case .unplugged:
      return "unplugged"
    case .charging:
      return "charging"
    case .full:
      return "full"
    @unknown default:
      return "unknown"
    }
  }

  private func thermalStateString(_ state: ProcessInfo.ThermalState) -> String {
    switch state {
    case .nominal:
      return "nominal"
    case .fair:
      return "fair"
    case .serious:
      return "serious"
    case .critical:
      return "critical"
    @unknown default:
      return "unknown"
    }
  }
}

private extension AVAudioSession.InterruptionType {
  var description: String {
    switch self {
    case .began:
      return "began"
    case .ended:
      return "ended"
    @unknown default:
      return "unknown"
    }
  }
}

private extension AVAudioSession.RouteChangeReason {
  var description: String {
    switch self {
    case .unknown:
      return "unknown"
    case .newDeviceAvailable:
      return "new_device_available"
    case .oldDeviceUnavailable:
      return "old_device_unavailable"
    case .categoryChange:
      return "category_change"
    case .override:
      return "override"
    case .wakeFromSleep:
      return "wake_from_sleep"
    case .noSuitableRouteForCategory:
      return "no_suitable_route_for_category"
    case .routeConfigurationChange:
      return "route_configuration_change"
    @unknown default:
      return "unknown"
    }
  }
}
