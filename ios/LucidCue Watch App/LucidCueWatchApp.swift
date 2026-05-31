import SwiftUI

@main
struct LucidCueWatchApp: App {
  @StateObject private var manager = WatchSessionManager()

  var body: some Scene {
    WindowGroup {
      ContentView()
        .environmentObject(manager)
    }
  }
}
