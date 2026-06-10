import Foundation
import HealthKit

enum HealthKitHeartRateProviderError: Error, Equatable {
  case healthDataUnavailable
  case heartRateTypeUnavailable
  case authorizationDenied(String?)
  case workoutRuntimeUnavailable(String)
}

final class HealthKitHeartRateProvider: NSObject,
  HeartRateProviding,
  HealthAuthorizationProviding,
  WorkoutRuntimeCapabilityProviding,
  HKWorkoutSessionDelegate {
  private let healthStore = HKHealthStore()
  private let stateQueue = DispatchQueue(label: "com.lucidtlr.watch.healthKitHeartRateProvider")
  private var bufferedSamples: [WatchHeartRateSample] = []
  private var queryAnchor: HKQueryAnchor?
  private var anchoredQuery: HKAnchoredObjectQuery?
  private var workoutSession: HKWorkoutSession?
  private var authorizationGranted = false
  private var latestSampleAt: Date?
  private var latestBpmValue: Double?
  private var lastErrorMessage: String?
  private var workoutStateLabel = "not_started"

  var healthKitAuthorization: WatchHealthKitAuthorization {
    guard HKHealthStore.isHealthDataAvailable(), let heartRateType else {
      return .unavailable
    }

    if stateQueue.sync(execute: { authorizationGranted }) {
      return .authorized
    }

    switch healthStore.authorizationStatus(for: heartRateType) {
    case .notDetermined:
      return .notDetermined
    case .sharingDenied:
      return .denied
    case .sharingAuthorized:
      return .authorized
    @unknown default:
      return .restricted
    }
  }

  var workoutRuntimeAvailable: Bool {
    HKHealthStore.isHealthDataAvailable() && heartRateType != nil
  }

  var latestBeatsPerMinute: Double? {
    stateQueue.sync { latestBpmValue }
  }

  var sampleCount: Int {
    stateQueue.sync { bufferedSamples.count }
  }

  var lastError: String? {
    stateQueue.sync { lastErrorMessage }
  }

  var workoutState: String {
    stateQueue.sync { workoutStateLabel }
  }

  private var heartRateType: HKQuantityType? {
    HKObjectType.quantityType(forIdentifier: .heartRate)
  }

  func requestAuthorization() async throws -> WatchHealthKitAuthorization {
    guard HKHealthStore.isHealthDataAvailable() else {
      throw HealthKitHeartRateProviderError.healthDataUnavailable
    }

    guard let heartRateType else {
      throw HealthKitHeartRateProviderError.heartRateTypeUnavailable
    }

    return try await withCheckedThrowingContinuation { continuation in
      healthStore.requestAuthorization(toShare: [], read: [heartRateType]) { [weak self] success, error in
        self?.stateQueue.async {
          self?.authorizationGranted = success && error == nil
          self?.lastErrorMessage = error?.localizedDescription
        }

        if success, error == nil {
          continuation.resume(returning: .authorized)
        } else {
          continuation.resume(
            throwing: HealthKitHeartRateProviderError.authorizationDenied(
              error?.localizedDescription
            )
          )
        }
      }
    }
  }

  func startWorkoutRuntime(at startDate: Date) throws {
    guard workoutRuntimeAvailable else {
      throw HealthKitHeartRateProviderError.healthDataUnavailable
    }

    let authorization = healthKitAuthorization
    guard authorization == .authorized else {
      throw HealthKitHeartRateProviderError.authorizationDenied(authorization.rawValue)
    }

    let configuration = HKWorkoutConfiguration()
    configuration.activityType = .mindAndBody
    configuration.locationType = .unknown

    do {
      let session = try HKWorkoutSession(healthStore: healthStore, configuration: configuration)
      session.delegate = self
      workoutSession = session
      session.startActivity(with: startDate)
      startHeartRateQuery(startDate: startDate)
    } catch {
      stateQueue.async {
        self.lastErrorMessage = error.localizedDescription
      }
      throw HealthKitHeartRateProviderError.workoutRuntimeUnavailable(error.localizedDescription)
    }
  }

  func stopWorkoutRuntime(at endDate: Date) {
    if let anchoredQuery {
      healthStore.stop(anchoredQuery)
    }

    anchoredQuery = nil
    workoutSession?.end()
    workoutSession = nil
  }

  func lastSampleFreshnessSeconds(at date: Date) -> TimeInterval? {
    stateQueue.sync {
      latestSampleAt.map { max(0, date.timeIntervalSince($0)) }
    }
  }

  func samples(from start: Date, to end: Date) -> [WatchHeartRateSample] {
    stateQueue.sync {
      bufferedSamples.filter { $0.timestamp >= start && $0.timestamp < end }
    }
  }

  func workoutSession(
    _ workoutSession: HKWorkoutSession,
    didChangeTo toState: HKWorkoutSessionState,
    from fromState: HKWorkoutSessionState,
    date: Date
  ) {
    stateQueue.async {
      self.workoutStateLabel = Self.label(for: toState)
    }
  }

  func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
    stateQueue.async {
      self.lastErrorMessage = error.localizedDescription
      self.workoutStateLabel = "failed"
    }
  }

  private func startHeartRateQuery(startDate: Date) {
    guard let heartRateType else {
      return
    }

    let predicate = HKQuery.predicateForSamples(
      withStart: startDate,
      end: nil,
      options: .strictStartDate
    )
    let query = HKAnchoredObjectQuery(
      type: heartRateType,
      predicate: predicate,
      anchor: queryAnchor,
      limit: HKObjectQueryNoLimit
    ) { [weak self] _, samples, _, newAnchor, error in
      self?.handleHeartRateQuery(samples: samples, anchor: newAnchor, error: error)
    }

    query.updateHandler = { [weak self] _, samples, _, newAnchor, error in
      self?.handleHeartRateQuery(samples: samples, anchor: newAnchor, error: error)
    }

    anchoredQuery = query
    healthStore.execute(query)
  }

  private func handleHeartRateQuery(
    samples: [HKSample]?,
    anchor: HKQueryAnchor?,
    error: Error?
  ) {
    if let error {
      stateQueue.async {
        self.lastErrorMessage = error.localizedDescription
      }
      return
    }

    let unit = HKUnit.count().unitDivided(by: .minute())
    let heartRateSamples = (samples ?? []).compactMap { sample -> WatchHeartRateSample? in
      guard let quantitySample = sample as? HKQuantitySample else {
        return nil
      }

      return WatchHeartRateSample(
        timestamp: quantitySample.startDate,
        beatsPerMinute: quantitySample.quantity.doubleValue(for: unit)
      )
    }

    stateQueue.async {
      self.queryAnchor = anchor
      self.bufferedSamples.append(contentsOf: heartRateSamples)

      if let latest = heartRateSamples.max(by: { $0.timestamp < $1.timestamp }) {
        self.latestSampleAt = latest.timestamp
        self.latestBpmValue = latest.beatsPerMinute
      }

      self.pruneSamples(before: Date().addingTimeInterval(-12 * 60 * 60))
    }
  }

  private func pruneSamples(before cutoff: Date) {
    bufferedSamples.removeAll { $0.timestamp < cutoff }
  }

  private static func label(for state: HKWorkoutSessionState) -> String {
    switch state {
    case .notStarted:
      return "not_started"
    case .running:
      return "running"
    case .ended:
      return "ended"
    case .paused:
      return "paused"
    case .prepared:
      return "prepared"
    case .stopped:
      return "stopped"
    @unknown default:
      return "unknown"
    }
  }
}
