import SwiftUI

@main
struct LucidCueWatchApp: App {
  @Environment(\.scenePhase) private var scenePhase
  @StateObject private var manager = WatchSessionManager()

  var body: some Scene {
    WindowGroup {
      ContentView()
        .environmentObject(manager)
        .onAppear {
          manager.watchAppBecameActive()
        }
        .onChange(of: scenePhase) { phase in
          if phase == .active {
            manager.watchAppBecameActive()
          } else {
            manager.watchAppBecameInactive()
          }
        }
    }
  }
}
