import Combine
import Foundation

struct SleepShieldRuntimeSnapshot: Equatable {
  let sessionTitle: String
  let batteryLevel: Double?
  let sensorQuality: String
  let epochCount: Int
  let cueingState: String
  let latestCueDecisionReason: String
  let packageState: String
  let isPaused: Bool
  let allowsTlrControls: Bool

  static let placeholder = SleepShieldRuntimeSnapshot(
    sessionTitle: "LucidTLR running",
    batteryLevel: nil,
    sensorQuality: "unknown",
    epochCount: 0,
    cueingState: "not_started",
    latestCueDecisionReason: "not_started",
    packageState: "not_sealed",
    isPaused: false,
    allowsTlrControls: true
  )

  static func from(coordinator: WatchSessionCoordinator) -> SleepShieldRuntimeSnapshot {
    let isSleepLog = coordinator.sessionType == "sleep_log"
    return SleepShieldRuntimeSnapshot(
      sessionTitle: isSleepLog ? "Sleep log running" : "LucidTLR running",
      batteryLevel: coordinator.latestBatteryLevel,
      sensorQuality: coordinator.latestSensorQuality,
      epochCount: coordinator.epochCount,
      cueingState: isSleepLog ? "cueing off" : coordinator.latestCueDecisionReason,
      latestCueDecisionReason: coordinator.latestCueDecisionReason,
      packageState: coordinator.packageState,
      isPaused: coordinator.isTlrPaused,
      allowsTlrControls: !isSleepLog
    )
  }
}

final class SleepShieldViewModel: ObservableObject {
  @Published private(set) var controlsVisible = false
  @Published private(set) var wakeConfirmationVisible = false
  @Published private(set) var snapshot: SleepShieldRuntimeSnapshot

  let autoHideSeconds: TimeInterval

  private let interactionLogger: (String) -> Void
  private let pushBackAction: () -> Void
  private let pauseResumeAction: () -> Void
  private let wakeAction: () -> Void
  private var autoHideWorkItem: DispatchWorkItem?

  init(
    snapshot: SleepShieldRuntimeSnapshot,
    autoHideSeconds: TimeInterval = 10,
    interactionLogger: @escaping (String) -> Void,
    pushBackAction: @escaping () -> Void = {},
    pauseResumeAction: @escaping () -> Void = {},
    // No default: a silently-empty wake action trapped a real overnight
    // session on the shield twice. Every caller must decide what Confirm
    // Wake does.
    wakeAction: @escaping () -> Void
  ) {
    self.snapshot = snapshot
    self.autoHideSeconds = autoHideSeconds
    self.interactionLogger = interactionLogger
    self.pushBackAction = pushBackAction
    self.pauseResumeAction = pauseResumeAction
    self.wakeAction = wakeAction
  }

  // No coordinator-only convenience initializer: a default wake action that
  // merely seals (without ending providers, recording the sealed package,
  // transferring, and exiting the shield) trapped a real overnight session on
  // the shield. Every creation site must supply an explicit wakeAction that
  // runs the full session end path.

  deinit {
    autoHideWorkItem?.cancel()
  }

  func updateSnapshot(_ snapshot: SleepShieldRuntimeSnapshot) {
    self.snapshot = snapshot
  }

  func revealControls() {
    logInteraction("watch_user_interaction")
    controlsVisible = true
    wakeConfirmationVisible = false
    scheduleAutoHide()
  }

  func pushBackThirtyMinutes() {
    logInteraction("watch_push_back_30m")
    pushBackAction()
    scheduleAutoHide()
  }

  func togglePauseResume() {
    logInteraction(snapshot.isPaused ? "watch_resume_tlr" : "watch_pause_tlr")
    pauseResumeAction()
    snapshot = SleepShieldRuntimeSnapshot(
      sessionTitle: snapshot.sessionTitle,
      batteryLevel: snapshot.batteryLevel,
      sensorQuality: snapshot.sensorQuality,
      epochCount: snapshot.epochCount,
      cueingState: snapshot.cueingState,
      latestCueDecisionReason: snapshot.latestCueDecisionReason,
      packageState: snapshot.packageState,
      isPaused: !snapshot.isPaused,
      allowsTlrControls: snapshot.allowsTlrControls
    )
    scheduleAutoHide()
  }

  func requestWake() {
    logInteraction("watch_wake_requested")
    wakeConfirmationVisible = true
    scheduleAutoHide()
  }

  func cancelWake() {
    logInteraction("watch_wake_cancelled")
    wakeConfirmationVisible = false
    scheduleAutoHide()
  }

  func confirmWake() {
    logInteraction("watch_wake_confirmed")
    wakeAction()
    wakeConfirmationVisible = false
    controlsVisible = false
    cancelAutoHide()
  }

  private func logInteraction(_ kind: String) {
    interactionLogger(kind)
  }

  private func scheduleAutoHide() {
    cancelAutoHide()

    let workItem = DispatchWorkItem { [weak self] in
      self?.controlsVisible = false
      self?.wakeConfirmationVisible = false
    }
    autoHideWorkItem = workItem
    DispatchQueue.main.asyncAfter(deadline: .now() + autoHideSeconds, execute: workItem)
  }

  private func cancelAutoHide() {
    autoHideWorkItem?.cancel()
    autoHideWorkItem = nil
  }
}
