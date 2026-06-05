import AVFoundation
import CoreMotion
import React
import UIKit
import UserNotifications

struct FeasibilityOptions: Codable {
  let sessionId: String
  let testName: String
  let cueAfterSeconds: TimeInterval
  let testDurationSeconds: TimeInterval
  let playAudioBed: Bool
  let audioBedVolume: Double
  let enableMotionLogging: Bool
  let enableDebugMicFeatures: Bool
  let enableNotificationFallback: Bool
  let enableKitchenSinkAudioTest: Bool?
}

struct FeasibilitySession: Codable {
  let options: FeasibilityOptions
  let startedAt: String
  let plannedCueAt: String
  let endsAt: String
}

private struct AudioSegment {
  let key: String
  let resourceName: String
  let fileName: String
  let frequencyHz: Double
}

@objc(LucidTLROvernightFeasibility)
class LucidTLROvernightFeasibility: NSObject, UNUserNotificationCenterDelegate {
  private let queue = DispatchQueue(label: "com.lucidtlr.feasibility")
  private let isoFormatter = ISO8601DateFormatter()
  private var logs: [[String: Any]] = []
  private var activeSession: FeasibilitySession?
  private var cueTimer: DispatchSourceTimer?
  private var stopTimer: DispatchSourceTimer?
  private var batteryTimer: DispatchSourceTimer?
  private var motionSummaryTimer: DispatchSourceTimer?
  private var micSummaryTimer: DispatchSourceTimer?
  private var audioModulationTimers: [DispatchSourceTimer] = []
  private var audioEngine: AVAudioEngine?
  private var audioBedPlayer: AVAudioPlayerNode?
  private var cuePlayer: AVAudioPlayerNode?
  private let motionManager = CMMotionManager()
  private let motionQueue = OperationQueue()
  private var motionSampleCount = 0
  private var motionMagnitudeSum = 0.0
  private var motionMagnitudeMax = 0.0
  private var lastMotionSummaryAt: Date?
  private var micSampleCount = 0
  private var micSquaresSum = 0.0
  private var micPeak = 0.0
  private var notificationIdentifier: String?

  override init() {
    isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    super.init()
    logs = loadLogsFromDisk()
    UIDevice.current.isBatteryMonitoringEnabled = true
    UIDevice.current.beginGeneratingDeviceOrientationNotifications()
    UNUserNotificationCenter.current().delegate = self
    observeSystemEvents()
    restoreSessionIfNeeded()
  }

  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc(startFeasibilitySession:resolver:rejecter:)
  func startFeasibilitySession(
    _ options: NSDictionary,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let parsedOptions = parseOptions(options) else {
      reject("invalid_options", "Invalid feasibility session options.", nil)
      return
    }

    queue.async {
      self.stopActiveSession(reason: "replaced_by_new_session", logEvent: true)

      let startedAt = Date()
      let plannedCueAt = startedAt.addingTimeInterval(parsedOptions.cueAfterSeconds)
      let endsAt = startedAt.addingTimeInterval(parsedOptions.testDurationSeconds)
      let session = FeasibilitySession(
        options: parsedOptions,
        startedAt: self.formatDate(startedAt),
        plannedCueAt: self.formatDate(plannedCueAt),
        endsAt: self.formatDate(endsAt)
      )

      self.activeSession = session
      self.persistActiveSession(session)

      self.appendEvent("session_started", payload: [
        "sessionId": parsedOptions.sessionId,
        "testName": parsedOptions.testName,
        "cueAfterSeconds": parsedOptions.cueAfterSeconds,
        "testDurationSeconds": parsedOptions.testDurationSeconds,
        "playAudioBed": parsedOptions.playAudioBed,
        "audioBedVolume": parsedOptions.audioBedVolume,
        "enableMotionLogging": parsedOptions.enableMotionLogging,
        "enableDebugMicFeatures": parsedOptions.enableDebugMicFeatures,
        "enableNotificationFallback": parsedOptions.enableNotificationFallback,
        "enableKitchenSinkAudioTest": parsedOptions.enableKitchenSinkAudioTest == true,
        "startedAt": session.startedAt,
        "plannedCueAt": session.plannedCueAt,
        "endsAt": session.endsAt,
        "appState": self.currentAppState()
      ])

      do {
        try self.configureAudioSession(enableMicrophone: parsedOptions.enableDebugMicFeatures)
      } catch {
        self.appendEvent("session_error", payload: [
          "operation": "configure_audio_session",
          "error": error.localizedDescription
        ])
        self.clearActiveSession()
        reject("audio_session_failed", error.localizedDescription, error)
        return
      }

      let scheduledCueAsset: String

      if parsedOptions.enableKitchenSinkAudioTest == true {
        scheduledCueAsset = "bundled-feasibility-wav-segment"
      } else {
        scheduledCueAsset = "native-generated-test-tone"
      }

      self.appendEvent("cue_scheduled", payload: [
        "sessionId": parsedOptions.sessionId,
        "plannedCueAt": session.plannedCueAt,
        "cueAfterSeconds": parsedOptions.cueAfterSeconds,
        "cueAsset": scheduledCueAsset
      ])

      if parsedOptions.playAudioBed {
        self.startAudioBed(volume: parsedOptions.audioBedVolume)
      }

      if parsedOptions.enableMotionLogging {
        self.startMotionLogging()
      }

      if parsedOptions.enableDebugMicFeatures {
        self.startDebugMicSummaries()
      }

      if parsedOptions.enableNotificationFallback {
        self.scheduleNotificationFallback(session: session)
      }

      self.logBatterySummary(reason: "session_start")
      self.scheduleCueTimer(session: session)
      self.scheduleStopTimer(session: session)
      self.scheduleBatteryTimer()

      if parsedOptions.enableKitchenSinkAudioTest == true {
        self.logBundledAudioSegments()
        self.scheduleKitchenSinkAudioTest(session: session)
      }

      resolve(nil)
    }
  }

