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

  func startSession(sessionId commandSessionId: String? = nil) {
    guard !isRunning else {
      return
    }

    guard let commandSessionId, !commandSessionId.isEmpty else {
      statusText = "Start TLR on phone"
      return
    }

    sessionId = commandSessionId
    watchSessionId = UUID().uuidString
    sessionStartedAt = Date()
    epochCount = 0
    heartRates = []
    motionSamples = []
    hrEma = nil
    motionEma = nil
    stableLowMovementSeconds = 0
    isRunning = true
    statusText = "running"
    sendStatus(reason: "started")
    requestHealthAuthorization()
    startWorkout()
    startMotion()
    WKInterfaceDevice.current().enableWaterLock()
    epochTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
      self?.emitEpoch(connectivityState: "connected")
    }
  }

  func stopSession(reason: String) {
    guard isRunning else {
      return
    }

    emitEpoch(connectivityState: "connected")
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

  private func emitEpoch(connectivityState: String) {
    guard isRunning, !sessionId.isEmpty else {
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

    let message: [String: Any] = [
      "schemaVersion": "watch-status-v1",
      "sessionId": sessionId,
      "reason": reason,
      "isRunning": isRunning,
      "status": statusText,
      "sentAt": isoFormatter.string(from: Date()),
      "batteryLevel": WKInterfaceDevice.current().batteryLevel,
      "healthAuthorizationStatus": healthAuthorizationStatus,
    ]

    if WCSession.default.isReachable {
      WCSession.default.sendMessage(message, replyHandler: nil) { _ in
        WCSession.default.transferUserInfo(message)
      }
    } else {
      WCSession.default.transferUserInfo(message)
    }
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
    handleWatchCommand(message)
  }

  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
    handleWatchCommand(userInfo)
  }

  private func handleWatchCommand(_ message: [String: Any]) {
    guard message["schemaVersion"] as? String == "watch-command-v1" else {
      return
    }

    DispatchQueue.main.async {
      let sessionId = message["sessionId"] as? String
      let command = message["command"] as? String

      if command == "start" {
        self.startSession(sessionId: sessionId)
      } else if command == "stop" {
        self.stopSession(reason: "iphone_command")
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
