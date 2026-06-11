#if DEBUG || EXPO_CONFIGURATION_DEBUG || LUCIDTLR_INTERNAL_TESTFLIGHT_LAB
import Combine
import Foundation

@MainActor
final class WatchAutoBaselineController: ObservableObject {
  static let shared = WatchAutoBaselineController()
  static let autoBaselineEnabledKey = "lucidtlr.watchLab.autoBaselineEnabled.v1"

  @Published private(set) var lastRunSummary = "none"
  @Published private(set) var isAutoBaselineEnabled: Bool

  private let defaults: UserDefaults
  private let coordinator: WatchTransportCoordinator
  private let runner: WatchBaselineLoopRunner
  private var isRunning = false

  init(
    defaults: UserDefaults = .standard,
    coordinator: WatchTransportCoordinator = .shared,
    runner: WatchBaselineLoopRunner = WatchBaselineLoopRunner()
  ) {
    self.defaults = defaults
    self.coordinator = coordinator
    self.runner = runner

    if defaults.object(forKey: Self.autoBaselineEnabledKey) == nil {
      isAutoBaselineEnabled = true
      defaults.set(true, forKey: Self.autoBaselineEnabledKey)
    } else {
      isAutoBaselineEnabled = defaults.bool(forKey: Self.autoBaselineEnabledKey)
    }
  }

  func start() {
    coordinator.onNewStagedPlan = { [weak self] stagedPlan in
      Task { @MainActor in
        self?.runForNewStagedPlan(stagedPlan)
      }
    }

    do {
      try coordinator.activate()
      coordinator.refreshStatus()
    } catch {
      lastRunSummary = "activation error: \(String(describing: error))"
    }
  }

  func setAutoBaselineEnabled(_ isEnabled: Bool) {
    isAutoBaselineEnabled = isEnabled
    defaults.set(isEnabled, forKey: Self.autoBaselineEnabledKey)
  }

  private func runForNewStagedPlan(_ stagedPlan: WatchTransportStagedPlan) {
    guard WatchNightSessionController.isSyntheticLabPlan(stagedPlan.plan) else {
      WatchNightSessionController.shared.startProductSession(stagedPlan)
      lastRunSummary = "\(stagedPlan.sessionId): routed real product plan"
      return
    }

    guard isAutoBaselineEnabled else {
      lastRunSummary = "\(stagedPlan.sessionId): disabled"
      return
    }

    guard !isRunning else {
      lastRunSummary = "\(stagedPlan.sessionId): already running"
      return
    }

    isRunning = true
    defer {
      isRunning = false
    }

    do {
      let result = try runner.run()
      lastRunSummary = "\(result.plan.sessionId): ok"
    } catch {
      lastRunSummary = "\(stagedPlan.sessionId): error \(String(describing: error))"
    }
  }
}
#endif