  @objc(stopFeasibilitySession:rejecter:)
  func stopFeasibilitySession(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async {
      self.stopActiveSession(reason: "manual_stop", logEvent: true)
      resolve(nil)
    }
  }

  @objc(getFeasibilityLogs:rejecter:)
  func getFeasibilityLogs(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async {
      resolve(self.logs)
    }
  }

  @objc(clearFeasibilityLogs:rejecter:)
  func clearFeasibilityLogs(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async {
      self.logs = []
      try? FileManager.default.removeItem(at: self.logsURL())
      resolve(nil)
    }
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    logEvent("notification_fired", payload: [
      "identifier": notification.request.identifier,
      "foregroundPresentation": true
    ])
    completionHandler([.banner, .sound])
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    logEvent("notification_fired", payload: [
      "identifier": response.notification.request.identifier,
      "opened": true,
      "actionIdentifier": response.actionIdentifier
    ])
    completionHandler()
  }

  private func parseOptions(_ dictionary: NSDictionary) -> FeasibilityOptions? {
    guard
      let sessionId = dictionary["sessionId"] as? String,
      let testName = dictionary["testName"] as? String,
      let cueAfterSeconds = numberValue(dictionary["cueAfterSeconds"]),
      let testDurationSeconds = numberValue(dictionary["testDurationSeconds"]),
      let audioBedVolume = numberValue(dictionary["audioBedVolume"])
    else {
      return nil
    }

    return FeasibilityOptions(
      sessionId: sessionId,
      testName: testName,
      cueAfterSeconds: max(1, cueAfterSeconds),
      testDurationSeconds: max(1, testDurationSeconds),
      playAudioBed: boolValue(dictionary["playAudioBed"]),
      audioBedVolume: min(1, max(0, audioBedVolume)),
      enableMotionLogging: boolValue(dictionary["enableMotionLogging"]),
      enableDebugMicFeatures: boolValue(dictionary["enableDebugMicFeatures"]),
      enableNotificationFallback: boolValue(dictionary["enableNotificationFallback"]),
      enableKitchenSinkAudioTest: boolValue(dictionary["enableKitchenSinkAudioTest"])
    )
  }

  private func numberValue(_ value: Any?) -> Double? {
    if let number = value as? NSNumber {
      return number.doubleValue
    }

    return value as? Double
  }

  private func boolValue(_ value: Any?) -> Bool {
    if let number = value as? NSNumber {
      return number.boolValue
    }

    return value as? Bool ?? false
  }

  private func configureAudioSession(enableMicrophone: Bool) throws {
    let session = AVAudioSession.sharedInstance()
    let category: AVAudioSession.Category = enableMicrophone ? .playAndRecord : .playback
    var lastError: Error?

    for candidate in audioSessionOptionCandidates(enableMicrophone: enableMicrophone) {
      do {
        try session.setCategory(category, mode: .default, options: candidate.options)
        try session.setActive(true)

        var payload = audioSessionPayload()
        payload["configurationAttempt"] = candidate.name
        appendEvent("audio_session_configured", payload: payload)
        return
      } catch {
        lastError = error
        appendEvent("session_error", payload: [
          "operation": "configure_audio_session_attempt",
          "category": category.rawValue,
          "options": audioOptionsPayload(candidate.options),
          "attempt": candidate.name,
          "error": error.localizedDescription
        ])
      }
    }

    throw lastError ?? NSError(
      domain: "LucidTLRFeasibility",
      code: -1,
      userInfo: [NSLocalizedDescriptionKey: "Could not configure audio session."]
    )
  }

  private func audioSessionOptionCandidates(
    enableMicrophone: Bool
  ) -> [(name: String, options: AVAudioSession.CategoryOptions)] {
    if enableMicrophone {
      return [
        (
          "playAndRecord_mix_bluetooth_speaker",
          [.mixWithOthers, .allowBluetooth, .defaultToSpeaker]
        ),
        (
          "playAndRecord_mix_speaker",
          [.mixWithOthers, .defaultToSpeaker]
        ),
        (
          "playAndRecord_plain",
          []
        )
      ]
    }

    return [
      (
        "playback_mix",
        [.mixWithOthers]
      ),
      (
        "playback_plain",
        []
      )
    ]
  }

