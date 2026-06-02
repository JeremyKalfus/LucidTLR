import CoreMotion
import Foundation
import HealthKit
import WatchConnectivity
import WatchKit

final class WatchSessionManager: NSObject, ObservableObject {
  @Published private(set) var isConnected = false
  @Published private(set) var isRunning = false
  @Published private(set) var statusText = "Start TLR on phone"
  @Published private(set) var heartRateSampleCount = 0
  @Published private(set) var motionSampleCount = 0
  @Published private(set) var epochCount = 0
  @Published private(set) var sensorQuality = "missing"
  @Published private(set) var healthAuthorizationStatus = "unknown"
  @Published private(set) var batteryText = "unknown"

  private let healthStore = HKHealthStore()
  private let motionManager = CMMotionManager()
  private let motionQueue = OperationQueue()
  private let isoFormatter = ISO8601DateFormatter()
  private var workoutSession: HKWorkoutSession?
  private var workoutBuilder: HKLiveWorkoutBuilder?
  private var epochTimer: Timer?
  private var presenceTimer: Timer?
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
  private let hrAlpha = 0.95
  private let motionAlpha = 0.90

  override init() {
    isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    super.init()
    activateConnectivity()
    batteryText = formatBattery()
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

  func startSession(
    sessionId commandSessionId: String?,
    commandId: String,
    expiresAt: Date?,
    plan: [String: Any]
  ) -> [String: Any] {
    guard let commandSessionId, !commandSessionId.isEmpty else {
      statusText = "Start TLR on phone"
      return startRejectedReply(
        commandId: commandId,
        sessionId: "",
        reason: "missing_session_id"
      )
    }

    let now = Date()
    if let expiresAt, now >= expiresAt {
      return startRejectedReply(
        commandId: commandId,
        sessionId: commandSessionId,
        reason: "start_command_expired"
      )
    }

    let stopAt = stopAtDate(from: plan)
    if let stopAt, now >= stopAt {
      return startRejectedReply(
        commandId: commandId,
        sessionId: commandSessionId,
        reason: "plan_stop_at_elapsed"
      )
    }

    if healthAuthorizationStatus == "denied" || healthAuthorizationStatus == "unavailable" {
      return startRejectedReply(
        commandId: commandId,
        sessionId: commandSessionId,
        reason: "health_authorization_\(healthAuthorizationStatus)"
      )
    }

    if isRunning {
      guard sessionId == commandSessionId else {
        return startRejectedReply(
          commandId: commandId,
          sessionId: commandSessionId,
          reason: "watch_busy"
        )
      }

      plannedStopAt = stopAt ?? plannedStopAt
      currentStartCommandId = commandId
      return startedReply(commandId: commandId)
    }

    sessionId = commandSessionId
    watchSessionId = UUID().uuidString
    currentStartCommandId = commandId
    sessionStartedAt = now
    plannedStopAt = stopAt
    lastEpochAt = nil
    epochCount = 0
    heartRates = []
    motionSamples = []
    hrEma = nil
    motionEma = nil
    stableLowMovementSeconds = 0
    isRunning = true
    statusText = "running"
    requestHealthAuthorization()
    startWorkout()
    startMotion()
    WKInterfaceDevice.current().enableWaterLock()
    epochTimer?.invalidate()
    epochTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
      self?.handleEpochTimer()
    }
    sendStatus(reason: "started")

    return startedReply(commandId: commandId)
  }

  func stopSession(reason: String) {
    guard isRunning else {
      return
    }

    if reason != "planned_stop_at" {
      emitEpoch(connectivityState: "connected")
    }
    epochTimer?.invalidate()
    epochTimer = nil
    motionManager.stopAccelerometerUpdates()
    workoutSession?.end()
    workoutSession = nil
    workoutBuilder = nil
    isRunning = false
    statusText = "Start TLR on phone"
    sendStatus(reason: reason)
    sessionId = ""
    currentStartCommandId = ""
    plannedStopAt = nil
    lastEpochAt = nil
  }

  private func activateConnectivity() {
    guard WCSession.isSupported() else {
      statusText = "WatchConnectivity unavailable"
      return
    }

    WCSession.default.delegate = self
    WCSession.default.activate()
  }

