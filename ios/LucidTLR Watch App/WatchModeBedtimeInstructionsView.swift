import SwiftUI

struct WatchModeBedtimeInstructionsView: View {
  private let primaryText = Color(white: 0.68)
  private let secondaryText = Color(white: 0.44)

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 8) {
        Text("Before sleep")
          .font(.caption)
          .fontWeight(.semibold)
          .foregroundStyle(primaryText)
          .accessibilityAddTraits(.isHeader)

        instruction("Turn on Theater Mode.")
        instruction("Keep Low Power Mode off.")
        instruction("Start with Watch charged.")
        instruction("The screen will stay black during the night.")
        instruction("Tap the screen to reveal controls.")
        instruction("Haptic cueing is the default.")
      }
      .padding(.horizontal, 10)
      .padding(.vertical, 8)
    }
    .scrollIndicators(.hidden)
    .background(Color.black.ignoresSafeArea())
  }

  private func instruction(_ text: String) -> some View {
    Text(text)
      .font(.caption2)
      .foregroundStyle(secondaryText)
      .fixedSize(horizontal: false, vertical: true)
  }
}

#if DEBUG
struct WatchModeBedtimeInstructionsView_Previews: PreviewProvider {
  static var previews: some View {
    WatchModeBedtimeInstructionsView()
  }
}
#endif
