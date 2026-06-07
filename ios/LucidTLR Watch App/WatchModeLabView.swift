#if DEBUG || EXPO_CONFIGURATION_DEBUG
import SwiftUI

struct WatchModeLabView: View {
  @StateObject private var viewModel = WatchModeLabViewModel()

  var body: some View {
    switch viewModel.displayMode {
    case .menu:
      labMenu
    case .instructions:
      instructions
    case .sleepShield:
      if let sleepShieldViewModel = viewModel.sleepShieldViewModel {
        SleepShieldView(viewModel: sleepShieldViewModel)
      } else {
        labMenu
      }
    }
  }

  private var labMenu: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 8) {
        Text("Watch Mode Lab -- synthetic only")
          .font(.caption)
          .fontWeight(.semibold)
          .accessibilityAddTraits(.isHeader)

        Text("No real Watch sensors, workout runtime, WatchConnectivity, haptics, audio, or package transfer. Public Watch Mode remains disabled.")
          .font(.caption2)
          .foregroundStyle(.secondary)

        Button("Bedtime instructions") {
          viewModel.showInstructions()
        }
        Button("Commit synthetic TLR plan") {
          viewModel.commitSyntheticTlrPlan()
        }
        Button("Run 10-minute synthetic TLR") {
          viewModel.runTenMinuteTlrSession()
        }
        Button("Run synthetic sleep_log") {
          viewModel.runTenMinuteSleepLogSession()
        }
        Button("Enter black sleep shield") {
          viewModel.enterSleepShield()
        }
        Button("Force seal package") {
          viewModel.forceSealPackage()
        }

        Divider()

        Text(viewModel.statusMessage)
          .font(.caption2)
          .foregroundStyle(.secondary)
          .fixedSize(horizontal: false, vertical: true)

        ForEach(viewModel.statusRows) { row in
          VStack(alignment: .leading, spacing: 1) {
            Text(row.label)
              .font(.caption2)
              .foregroundStyle(.secondary)
            Text(row.value)
              .font(.caption2)
              .lineLimit(2)
              .minimumScaleFactor(0.7)
          }
        }
      }
      .padding(.horizontal, 10)
      .padding(.vertical, 8)
    }
  }

  private var instructions: some View {
    VStack(alignment: .leading, spacing: 8) {
      WatchModeBedtimeInstructionsView()

      Button("Back to lab") {
        viewModel.showMenu()
      }
      .font(.caption2)
    }
    .background(Color.black.ignoresSafeArea())
  }
}

struct WatchModeLabView_Previews: PreviewProvider {
  static var previews: some View {
    WatchModeLabView()
  }
}
#endif