  private func requestHealthAuthorization() {
    guard HKHealthStore.isHealthDataAvailable() else {
      updateHealthAuthorizationStatus("unavailable", reason: "health_unavailable")
      return
    }

    guard let heartRateType = HKQuantityType.quantityType(forIdentifier: .heartRate) else {
      updateHealthAuthorizationStatus("unavailable", reason: "heart_rate_unavailable")
      return
    }

    healthStore.requestAuthorization(
      toShare: [HKQuantityType.workoutType()],
      read: [heartRateType]
    ) { success, error in
      DispatchQueue.main.async {
        if let status = self.healthAuthorizationStatus(for: error) {
          self.updateHealthAuthorizationStatus(status, reason: "health_authorization_error")
        } else if success {
          self.sendStatus(reason: "health_authorization_requested")
        } else {
          self.sendStatus(reason: "health_authorization_unknown")
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
      statusText = "workout failed"
      if let status = healthAuthorizationStatus(for: error) {
        updateHealthAuthorizationStatus(status, reason: "workout_health_error")
      }
    }
  }

  private func startMotion() {
    guard motionManager.isAccelerometerAvailable else {
      sensorQuality = "degraded"
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

  private func handleEpochTimer() {
    if let plannedStopAt, Date() >= plannedStopAt {
      stopSession(reason: "planned_stop_at")
      return
    }

    emitEpoch(connectivityState: "connected")
  }

  private func emitEpoch(connectivityState: String) {
    guard isRunning, !sessionId.isEmpty else {
      return
    }

    if let plannedStopAt, Date() >= plannedStopAt {
      stopSession(reason: "planned_stop_at")
      return
    }

    let now = Date()
    let epochStart = now.addingTimeInterval(-30)
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

    var heartRatePayload: [String: Any] = [
      "sampleCount": hrSamples.count,
    ]
    var missingReasons: [String] = []
    if let avgHr {
      heartRatePayload["meanBpm"] = avgHr
    } else if healthAuthorizationStatus == "denied" || healthAuthorizationStatus == "unavailable" {
      missingReasons.append("heart_rate_\(healthAuthorizationStatus)")
    }
    if let minBpm = hrSamples.min() {
      heartRatePayload["minBpm"] = minBpm
    }
    if let maxBpm = hrSamples.max() {
      heartRatePayload["maxBpm"] = maxBpm
    }
    if let lastBpm = hrSamples.last {
      heartRatePayload["lastBpm"] = lastBpm
    }
    if let hrEma {
      heartRatePayload["hrEma"] = hrEma
    }
    if let hrFeature {
      heartRatePayload["hrFeature"] = hrFeature
    }

    var motionPayload: [String: Any] = [
      "sampleCount": motion.count,
      "activityCountMagnitudeSum": motionSum,
      "stableLowMovementSeconds": stableLowMovementSeconds,
      "roughMovementIntensity": roughIntensity,
    ]
    if !magnitudes.isEmpty {
      motionPayload["meanMagnitude"] = motionSum / Double(magnitudes.count)
    }
    if let maxMagnitude = magnitudes.max() {
      motionPayload["maxMagnitude"] = maxMagnitude
    }
    if let motionEma {
      motionPayload["motionEma"] = motionEma
    }
    if let motionFeature {
      motionPayload["motionFeature"] = motionFeature
    }

    var modelFeatures: [String: Any] = [
      "timeFeatureHours": elapsed / 3600,
    ]
    if let hrFeature {
      modelFeatures["hrFeature"] = hrFeature
    }
    if let motionFeature {
      modelFeatures["motionFeature"] = motionFeature
    }

    var message: [String: Any] = [
      "schemaVersion": "watch-epoch-v1",
      "sessionId": sessionId,
      "watchSessionId": watchSessionId,
      "epochIndex": epochCount,
      "epochStart": isoFormatter.string(from: epochStart),
      "epochEnd": isoFormatter.string(from: now),
      "elapsedSessionSeconds": elapsed,
      "heartRate": heartRatePayload,
      "motion": motionPayload,
      "modelFeatures": modelFeatures,
      "battery": [
        "level": WKInterfaceDevice.current().batteryLevel,
        "state": "watch",
      ],
      "sensorQuality": quality,
      "connectivityState": connectivityState,
    ]
    if !missingReasons.isEmpty {
      message["missingReasons"] = missingReasons
    }

    sendEpoch(message)
  }

  private func sendEpoch(_ message: [String: Any]) {
    guard WCSession.default.activationState == .activated else {
      WCSession.default.transferUserInfo(message)
      return
    }

    if WCSession.default.isReachable {
      WCSession.default.sendMessage(message) { [weak self] reply in
        DispatchQueue.main.async {
          self?.handleWatchCommand(reply)
        }
      } errorHandler: { _ in
        WCSession.default.transferUserInfo(message)
      }
    } else {
      WCSession.default.transferUserInfo(message)
    }
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
      } errorHandler: { _ in
        WCSession.default.transferUserInfo(message)
      }
    } else {
      WCSession.default.transferUserInfo(message)
    }
  }

  private func statusPayload(reason: String) -> [String: Any] {
    var message: [String: Any] = [
      "schemaVersion": "watch-status-v1",
      "sessionId": sessionId,
      "watchSessionId": watchSessionId,
      "reason": reason,
      "isRunning": isRunning,
      "status": statusText,
      "sentAt": isoFormatter.string(from: Date()),
      "startedAt": isRunning ? isoFormatter.string(from: sessionStartedAt) : "",
      "stopAt": plannedStopAt.map { isoFormatter.string(from: $0) } ?? "",
      "epochCount": epochCount,
      "lastEpochAt": lastEpochAt.map { isoFormatter.string(from: $0) } ?? "",
      "batteryLevel": WKInterfaceDevice.current().batteryLevel,
      "healthAuthorizationStatus": healthAuthorizationStatus,
    ]

    if !currentStartCommandId.isEmpty {
      message["commandId"] = currentStartCommandId
    }

    return message
  }

  private func startedReply(commandId: String) -> [String: Any] {
    [
      "schemaVersion": "watch-started-v1",
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
      "schemaVersion": "watch-start-rejected-v1",
      "commandId": commandId,
      "sessionId": sessionId,
      "reason": reason,
      "isRunning": isRunning,
      "watchSessionId": watchSessionId,
      "healthAuthorizationStatus": healthAuthorizationStatus
    ]
  }

  private func stopAtDate(from plan: [String: Any]) -> Date? {
    let safety = plan["safety"] as? [String: Any]
    guard let value = safety?["stopAt"] as? String, !value.isEmpty else {
      return nil
    }

    return parseDate(value)
  }

  private func parseDate(_ value: String) -> Date? {
    isoFormatter.date(from: value)
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

  private func formatBattery() -> String {
    let level = WKInterfaceDevice.current().batteryLevel

    return level < 0 ? "unknown" : "\(Int(level * 100))%"
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
      self.statusText = error?.localizedDescription ??
        (self.isRunning ? "running" : "Start TLR on phone")
      self.sendStatus(reason: "activated")
    }
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    DispatchQueue.main.async {
      _ = self.handleWatchCommand(message, allowsStart: false)
    }
  }

  func session(
    _ session: WCSession,
    didReceiveMessage message: [String: Any],
    replyHandler: @escaping ([String: Any]) -> Void
  ) {
    DispatchQueue.main.async {
      replyHandler(self.handleWatchCommand(message, allowsStart: true))
    }
  }

  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
    DispatchQueue.main.async {
      _ = self.handleWatchCommand(userInfo, allowsStart: false)
    }
  }

  @discardableResult
  private func handleWatchCommand(
    _ message: [String: Any],
    allowsStart: Bool = false
  ) -> [String: Any] {
    guard message["schemaVersion"] as? String == "watch-command-v1" else {
      return ["schemaVersion": "watch-status-ack-v1"]
    }

    let commandSessionId = message["sessionId"] as? String
    let command = message["command"] as? String
    let commandId = message["commandId"] as? String ?? ""

    if command == "start" {
      guard allowsStart else {
        return startRejectedReply(
          commandId: commandId,
          sessionId: commandSessionId ?? "",
          reason: "start_requires_live_reply"
        )
      }

      return startSession(
        sessionId: commandSessionId,
        commandId: commandId,
        expiresAt: (message["expiresAt"] as? String).flatMap(parseDate),
        plan: message["plan"] as? [String: Any] ?? [:]
      )
    }

    if command == "stop" {
      let reason = message["reason"] as? String ?? "iphone_command"
      if commandSessionId?.isEmpty != false || commandSessionId == sessionId {
        stopSession(reason: reason)
      }
      return ["schemaVersion": "watch-status-ack-v1"]
    }

    if command == "status" {
      return statusPayload(reason: "query")
    }

    return ["schemaVersion": "watch-status-ack-v1"]
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
      self.statusText = error.localizedDescription
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
