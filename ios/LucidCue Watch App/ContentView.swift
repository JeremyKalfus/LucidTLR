import SwiftUI

struct ContentView: View {
  @EnvironmentObject private var manager: WatchSessionManager

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("LucidCue Watch")
        .font(.headline)
      Text(manager.statusText)
        .font(.footnote)
      Button("Start Watch Session") {
        manager.startSession()
      }
      .disabled(manager.isRunning)
      Button("Stop Watch Session") {
        manager.stopSession(reason: "watch_button")
      }
      .disabled(!manager.isRunning)
      Grid(alignment: .leading, horizontalSpacing: 6, verticalSpacing: 4) {
        row("connected", manager.isConnected ? "yes" : "no")
        row("session", manager.isRunning ? "running" : "idle")
        row("HR samples", String(manager.heartRateSampleCount))
        row("motion", String(manager.motionSampleCount))
        row("epochs", String(manager.epochCount))
        row("battery", manager.batteryText)
        row("quality", manager.sensorQuality)
      }
      Text("Start iPhone session first. Keep watch charged/worn.")
        .font(.caption2)
        .foregroundStyle(.secondary)
    }
    .padding()
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