  private func observeSystemEvents() {
    let center = NotificationCenter.default

    center.addObserver(
      self,
      selector: #selector(handleAppDidEnterBackground),
      name: UIApplication.didEnterBackgroundNotification,
      object: nil
    )
    center.addObserver(
      self,
      selector: #selector(handleAppWillEnterForeground),
      name: UIApplication.willEnterForegroundNotification,
      object: nil
    )
    center.addObserver(
      self,
      selector: #selector(handleAppWillTerminate),
      name: UIApplication.willTerminateNotification,
      object: nil
    )
    center.addObserver(
      self,
      selector: #selector(handleProtectedDataAvailable),
      name: UIApplication.protectedDataDidBecomeAvailableNotification,
      object: nil
    )
    center.addObserver(
      self,
      selector: #selector(handleProtectedDataUnavailable),
      name: UIApplication.protectedDataWillBecomeUnavailableNotification,
      object: nil
    )
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

  @objc private func handleAppDidEnterBackground() {
    logEvent("app_backgrounded", payload: systemStatePayload())
  }

  @objc private func handleAppWillEnterForeground() {
    logEvent("app_foregrounded", payload: systemStatePayload())
  }

  @objc private func handleAppWillTerminate() {
    logEvent("app_will_terminate", payload: systemStatePayload())
  }

  @objc private func handleProtectedDataAvailable() {
    logEvent("protected_data_available", payload: [
      "isProtectedDataAvailable": UIApplication.shared.isProtectedDataAvailable
    ])
  }

  @objc private func handleProtectedDataUnavailable() {
    logEvent("protected_data_unavailable", payload: [
      "isProtectedDataAvailable": UIApplication.shared.isProtectedDataAvailable
    ])
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
      logEvent("audio_interruption_started", payload: payload)
      return
    }

    logEvent("audio_interruption_ended", payload: payload)
  }

