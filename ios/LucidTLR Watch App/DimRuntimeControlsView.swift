import SwiftUI

struct DimRuntimeControlsView: View {
  @ObservedObject var viewModel: SleepShieldViewModel

  private let primaryText = Color(white: 0.46)
  private let secondaryText = Color(white: 0.32)
  private let buttonFill = Color(white: 0.12)

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 7) {
        Text(viewModel.snapshot.sessionTitle)
          .font(.caption)
          .fontWeight(.medium)
          .foregroundStyle(primaryText)
          .accessibilityAddTraits(.isHeader)

        statusRows

        Divider()
          .overlay(Color(white: 0.18))

        controlButtons
      }
      .padding(.horizontal, 10)
      .padding(.vertical, 8)
    }
    .scrollIndicators(.hidden)
    .background(Color.black)
  }

  private var statusRows: some View {
    VStack(alignment: .leading, spacing: 4) {
      dimStatusText("Battery \(formattedBattery)")
      dimStatusText("Sensors \(viewModel.snapshot.sensorQuality)")
      dimStatusText("Epochs \(viewModel.snapshot.epochCount)")
      dimStatusText("Cueing \(viewModel.snapshot.cueingState)")
      dimStatusText("Latest \(viewModel.snapshot.latestCueDecisionReason)")
      dimStatusText("Package \(viewModel.snapshot.packageState)")
    }
  }

  private var controlButtons: some View {
    VStack(alignment: .leading, spacing: 6) {
      dimButton("Push Back 30m", accessibilityLabel: "Push Back thirty minutes") {
        viewModel.pushBackThirtyMinutes()
      }
      .disabled(!viewModel.snapshot.allowsTlrControls)

      dimButton(
        viewModel.snapshot.isPaused ? "Resume TLR" : "Pause TLR",
        accessibilityLabel: viewModel.snapshot.isPaused ? "Resume TLR" : "Pause TLR"
      ) {
        viewModel.togglePauseResume()
      }
      .disabled(!viewModel.snapshot.allowsTlrControls)

      if viewModel.wakeConfirmationVisible {
        dimButton("Confirm Wake", accessibilityLabel: "Confirm wake and stop session") {
          viewModel.confirmWake()
        }

        dimButton("Cancel", accessibilityLabel: "Cancel wake confirmation") {
          viewModel.cancelWake()
        }
      } else {
        dimButton("Wake", accessibilityLabel: "Wake, requires confirmation") {
          viewModel.requestWake()
        }
      }
    }
  }

  private var formattedBattery: String {
    guard let batteryLevel = viewModel.snapshot.batteryLevel else {
      return "unknown"
    }

    return "\(Int((batteryLevel * 100).rounded()))%"
  }

  private func dimStatusText(_ text: String) -> some View {
    Text(text)
      .font(.caption2)
      .foregroundStyle(secondaryText)
      .lineLimit(1)
      .minimumScaleFactor(0.7)
  }

  private func dimButton(
    _ title: String,
    accessibilityLabel: String,
    action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      Text(title)
        .font(.caption2)
        .fontWeight(.medium)
        .foregroundStyle(primaryText)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .frame(maxWidth: .infinity, minHeight: 24)
        .background(buttonFill)
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
    }
    .buttonStyle(.plain)
    .accessibilityLabel(accessibilityLabel)
  }
}

#if DEBUG
struct DimRuntimeControlsView_Previews: PreviewProvider {
  static var previews: some View {
    DimRuntimeControlsView(
      viewModel: SleepShieldViewModel(
        snapshot: SleepShieldRuntimeSnapshot(
          sessionTitle: "LucidTLR running",
          batteryLevel: 0.82,
          sensorQuality: "good",
          epochCount: 20,
          cueingState: "rem_persistence_not_met",
          latestCueDecisionReason: "recent_user_interaction",
          packageState: "not_sealed",
          isPaused: false,
          allowsTlrControls: true
        ),
        interactionLogger: { _ in }
      )
    )
  }
}
#endif
