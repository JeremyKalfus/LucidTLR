import SwiftUI

struct ContentView: View {
  @State private var showingSyntheticLab = false

  var body: some View {
    #if DEBUG || EXPO_CONFIGURATION_DEBUG || LUCIDTLR_INTERNAL_TESTFLIGHT_LAB
    if showingSyntheticLab {
      WatchModeLabView()
    } else {
      placeholder
    }
    #else
    placeholder
    #endif
  }

  private var placeholder: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("LucidTLR Watch")
        .font(.headline)

      Text("Watch Mode is being rebuilt.")
        .font(.caption)

      Text("Use Phone Mode on iPhone for tonight.")
        .font(.caption2)
        .foregroundStyle(.secondary)

      #if DEBUG || EXPO_CONFIGURATION_DEBUG || LUCIDTLR_INTERNAL_TESTFLIGHT_LAB
      Button("Internal Lab") {
        showingSyntheticLab = true
      }
      .font(.caption2)
      #endif
    }
    .padding()
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}
