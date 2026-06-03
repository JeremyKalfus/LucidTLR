import Foundation

enum WatchRuntimeDisplayState: Equatable {
  case noPlan
  case ready
  case starting
  case running
  case cueWindowPending
  case cueingEnabled
  case cueingDisabledLowBattery
  case syncPending
  case completed
  case failed(String)

  var title: String {
    switch self {
    case .noPlan:
      return "No plan"
    case .ready:
      return "Ready"
    case .starting:
      return "Starting"
    case .running:
      return "Running"
    case .cueWindowPending:
      return "Cue window pending"
    case .cueingEnabled:
      return "Cueing enabled"
    case .cueingDisabledLowBattery:
      return "Cueing disabled"
    case .syncPending:
      return "Sync pending"
    case .completed:
      return "Completed"
    case .failed:
      return "Failed"
    }
  }

  var statusState: String {
    switch self {
    case .noPlan:
      return "no_plan"
    case .ready:
      return "ready"
    case .starting:
      return "starting"
    case .running:
      return "running"
    case .cueWindowPending:
      return "cue_window_pending"
    case .cueingEnabled:
      return "cueing_enabled"
    case .cueingDisabledLowBattery:
      return "cueing_disabled_low_battery"
    case .syncPending:
      return "sync_pending"
    case .completed:
      return "completed"
    case .failed:
      return "failed"
    }
  }

  var detail: String {
    switch self {
    case .noPlan:
      return "Send a Watch Mode plan from iPhone."
    case .ready:
      return "Plan stored on Watch."
    case .starting:
      return "Opening sensor session."
    case .running:
      return "Collecting Watch epochs."
    case .cueWindowPending:
      return "Waiting for cue window."
    case .cueingEnabled:
      return "REM policy can cue."
    case .cueingDisabledLowBattery:
      return "Battery below plan threshold."
    case .syncPending:
      return "Waiting to transfer logs."
    case .completed:
      return "Session stopped."
    case .failed(let reason):
      return reason
    }
  }
}
