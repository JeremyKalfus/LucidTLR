import SwiftUI

@main
struct LucidTLRWatchApp: App {
  @Environment(\.scenePhase) private var scenePhase

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
        #if DEBUG || EXPO_CONFIGURATION_DEBUG || LUCIDTLR_INTERNAL_TESTFLIGHT_LAB
        .onChange(of: scenePhase) { _, phase in
          WatchNightSessionController.shared.recordAppLifecycle(
            phase: Self.scenePhaseLabel(phase)
          )
        }
        #endif
    }
  }

  private static func scenePhaseLabel(_ phase: ScenePhase) -> String {
    switch phase {
    case .active:
      return "active"
    case .inactive:
      return "inactive"
    case .background:
      return "background"
    @unknown default:
      return "unknown"
    }
  }
}
