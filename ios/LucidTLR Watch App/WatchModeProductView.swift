#if DEBUG || EXPO_CONFIGURATION_DEBUG || LUCIDTLR_INTERNAL_TESTFLIGHT_LAB
import SwiftUI

struct WatchModeProductView: View {
  @ObservedObject private var controller = WatchNightSessionController.shared
  @State private var discardConfirmationVisible = false
  @State private var discardSyncPendingConfirmationVisible = false
  let onShowLab: () -> Void

  var body: some View {
    switch controller.surface {
    case .waitingForPlan:
      waitingForPlan
    case .blocked:
      statusSurface(title: "Start blocked")
    case .sleepShield:
      if let sleepShieldViewModel = controller.sleepShieldViewModel {
        SleepShieldView(viewModel: sleepShieldViewModel)
      } else {
        statusSurface(title: "Watch Mode running")
      }
    case .syncPending:
      syncPendingSurface
    case .interrupted:
      interruptedSurface
    }
  }

  private var syncPendingSurface: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 8) {
        Text("Sync pending")
          .font(.caption)
          .fontWeight(.semibold)
          .accessibilityAddTraits(.isHeader)

        Text(controller.statusMessage)
          .font(.caption2)
          .foregroundStyle(.secondary)
          .fixedSize(horizontal: false, vertical: true)

        Text("Open the phone app to finish syncing this night.")
          .font(.caption2)
          .foregroundStyle(.secondary)
          .fixedSize(horizontal: false, vertical: true)

        Button("Discard Night on Watch", role: .destructive) {
          discardSyncPendingConfirmationVisible = true
        }
        .font(.caption2)
        .confirmationDialog(
          "Discard this night?",
          isPresented: $discardSyncPendingConfirmationVisible,
          titleVisibility: .visible
        ) {
          Button("Discard Night", role: .destructive) {
            controller.discardSyncPendingSessionWithExplicitConfirmation()
          }
          Button("Cancel", role: .cancel) {}
        } message: {
          Text("Only discard if the phone can no longer sync this night (for example after reinstalling the phone app). The night's data files stay on the Watch but will not sync.")
        }

        Button("Internal Lab") {
          onShowLab()
        }
        .font(.caption2)
      }
      .padding(.horizontal, 10)
      .padding(.vertical, 8)
    }
    .background(Color.black.ignoresSafeArea())
    .onAppear {
      controller.refreshProductSurface()
    }
  }

  private var interruptedSurface: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 8) {
        Text("Session interrupted")
          .font(.caption)
          .fontWeight(.semibold)
          .accessibilityAddTraits(.isHeader)

        Text(controller.statusMessage)
          .font(.caption2)
          .foregroundStyle(.secondary)
          .fixedSize(horizontal: false, vertical: true)

        Button("Discard Session on Watch", role: .destructive) {
          discardConfirmationVisible = true
        }
        .font(.caption2)
        .confirmationDialog(
          "Discard this session?",
          isPresented: $discardConfirmationVisible,
          titleVisibility: .visible
        ) {
          Button("Discard Session", role: .destructive) {
            controller.discardInterruptedSessionWithExplicitConfirmation()
          }
          Button("Cancel", role: .cancel) {}
        } message: {
          Text("The interrupted night cannot be resumed. Discarding marks it ended on this Watch; no data files are deleted.")
        }

        Button("Internal Lab") {
          onShowLab()
        }
        .font(.caption2)
      }
      .padding(.horizontal, 10)
      .padding(.vertical, 8)
    }
    .background(Color.black.ignoresSafeArea())
  }

  private var waitingForPlan: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 8) {
        Text("Waiting for plan from phone")
          .font(.caption)
          .fontWeight(.semibold)
          .accessibilityAddTraits(.isHeader)

        WatchModeBedtimeInstructionsView()

        if let lastStartFailure = controller.lastStartFailure {
          startFailureText(lastStartFailure)
        } else {
          Text(controller.statusMessage)
            .font(.caption2)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
        }

        Button("Internal Lab") {
          onShowLab()
        }
        .font(.caption2)
      }
      .padding(.horizontal, 10)
      .padding(.vertical, 8)
    }
    .background(Color.black.ignoresSafeArea())
    .onAppear {
      controller.refreshProductSurface()
    }
  }

  private func statusSurface(title: String) -> some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 7) {
        Text(title)
          .font(.caption)
          .fontWeight(.semibold)
          .accessibilityAddTraits(.isHeader)

        Text(controller.statusMessage)
          .font(.caption2)
          .foregroundStyle(.secondary)
          .fixedSize(horizontal: false, vertical: true)

        if let lastStartFailure = controller.lastStartFailure {
          startFailureText(lastStartFailure)
        }

        ForEach(controller.statusRows) { row in
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

        Button("Internal Lab") {
          onShowLab()
        }
        .font(.caption2)
      }
      .padding(.horizontal, 10)
      .padding(.vertical, 8)
    }
    .background(Color.black.ignoresSafeArea())
    .onAppear {
      controller.refreshProductSurface()
    }
  }

  private func startFailureText(_ failure: WatchNightSessionStartFailure) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      Text("Last start failure")
        .font(.caption2)
        .foregroundStyle(.secondary)
      Text("\(failure.occurredAt): \(failure.reason)")
        .font(.caption2)
        .fixedSize(horizontal: false, vertical: true)
    }
  }
}

struct WatchModeProductView_Previews: PreviewProvider {
  static var previews: some View {
    WatchModeProductView(onShowLab: {})
  }
}
#endif
