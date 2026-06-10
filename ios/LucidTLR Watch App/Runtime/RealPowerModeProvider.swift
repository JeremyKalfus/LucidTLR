import Foundation

struct RealPowerModeProvider: PowerModeProviding {
  var isLowPowerModeEnabled: Bool {
    ProcessInfo.processInfo.isLowPowerModeEnabled
  }
}
