import SwiftUI

struct ContentView: View {
  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("LucidTLR Watch")
        .font(.headline)

      Text("Watch Mode is being rebuilt.")
        .font(.caption)

      Text("Use Phone Mode on iPhone for tonight.")
        .font(.caption2)
        .foregroundStyle(.secondary)
    }
    .padding()
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}
