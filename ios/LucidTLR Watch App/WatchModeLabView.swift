#if DEBUG || EXPO_CONFIGURATION_DEBUG || LUCIDTLR_INTERNAL_TESTFLIGHT_LAB
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
        Text("Internal TestFlight Lab")
          .font(.caption)
          .fontWeight(.semibold)
          .accessibilityAddTraits(.isHeader)

        Text("Synthetic transport drills plus device-only real-provider forced-cue sessions. Public Watch Mode remains disabled. No uploads or package deletion.")
          .font(.caption2)
          .foregroundStyle(.secondary)

        Button("Bedtime instructions") {
          viewModel.showInstructions()
        }
        Button("Commit synthetic TLR plan") {
          viewModel.commitSyntheticTlrPlan()
        }
        Button("Run 10-minute synthetic TLR without preflight") {
          viewModel.runTenMinuteTlrSessionWithoutPreflight()
        }
        Button("Run 10-minute synthetic TLR with preflight") {
          viewModel.runTenMinuteTlrSessionWithPreflight()
        }
        Button("Run synthetic sleep_log with preflight") {
          viewModel.runTenMinuteSleepLogSession()
        }
        Stepper(
          value: Binding(
            get: { viewModel.forcedCueAfterMinutes },
            set: { viewModel.forcedCueAfterMinutes = $0 }
          ),
          in: 1...90,
          step: 1
        ) {
          Text("forced cue +\(viewModel.forcedCueAfterMinutes) min")
        }
        .font(.caption2)
        Button("Run real-provider session (forced cue)") {
          viewModel.runRealProviderForcedCueSession()
        }
        Button("End real-provider session -> transfer") {
          viewModel.endRealProviderSessionAndTransfer()
        }
        Button("Enter black sleep shield") {
          viewModel.enterSleepShield()
        }
        Button("Force seal package") {
          viewModel.forceSealPackage()
        }

        Divider()

        Text("Recovery actions")
          .font(.caption2)
          .fontWeight(.semibold)

        Button("Recover current synthetic session") {
          viewModel.recoverCurrentSyntheticSession()
        }
        Button("Seal current synthetic session") {
          viewModel.sealCurrentSyntheticSession()
        }
        Button("Record synthetic ack") {
          viewModel.recordSyntheticAck()
        }
        Button("Discard Watch transport/session state") {
          viewModel.discardCurrentSyntheticSessionWithExplicitConfirmation()
        }

        Divider()

        Text("Transport -- synthetic only")
          .font(.caption2)
          .fontWeight(.semibold)

        Button("Activate transport") {
          viewModel.activateTransport()
        }
        Toggle(
          "auto baseline",
          isOn: Binding(
            get: { viewModel.autoBaselineEnabled },
            set: { viewModel.setAutoBaselineEnabled($0) }
          )
        )
        .font(.caption2)
        Button("Run Watch baseline loop") {
          viewModel.runWatchBaselineTransportLoop()
        }
        Button("Check/pull staged synthetic plan") {
          viewModel.checkOrPullStagedSyntheticPlan()
        }
        Button("Commit staged plan") {
          viewModel.commitStagedTransportPlan()
        }
        Button("Send commit receipt") {
          viewModel.sendTransportCommitReceipt()
        }
        Button("Send status snapshot") {
          viewModel.sendTransportStatusSnapshot()
        }
        Button("Transfer sealed synthetic package") {
          viewModel.transferSealedSyntheticPackage()
        }
        Button("Retry package transfer") {
          viewModel.retryTransportPackageTransfer()
        }
        Button("Record received ack") {
          viewModel.recordReceivedTransportAck()
        }
        Button("Reload current session index") {
          viewModel.reloadTransportCurrentSessionIndex()
        }

        Divider()

        Text("Preflight fixtures")
          .font(.caption2)
          .fontWeight(.semibold)

        Button("Show all-pass preflight") {
          viewModel.showPreflight(.allPass)
        }
        Button("Simulate low battery") {
          viewModel.showPreflight(.lowBattery)
        }
        Button("Simulate Low Power Mode") {
          viewModel.showPreflight(.lowPowerModeOn)
        }
        Button("Simulate missing HealthKit") {
          viewModel.showPreflight(.missingHealthAuthorization)
        }
        Button("Simulate missing motion") {
          viewModel.showPreflight(.missingMotion)
        }
        Button("Simulate missing cue output") {
          viewModel.showPreflight(.missingCueOutput)
        }
        Button("Simulate missing audio preflight") {
          viewModel.showPreflight(.missingAudioPreflight)
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
