import Foundation
import WatchKit

struct RealBatteryProvider: BatteryProviding, BatteryStatusProviding {
  init() {
    WKInterfaceDevice.current().isBatteryMonitoringEnabled = true
  }

  func batteryStatus(at date: Date) -> WatchBatteryStatus {
    let rawLevel = WKInterfaceDevice.current().batteryLevel
    let level = rawLevel >= 0 ? Double(rawLevel) : nil

    return WatchBatteryStatus(level: level, evaluatedAt: date)
  }

  func snapshot(at date: Date, elapsedSessionSeconds: TimeInterval) -> WatchBatterySnapshot {
    WatchBatterySnapshot(
      timestamp: date,
      level: batteryStatus(at: date).level ?? 0
    )
  }
}
