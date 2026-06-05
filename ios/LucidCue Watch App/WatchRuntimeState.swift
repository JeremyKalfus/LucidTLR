import Foundation

enum WatchRuntimeDisplayState: Equatable {
  case noPlan
  case startSyncWaiting
  case ready
  case starting
  case training
  case running
  case cueWindowPending
  case cueingEnabled
  case cueingDisabledLowBattery
  case waitingForPhoneSync
  case syncPending
  case completed
  case failed(String)

  var title: String {
    switch self {
    case .noPlan:
      return "No plan"
    case .startSyncWaiting:
      return "Sync phone"
    case .ready:
      return "Ready"
    case .starting:
      return "Starting"
    case .training:
      return "Training"
    case .running:
      return "Running"
    case .cueWindowPending:
      return "Cue window pending"
    case .cueingEnabled:
      return "Cueing enabled"
    case .cueingDisabledLowBattery:
      return "Cueing disabled"
    case .waitingForPhoneSync:
      return "Waiting for Phone Sync"
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
    case .startSyncWaiting:
      return "start_sync_waiting"
    case .ready:
      return "ready"
    case .starting:
      return "starting"
    case .training:
      return "training"
    case .running:
      return "running"
    case .cueWindowPending:
      return "cue_window_pending"
    case .cueingEnabled:
      return "cueing_enabled"
    case .cueingDisabledLowBattery:
      return "cueing_disabled_low_battery"
    case .waitingForPhoneSync:
      return "waiting_for_phone_sync"
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
    case .startSyncWaiting:
      return "Phone is waiting for Watch sync."
    case .ready:
      return "Plan stored on Watch."
    case .starting:
      return "Opening sensor session."
    case .training:
      return "Playing Watch training."
    case .running:
      return "Collecting Watch epochs."
    case .cueWindowPending:
      return "Waiting for cue window."
    case .cueingEnabled:
      return "REM policy can cue."
    case .cueingDisabledLowBattery:
      return "Battery below plan threshold."
    case .waitingForPhoneSync:
      return "Open LucidCue on iPhone to sync."
    case .syncPending:
      return "Waiting to transfer logs."
    case .completed:
      return "Session stopped."
    case .failed(let reason):
      return reason
    }
  }
}
