import SwiftUI

@main
struct LucidTLRWatchApp: App {
  init() {
    #if DEBUG || EXPO_CONFIGURATION_DEBUG || LUCIDTLR_INTERNAL_TESTFLIGHT_LAB
    Task { @MainActor in
      WatchAutoBaselineController.shared.start()
    }
    #endif
  }

  var body: some Scene {
    WindowGroup {
      ContentView()
    }
  }
}
