import SwiftUI

struct ContentView: View {
  @EnvironmentObject private var manager: WatchSessionManager

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 10) {
        VStack(alignment: .leading, spacing: 4) {
          Text(manager.displayState.title)
            .font(.headline)
          Text(manager.displayState.detail)
            .font(.caption2)
            .foregroundStyle(.secondary)
        }

        Grid(alignment: .leading, horizontalSpacing: 6, verticalSpacing: 4) {
          row("connection", manager.isConnected ? "connected" : "connecting")
          row("plan", manager.planText)
          row("epochs", String(manager.epochCount))
          row("battery", manager.batteryText)
          row("sensors", manager.sensorQuality)
          row("REM", manager.latestRemProbabilityText)
          row("cueing", manager.cueingEnabled ? "enabled" : manager.latestCueDecisionReason)
          row("sync", manager.syncPendingCount == 0 ? "clear" : "\(manager.syncPendingCount) pending")
        }

        HStack(spacing: 8) {
          Button("Start") {
            manager.startFromWatch()
          }
          .disabled(!manager.canStartFromWatch)

          Button("Stop") {
            manager.stopFromWatch()
          }
          .disabled(!manager.isRunning)
        }
        .font(.caption)
      }
      .padding()
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  private func row(_ label: String, _ value: String) -> some View {
    GridRow {
      Text(label)
        .font(.caption2)
        .foregroundStyle(.secondary)
      Text(value)
        .font(.caption2)
        .lineLimit(2)
    }
  }
}