  @objc private func handleAudioRouteChange(_ notification: Notification) {
    let rawReason = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt
    let reason = rawReason.flatMap(AVAudioSession.RouteChangeReason.init(rawValue:))
    var payload = audioRoutePayload()
    payload["reason"] = reason?.description ?? "unknown"
    payload["rawReason"] = rawReason ?? 0

    logEvent("audio_route_changed", payload: payload)
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

  private func startAudioBed(volume: Double) {
    do {
      let engine = ensureAudioEngine()
      let format = engine.mainMixerNode.outputFormat(forBus: 0)
      let buffer = makeSineBuffer(
        format: format,
        frequency: 220,
        durationSeconds: 6,
        amplitude: 0.18
      )

      audioBedPlayer?.stop()
      audioBedPlayer?.volume = Float(volume)
      audioBedPlayer?.scheduleBuffer(buffer, at: nil, options: .loops)

      if !engine.isRunning {
        try engine.start()
      }

      audioBedPlayer?.play()
      appendEvent("audio_bed_started", payload: [
        "volume": volume,
        "audible": true,
        "toneHz": 220,
        "asset": "native-generated-audio-bed"
      ])
    } catch {
      appendEvent("audio_bed_failed", payload: [
        "error": error.localizedDescription
      ])
    }
  }

  private func setAudioBedVolume(_ volume: Double, reason: String) {
    let clampedVolume = min(1, max(0, volume))

    audioBedPlayer?.volume = Float(clampedVolume)
    appendEvent("audio_bed_volume_changed", payload: [
      "volume": clampedVolume,
      "reason": reason,
      "appState": currentAppState()
    ])
  }

  private func pauseAudioBed(reason: String) {
    audioBedPlayer?.pause()
    appendEvent("audio_bed_paused", payload: [
      "reason": reason,
      "appState": currentAppState()
    ])
  }

  private func resumeAudioBed(reason: String) {
    audioBedPlayer?.play()
    appendEvent("audio_bed_resumed", payload: [
      "reason": reason,
      "appState": currentAppState()
    ])
  }

  private func playCue(session: FeasibilitySession) {
    if session.options.enableKitchenSinkAudioTest == true {
      let plannedCueAt = parseDate(session.plannedCueAt) ?? Date()
      playNativeComputedSegment(
        session: session,
        reason: "scheduled_primary_cue",
        plannedAt: plannedCueAt,
        mirrorCueEvents: true
      )
      return
    }

    let attemptAt = Date()
    let plannedCueAt = parseDate(session.plannedCueAt) ?? attemptAt
    let driftMs = Int(attemptAt.timeIntervalSince(plannedCueAt) * 1000)

    appendEvent("cue_play_attempted", payload: [
      "sessionId": session.options.sessionId,
      "plannedCueAt": session.plannedCueAt,
      "actualCueAttemptAt": formatDate(attemptAt),
      "driftMs": driftMs,
      "cueAsset": "native-generated-test-tone",
      "volume": 0.28
    ])

    do {
      let engine = ensureAudioEngine()
      let format = engine.mainMixerNode.outputFormat(forBus: 0)
      let buffer = makeCueBuffer(format: format)

      cuePlayer?.stop()
      cuePlayer?.volume = 0.28
      cuePlayer?.scheduleBuffer(buffer)

      if !engine.isRunning {
        try engine.start()
      }

      cuePlayer?.play()
      appendEvent("cue_played", payload: [
        "sessionId": session.options.sessionId,
        "plannedCueAt": session.plannedCueAt,
        "actualCueAttemptAt": formatDate(attemptAt),
        "actualCuePlayedAt": formatDate(Date()),
        "driftMs": driftMs,
        "cueAsset": "native-generated-test-tone",
        "volume": 0.28,
        "success": true
      ])
    } catch {
      appendEvent("cue_failed", payload: [
        "sessionId": session.options.sessionId,
        "plannedCueAt": session.plannedCueAt,
        "actualCueAttemptAt": formatDate(attemptAt),
        "driftMs": driftMs,
        "cueAsset": "native-generated-test-tone",
        "success": false,
        "error": error.localizedDescription
      ])
    }
  }

  private func scheduleKitchenSinkAudioTest(session: FeasibilitySession) {
    cancelAudioModulationTimers()
    appendEvent("audio_modulation_sequence_started", payload: [
      "sessionId": session.options.sessionId,
      "testName": session.options.testName,
      "appState": currentAppState(),
      "steps": [
        "bed_volume_0_012_at_60s",
        "low_segment_at_120s",
        "bed_pause_at_180s",
        "bed_resume_at_210s",
        "bed_volume_0_045_at_300s",
        "native_random_segment_at_360s",
        "high_segment_at_420s",
        "bed_pause_at_480s",
        "bed_resume_at_510s",
        "scheduled_native_random_primary_cue_at_cueAfterSeconds"
      ]
    ])

    scheduleAudioModulationStep(
      session: session,
      name: "bed_volume_0_012",
      offsetSeconds: 60
    ) { [weak self] in
      self?.setAudioBedVolume(0.012, reason: "kitchen_sink_low_bed_volume")
    }

    scheduleAudioModulationStep(
      session: session,
      name: "low_segment",
      offsetSeconds: 120
    ) { [weak self] in
      guard let self else {
        return
      }

      self.playAudioSegment(
        session: session,
        segment: self.audioSegment(key: "low"),
        reason: "kitchen_sink_explicit_low_segment",
        plannedAt: self.date(session.startedAt, adding: 120),
        mirrorCueEvents: false
      )
    }

    scheduleAudioModulationStep(
      session: session,
      name: "bed_pause",
      offsetSeconds: 180
    ) { [weak self] in
      self?.pauseAudioBed(reason: "kitchen_sink_pause")
    }

    scheduleAudioModulationStep(
      session: session,
      name: "bed_resume",
      offsetSeconds: 210
    ) { [weak self] in
      self?.resumeAudioBed(reason: "kitchen_sink_resume")
    }

    scheduleAudioModulationStep(
      session: session,
      name: "bed_volume_0_045",
      offsetSeconds: 300
    ) { [weak self] in
      self?.setAudioBedVolume(0.045, reason: "kitchen_sink_louder_bed_volume")
    }

    scheduleAudioModulationStep(
      session: session,
      name: "native_random_segment_1",
      offsetSeconds: 360
    ) { [weak self] in
      self?.playNativeComputedSegment(
        session: session,
        reason: "kitchen_sink_native_random_segment_1",
        plannedAt: self?.date(session.startedAt, adding: 360),
        mirrorCueEvents: false
      )
    }

    scheduleAudioModulationStep(
      session: session,
      name: "high_segment",
      offsetSeconds: 420
    ) { [weak self] in
      guard let self else {
        return
      }

      self.playAudioSegment(
        session: session,
        segment: self.audioSegment(key: "high"),
        reason: "kitchen_sink_explicit_high_segment",
        plannedAt: self.date(session.startedAt, adding: 420),
        mirrorCueEvents: false
      )
    }

    scheduleAudioModulationStep(
      session: session,
      name: "second_bed_pause",
      offsetSeconds: 480
    ) { [weak self] in
      self?.pauseAudioBed(reason: "kitchen_sink_second_pause")
    }

    scheduleAudioModulationStep(
      session: session,
      name: "second_bed_resume",
      offsetSeconds: 510
    ) { [weak self] in
      self?.resumeAudioBed(reason: "kitchen_sink_second_resume")
    }
  }

  private func scheduleAudioModulationStep(
    session: FeasibilitySession,
    name: String,
    offsetSeconds: TimeInterval,
    handler: @escaping () -> Void
  ) {
    guard let plannedAt = date(session.startedAt, adding: offsetSeconds) else {
      return
    }

    let remaining = plannedAt.timeIntervalSince(Date())

    appendEvent("audio_modulation_step_scheduled", payload: [
      "sessionId": session.options.sessionId,
      "name": name,
      "offsetSeconds": offsetSeconds,
      "plannedAt": formatDate(plannedAt),
      "remainingSeconds": max(0, remaining)
    ])

    guard remaining > 0 else {
      return
    }

    let timer = makeTimer(after: remaining) {
      handler()
    }

    audioModulationTimers.append(timer)
  }

  private func playNativeComputedSegment(
    session: FeasibilitySession,
    reason: String,
    plannedAt: Date?,
    mirrorCueEvents: Bool
  ) {
    let randomValue = Double.random(in: 0..<1)
    let segment: AudioSegment

    if randomValue < 1.0 / 3.0 {
      segment = audioSegment(key: "low")
    } else if randomValue < 2.0 / 3.0 {
      segment = audioSegment(key: "medium")
    } else {
      segment = audioSegment(key: "high")
    }

    appendEvent("native_audio_decision_made", payload: [
      "sessionId": session.options.sessionId,
      "reason": reason,
      "algorithm": "native_double_random_three_bucket",
      "randomValue": randomValue,
      "selectedSegment": segment.key,
      "selectedFrequencyHz": segment.frequencyHz,
      "appState": currentAppState()
    ])

    playAudioSegment(
      session: session,
      segment: segment,
      reason: reason,
      plannedAt: plannedAt,
      mirrorCueEvents: mirrorCueEvents
    )
  }

  private func playAudioSegment(
    session: FeasibilitySession,
    segment: AudioSegment,
    reason: String,
    plannedAt: Date?,
    mirrorCueEvents: Bool
  ) {
    let attemptAt = Date()
    let plannedAt = plannedAt ?? attemptAt
    let driftMs = Int(attemptAt.timeIntervalSince(plannedAt) * 1000)
    let commonPayload: [String: Any] = [
      "sessionId": session.options.sessionId,
      "reason": reason,
      "plannedAt": formatDate(plannedAt),
      "actualAttemptAt": formatDate(attemptAt),
      "driftMs": driftMs,
      "segment": segment.key,
      "cueAsset": segment.fileName,
      "frequencyHz": segment.frequencyHz,
      "volume": 0.3,
      "appState": currentAppState()
    ]

    appendEvent("audio_segment_play_attempted", payload: commonPayload)

    if mirrorCueEvents {
      appendEvent("cue_play_attempted", payload: [
        "sessionId": session.options.sessionId,
        "plannedCueAt": formatDate(plannedAt),
        "actualCueAttemptAt": formatDate(attemptAt),
        "driftMs": driftMs,
        "cueAsset": segment.fileName,
        "segment": segment.key,
        "frequencyHz": segment.frequencyHz,
        "volume": 0.3
      ])
    }

    do {
      guard let url = Bundle.main.url(forResource: segment.resourceName, withExtension: "wav") else {
        throw NSError(
          domain: "LucidTLRFeasibility",
          code: -2,
          userInfo: [NSLocalizedDescriptionKey: "Missing bundled audio segment \(segment.fileName)."]
        )
      }

      let engine = ensureAudioEngine()
      let file = try AVAudioFile(forReading: url)

      cuePlayer?.stop()
      cuePlayer?.volume = 0.3
      cuePlayer?.scheduleFile(file, at: nil) { [weak self] in
        self?.queue.async {
          self?.appendEvent("audio_segment_completed", payload: [
            "sessionId": session.options.sessionId,
            "reason": reason,
            "segment": segment.key,
            "cueAsset": segment.fileName,
            "completedAt": self?.formatDate(Date()) ?? "",
            "appState": self?.currentAppState() ?? "unknown"
          ])
        }
      }

      if !engine.isRunning {
        try engine.start()
      }

      cuePlayer?.play()

      var playedPayload = commonPayload
      playedPayload["actualPlayedAt"] = formatDate(Date())
      playedPayload["durationSeconds"] = Double(file.length) / file.fileFormat.sampleRate
      playedPayload["sampleRate"] = file.fileFormat.sampleRate
      playedPayload["channelCount"] = file.fileFormat.channelCount
      playedPayload["success"] = true
      appendEvent("audio_segment_played", payload: playedPayload)

      if mirrorCueEvents {
        appendEvent("cue_played", payload: [
          "sessionId": session.options.sessionId,
          "plannedCueAt": formatDate(plannedAt),
          "actualCueAttemptAt": formatDate(attemptAt),
          "actualCuePlayedAt": formatDate(Date()),
          "driftMs": driftMs,
          "cueAsset": segment.fileName,
          "segment": segment.key,
          "frequencyHz": segment.frequencyHz,
          "volume": 0.3,
          "success": true
        ])
      }
    } catch {
      var failedPayload = commonPayload
      failedPayload["success"] = false
      failedPayload["error"] = error.localizedDescription
      appendEvent("audio_segment_failed", payload: failedPayload)

      if mirrorCueEvents {
        appendEvent("cue_failed", payload: [
          "sessionId": session.options.sessionId,
          "plannedCueAt": formatDate(plannedAt),
          "actualCueAttemptAt": formatDate(attemptAt),
          "driftMs": driftMs,
          "cueAsset": segment.fileName,
          "segment": segment.key,
          "success": false,
          "error": error.localizedDescription
        ])
      }
    }
  }

  private func logBundledAudioSegments() {
    for segment in audioSegments() {
      guard let url = Bundle.main.url(forResource: segment.resourceName, withExtension: "wav") else {
        appendEvent("audio_segment_failed", payload: [
          "operation": "preload",
          "segment": segment.key,
          "cueAsset": segment.fileName,
          "error": "missing_bundled_resource"
        ])
        continue
      }

      do {
        let file = try AVAudioFile(forReading: url)
        appendEvent("audio_segment_preloaded", payload: [
          "segment": segment.key,
          "cueAsset": segment.fileName,
          "frequencyHz": segment.frequencyHz,
          "durationSeconds": Double(file.length) / file.fileFormat.sampleRate,
          "sampleRate": file.fileFormat.sampleRate,
          "channelCount": file.fileFormat.channelCount
        ])
      } catch {
        appendEvent("audio_segment_failed", payload: [
          "operation": "preload",
          "segment": segment.key,
          "cueAsset": segment.fileName,
          "error": error.localizedDescription
        ])
      }
    }
  }

  private func audioSegments() -> [AudioSegment] {
    [
      AudioSegment(
        key: "low",
        resourceName: "lucidtlr_feasibility_low",
        fileName: "lucidtlr_feasibility_low.wav",
        frequencyHz: 330
      ),
      AudioSegment(
        key: "medium",
        resourceName: "lucidtlr_feasibility_medium",
        fileName: "lucidtlr_feasibility_medium.wav",
        frequencyHz: 660
      ),
      AudioSegment(
        key: "high",
        resourceName: "lucidtlr_feasibility_high",
        fileName: "lucidtlr_feasibility_high.wav",
        frequencyHz: 990
      )
    ]
  }

  private func audioSegment(key: String) -> AudioSegment {
    audioSegments().first { $0.key == key } ?? audioSegments()[1]
  }

  private func ensureAudioEngine() -> AVAudioEngine {
    if let audioEngine {
      return audioEngine
    }

    let engine = AVAudioEngine()
    let bedPlayer = AVAudioPlayerNode()
    let cuePlayer = AVAudioPlayerNode()

    engine.attach(bedPlayer)
    engine.attach(cuePlayer)
    engine.connect(bedPlayer, to: engine.mainMixerNode, format: nil)
    engine.connect(cuePlayer, to: engine.mainMixerNode, format: nil)

    audioEngine = engine
    audioBedPlayer = bedPlayer
    self.cuePlayer = cuePlayer

    return engine
  }

  private func makeCueBuffer(format: AVAudioFormat) -> AVAudioPCMBuffer {
    let sampleRate = format.sampleRate
    let duration = 3.0
    let frameCount = AVAudioFrameCount(sampleRate * duration)
    let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount)!
    buffer.frameLength = frameCount

    guard let channels = buffer.floatChannelData else {
      return buffer
    }

    for frame in 0..<Int(frameCount) {
      let time = Double(frame) / sampleRate
      let fadeIn = min(1, time / 0.25)
      let fadeOut = min(1, (duration - time) / 0.35)
      let envelope = max(0, min(fadeIn, fadeOut))
      let tone = sin(2 * Double.pi * 660 * time) * 0.35
      let sample = Float(tone * envelope)

      for channelIndex in 0..<Int(format.channelCount) {
        channels[channelIndex][frame] = sample
      }
    }

    return buffer
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

  private func startMotionLogging() {
    guard motionManager.isAccelerometerAvailable else {
      appendEvent("motion_stopped", payload: [
        "reason": "accelerometer_unavailable"
      ])
      return
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
        self.logEvent("motion_stopped", payload: [
          "reason": "accelerometer_error",
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

    motionSummaryTimer = makeTimer(after: 5, repeating: 5) { [weak self] in
      self?.appendMotionSummary()
    }

    appendEvent("motion_started", payload: [
      "source": "phone_accelerometer",
      "updateInterval": motionManager.accelerometerUpdateInterval
    ])
  }

  private func appendMotionSummary() {
    let now = Date()
    let sampleCount = motionSampleCount
    let mean = sampleCount > 0 ? motionMagnitudeSum / Double(sampleCount) : 0
    let maxMagnitude = motionMagnitudeMax
    let lastSummaryAt = lastMotionSummaryAt ?? now
    let elapsed = now.timeIntervalSince(lastSummaryAt)

    appendEvent("motion_summary", payload: [
      "sampleCount": sampleCount,
      "meanAccelerationMagnitude": mean,
      "maxAccelerationMagnitude": maxMagnitude,
      "roughMovementIntensity": movementIntensity(mean: mean, max: maxMagnitude, sampleCount: sampleCount),
      "orientation": orientationString(UIDevice.current.orientation),
      "updateInterval": motionManager.accelerometerUpdateInterval,
      "backgroundState": currentAppState(),
      "timeSinceLastSummary": elapsed
    ])

    motionSampleCount = 0
    motionMagnitudeSum = 0
    motionMagnitudeMax = 0
    lastMotionSummaryAt = now
  }

  private func stopMotionLogging(reason: String) {
    motionSummaryTimer?.cancel()
    motionSummaryTimer = nil

    if motionManager.isAccelerometerActive {
      appendMotionSummary()
      motionManager.stopAccelerometerUpdates()
      appendEvent("motion_stopped", payload: [
        "reason": reason
      ])
    }
  }

  private func startDebugMicSummaries() {
    appendEvent("mic_permission_requested", payload: [
      "localOnly": true,
      "rawAudioPersisted": false
    ])

    AVAudioSession.sharedInstance().requestRecordPermission { granted in
      self.queue.async {
        guard granted else {
          self.appendEvent("mic_permission_denied", payload: [
            "localOnly": true
          ])
          return
        }

        self.installMicTap()
      }
    }
  }

  private func installMicTap() {
    do {
      let engine = ensureAudioEngine()
      let inputNode = engine.inputNode
      let format = inputNode.outputFormat(forBus: 0)

      micSampleCount = 0
      micSquaresSum = 0
      micPeak = 0

      inputNode.removeTap(onBus: 0)
      inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
        guard let self, let channel = buffer.floatChannelData?[0] else {
          return
        }

        let frameCount = Int(buffer.frameLength)
        var squares = 0.0
        var peak = 0.0

        for frame in 0..<frameCount {
          let value = Double(channel[frame])
          squares += value * value
          peak = max(peak, abs(value))
        }

        self.queue.async {
          self.micSampleCount += frameCount
          self.micSquaresSum += squares
          self.micPeak = max(self.micPeak, peak)
        }
      }

      if !engine.isRunning {
        try engine.start()
      }

      micSummaryTimer = makeTimer(after: 5, repeating: 5) { [weak self] in
        self?.appendMicSummary()
      }
    } catch {
      appendEvent("session_error", payload: [
        "operation": "install_mic_tap",
        "error": error.localizedDescription
      ])
    }
  }

  private func appendMicSummary() {
    let sampleCount = micSampleCount
    let rms = sampleCount > 0 ? sqrt(micSquaresSum / Double(sampleCount)) : 0

    appendEvent("mic_summary", payload: [
      "rmsLevel": rms,
      "peakLevel": micPeak,
      "sampleCount": sampleCount,
      "rawAudioPersisted": false,
      "cueAudibilityEstimate": "not_implemented"
    ])

    micSampleCount = 0
    micSquaresSum = 0
    micPeak = 0
  }

  private func stopMicSummaries() {
    micSummaryTimer?.cancel()
    micSummaryTimer = nil

    if micSampleCount > 0 {
      appendMicSummary()
    }

    audioEngine?.inputNode.removeTap(onBus: 0)
  }

  private func scheduleNotificationFallback(session: FeasibilitySession) {
    let identifier = "lucidtlr-feasibility-\(session.options.sessionId)"
    notificationIdentifier = identifier

    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { granted, error in
      self.queue.async {
        if let error {
          self.appendEvent("session_error", payload: [
            "operation": "request_notification_permission",
            "error": error.localizedDescription
          ])
          return
        }

        guard granted else {
          self.appendEvent("session_error", payload: [
            "operation": "request_notification_permission",
            "error": "notification_permission_denied"
          ])
          return
        }

        let content = UNMutableNotificationContent()
        content.title = "LucidTLR feasibility cue"
        content.body = "Notification fallback cue fired."
        content.sound = .default
        content.userInfo = [
          "sessionId": session.options.sessionId,
          "testName": session.options.testName
        ]

        let trigger = UNTimeIntervalNotificationTrigger(
          timeInterval: max(1, session.options.cueAfterSeconds),
          repeats: false
        )
        let request = UNNotificationRequest(identifier: identifier, content: content, trigger: trigger)

        UNUserNotificationCenter.current().add(request) { addError in
          self.queue.async {
            if let addError {
              self.appendEvent("session_error", payload: [
                "operation": "schedule_notification",
                "error": addError.localizedDescription
              ])
              return
            }

            self.appendEvent("notification_scheduled", payload: [
              "identifier": identifier,
              "scheduledAt": self.formatDate(Date()),
              "plannedFireAt": session.plannedCueAt,
              "delaySeconds": session.options.cueAfterSeconds,
              "sound": "default"
            ])
          }
        }
      }
    }
  }

  private func scheduleCueTimer(session: FeasibilitySession) {
    cueTimer?.cancel()
    cueTimer = makeTimer(after: session.options.cueAfterSeconds) { [weak self] in
      guard let self else {
        return
      }

      self.playCue(session: session)
      self.cueTimer?.cancel()
      self.cueTimer = nil
    }
  }

  private func scheduleStopTimer(session: FeasibilitySession) {
    stopTimer?.cancel()
    stopTimer = makeTimer(after: session.options.testDurationSeconds) { [weak self] in
      self?.stopActiveSession(reason: "test_duration_elapsed", logEvent: true)
    }
  }

  private func scheduleBatteryTimer() {
    batteryTimer?.cancel()
    batteryTimer = makeTimer(after: 60, repeating: 60) { [weak self] in
      self?.logBatterySummary(reason: "periodic")
    }
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

  private func stopActiveSession(reason: String, logEvent: Bool) {
    cueTimer?.cancel()
    cueTimer = nil
    stopTimer?.cancel()
    stopTimer = nil
    batteryTimer?.cancel()
    batteryTimer = nil
    cancelAudioModulationTimers()

    stopMotionLogging(reason: reason)
    stopMicSummaries()
    audioBedPlayer?.stop()
    cuePlayer?.stop()
    audioEngine?.stop()
    audioEngine = nil
    audioBedPlayer = nil
    cuePlayer = nil

    if let notificationIdentifier {
      UNUserNotificationCenter.current().removePendingNotificationRequests(
        withIdentifiers: [notificationIdentifier]
      )
    }

    if logEvent, let session = activeSession {
      appendEvent("session_stopped", payload: [
        "sessionId": session.options.sessionId,
        "testName": session.options.testName,
        "reason": reason,
        "stoppedAt": formatDate(Date()),
        "notificationCanceled": notificationIdentifier != nil
      ])
    }

    notificationIdentifier = nil
    clearActiveSession()
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }

  private func restoreSessionIfNeeded() {
    guard
      let data = UserDefaults.standard.data(forKey: "lucidtlr_feasibility_active_session"),
      let session = try? JSONDecoder().decode(FeasibilitySession.self, from: data)
    else {
      return
    }

    activeSession = session
    logEvent("session_restored", payload: [
      "sessionId": session.options.sessionId,
      "testName": session.options.testName,
      "startedAt": session.startedAt,
      "plannedCueAt": session.plannedCueAt,
      "endsAt": session.endsAt
    ])

    queue.async {
      guard let endsAt = self.parseDate(session.endsAt) else {
        return
      }

      let remaining = endsAt.timeIntervalSince(Date())

      if remaining <= 0 {
        self.stopActiveSession(reason: "restored_after_duration_elapsed", logEvent: true)
        return
      }

      do {
        try self.configureAudioSession(enableMicrophone: session.options.enableDebugMicFeatures)
      } catch {
        self.appendEvent("session_error", payload: [
          "operation": "restore_audio_session",
          "error": error.localizedDescription
        ])
      }

      if session.options.playAudioBed {
        self.startAudioBed(volume: session.options.audioBedVolume)
      }

      if session.options.enableMotionLogging {
        self.startMotionLogging()
      }

      if session.options.enableKitchenSinkAudioTest == true {
        self.logBundledAudioSegments()
        self.scheduleKitchenSinkAudioTest(session: session)
      }

      if let plannedCueAt = self.parseDate(session.plannedCueAt) {
        let cueRemaining = plannedCueAt.timeIntervalSince(Date())

        if cueRemaining > 0 {
          self.cueTimer = self.makeTimer(after: cueRemaining) { [weak self] in
            self?.playCue(session: session)
          }
        }
      }

      self.stopTimer = self.makeTimer(after: remaining) { [weak self] in
        self?.stopActiveSession(reason: "test_duration_elapsed", logEvent: true)
      }
      self.scheduleBatteryTimer()
    }
  }

  private func persistActiveSession(_ session: FeasibilitySession) {
    if let data = try? JSONEncoder().encode(session) {
      UserDefaults.standard.set(data, forKey: "lucidtlr_feasibility_active_session")
    }
  }

  private func clearActiveSession() {
    activeSession = nil
    UserDefaults.standard.removeObject(forKey: "lucidtlr_feasibility_active_session")
  }

  private func appendEvent(_ eventType: String, payload: [String: Any]) {
    let event: [String: Any] = [
      "id": UUID().uuidString,
      "timestamp": formatDate(Date()),
      "eventType": eventType,
      "payload": sanitizePayload(payload)
    ]

    logs.append(event)
    persistLogs()
  }

  private func logEvent(_ eventType: String, payload: [String: Any]) {
    queue.async {
      self.appendEvent(eventType, payload: payload)
    }
  }

  private func persistLogs() {
    do {
      let data = try JSONSerialization.data(withJSONObject: logs, options: [.prettyPrinted])
      try ensureStorageDirectory()
      try data.write(to: logsURL(), options: [.atomic])
    } catch {
      NSLog("LucidTLR feasibility log write failed: \(error.localizedDescription)")
    }
  }

  private func loadLogsFromDisk() -> [[String: Any]] {
    guard
      let data = try? Data(contentsOf: logsURL()),
      let decoded = try? JSONSerialization.jsonObject(with: data),
      let decodedLogs = decoded as? [[String: Any]]
    else {
      return []
    }

    return decodedLogs
  }

  private func logsURL() -> URL {
    storageDirectory().appendingPathComponent("iphone-feasibility-events.json")
  }

  private func storageDirectory() -> URL {
    FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("LucidTLRFeasibility", isDirectory: true)
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

  private func formatDate(_ date: Date) -> String {
    isoFormatter.string(from: date)
  }

  private func parseDate(_ value: String) -> Date? {
    isoFormatter.date(from: value) ?? ISO8601DateFormatter().date(from: value)
  }

  private func date(_ value: String, adding seconds: TimeInterval) -> Date? {
    parseDate(value)?.addingTimeInterval(seconds)
  }

  private func cancelAudioModulationTimers() {
    audioModulationTimers.forEach { timer in
      timer.cancel()
    }
    audioModulationTimers = []
  }

  private func logBatterySummary(reason: String) {
    appendEvent("battery_summary", payload: batteryPayload(reason: reason))
  }

  private func systemStatePayload() -> [String: Any] {
    var payload = batteryPayload(reason: "system_state")
    payload["appState"] = currentAppState()
    payload["thermalState"] = thermalStateString(ProcessInfo.processInfo.thermalState)
    payload["isProtectedDataAvailable"] = UIApplication.shared.isProtectedDataAvailable

    return payload
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

  private func movementIntensity(mean: Double, max: Double, sampleCount: Int) -> String {
    if sampleCount == 0 {
      return "no_samples"
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
