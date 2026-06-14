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
  private var liveWorkoutBuilder: HKLiveWorkoutBuilder?
  private var authorizationGranted = false
  private var latestSampleAt: Date?
  private var latestBpmValue: Double?
  private var lastErrorMessage: String?
  private var workoutStateLabel = "not_started"
  var diagnosticSink: ((WatchRuntimeEventType, [String: WatchRuntimeJSONValue]) -> Void)?

  var healthKitAuthorization: WatchHealthKitAuthorization {
    guard HKHealthStore.isHealthDataAvailable(), heartRateType != nil else {
      return .unavailable
    }

    if stateQueue.sync(execute: { authorizationGranted }) {
      return .authorized
    }

    switch healthStore.authorizationStatus(for: workoutType) {
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

  private var workoutType: HKWorkoutType {
    HKObjectType.workoutType()
  }

  func requestAuthorization() async throws -> WatchHealthKitAuthorization {
    guard HKHealthStore.isHealthDataAvailable() else {
      throw HealthKitHeartRateProviderError.healthDataUnavailable
    }

    guard let heartRateType else {
      throw HealthKitHeartRateProviderError.heartRateTypeUnavailable
    }

    let workoutType = self.workoutType
    return try await withCheckedThrowingContinuation { continuation in
      healthStore.requestAuthorization(toShare: [workoutType], read: [heartRateType]) { [weak self] success, error in
        let workoutAuthorized = self?.healthStore.authorizationStatus(for: workoutType)
          == .sharingAuthorized
        self?.stateQueue.async {
          self?.authorizationGranted = success && error == nil && workoutAuthorized
          self?.lastErrorMessage = error?.localizedDescription
        }

        if success, error == nil, workoutAuthorized {
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

  func startWorkoutRuntime(at startDate: Date) async throws {
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
      let builder = session.associatedWorkoutBuilder()
      builder.dataSource = HKLiveWorkoutDataSource(
        healthStore: healthStore,
        workoutConfiguration: configuration
      )
      session.delegate = self
      workoutSession = session
      liveWorkoutBuilder = builder
      session.startActivity(with: startDate)
      do {
        try await builder.beginCollection(at: startDate)
        emitDiagnostic(
          .workoutBuilderCollectionStarted,
          payload: [
            "startedAt": .stringValue(WatchRuntimeDateFormat.string(from: startDate)),
          ]
        )
      } catch {
        stateQueue.async {
          self.lastErrorMessage = error.localizedDescription
        }
        emitDiagnostic(
          .workoutBuilderCollectionFailed,
          payload: [
            "error": .stringValue(error.localizedDescription),
            "startedAt": .stringValue(WatchRuntimeDateFormat.string(from: startDate)),
          ]
        )
        session.end()
        workoutSession = nil
        liveWorkoutBuilder = nil
        throw HealthKitHeartRateProviderError.workoutRuntimeUnavailable(error.localizedDescription)
      }
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
    let builder = liveWorkoutBuilder
    liveWorkoutBuilder = nil
    workoutSession?.end()
    workoutSession = nil

    if let builder {
      builder.endCollection(withEnd: endDate) { [weak self] _, error in
        if let error {
          self?.stateQueue.async {
            self?.lastErrorMessage = error.localizedDescription
          }
        }
        self?.emitDiagnostic(
          .workoutBuilderCollectionEnded,
          payload: [
            "endedAt": .stringValue(WatchRuntimeDateFormat.string(from: endDate)),
            "error": error.map { .stringValue($0.localizedDescription) } ?? .null,
          ]
        )
        builder.discardWorkout()
        self?.emitDiagnostic(
          .workoutBuilderDiscarded,
          payload: [
            "discardedAt": .stringValue(WatchRuntimeDateFormat.string(from: Date())),
          ]
        )
      }
    }
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
    emitDiagnostic(
      .workoutSessionStateChanged,
      payload: [
        "fromState": .stringValue(Self.label(for: fromState)),
        "toState": .stringValue(Self.label(for: toState)),
        "stateChangedAt": .stringValue(WatchRuntimeDateFormat.string(from: date)),
      ]
    )
  }

  func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
    stateQueue.async {
      self.lastErrorMessage = error.localizedDescription
      self.workoutStateLabel = "failed"
    }
    emitDiagnostic(
      .workoutSessionFailed,
      payload: ["error": .stringValue(error.localizedDescription)]
    )
  }

  private func emitDiagnostic(
    _ type: WatchRuntimeEventType,
    payload: [String: WatchRuntimeJSONValue]
  ) {
    diagnosticSink?(type, payload)
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
