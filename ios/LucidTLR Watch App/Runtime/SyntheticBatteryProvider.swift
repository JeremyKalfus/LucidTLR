import Foundation

struct SyntheticBatteryProvider: BatteryProviding, BatteryStatusProviding {
  let startLevel: Double
  let drainPerHour: Double

  func batteryStatus(at date: Date) -> WatchBatteryStatus {
    WatchBatteryStatus(level: startLevel, evaluatedAt: date)
  }

  func snapshot(at date: Date, elapsedSessionSeconds: TimeInterval) -> WatchBatterySnapshot {
    let drained = drainPerHour * (elapsedSessionSeconds / 3600.0)
    return WatchBatterySnapshot(
      timestamp: date,
      level: max(0, min(1, startLevel - drained))
    )
  }
}

struct SyntheticPowerModeProvider: PowerModeProviding {
  let isLowPowerModeEnabled: Bool
}
