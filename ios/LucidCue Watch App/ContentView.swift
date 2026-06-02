import SwiftUI

struct ContentView: View {
  @EnvironmentObject private var manager: WatchSessionManager

  var body: some View {
    VStack(alignment: .center, spacing: 10) {
      if manager.isRunning {
        Text("TLR running")
          .font(.headline)
        Grid(alignment: .leading, horizontalSpacing: 6, verticalSpacing: 4) {
          row("connection", manager.isConnected ? "connected" : "connecting")
          row("session", manager.statusText)
          row("epochs", String(manager.epochCount))
        }
      } else {
        Text("Start TLR on phone")
          .font(.headline)
          .multilineTextAlignment(.center)
      }
    }
    .padding()
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }

  private func row(_ label: String, _ value: String) -> some View {
    GridRow {
      Text(label)
        .font(.caption2)
        .foregroundStyle(.secondary)
      Text(value)
        .font(.caption2)
    }
  }
}
