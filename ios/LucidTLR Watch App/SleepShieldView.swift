import SwiftUI

struct SleepShieldView: View {
  @ObservedObject var viewModel: SleepShieldViewModel

  var body: some View {
    ZStack {
      Color.black.ignoresSafeArea()

      if viewModel.controlsVisible {
        DimRuntimeControlsView(viewModel: viewModel)
      }
    }
    .contentShape(Rectangle())
    .onTapGesture {
      viewModel.revealControls()
    }
    .accessibilityElement(children: viewModel.controlsVisible ? .contain : .ignore)
    .accessibilityLabel(viewModel.controlsVisible ? "LucidTLR Watch controls" : "LucidTLR sleep shield")
  }
}

#if DEBUG
struct SleepShieldView_Previews: PreviewProvider {
  static var previews: some View {
    SleepShieldView(
      viewModel: SleepShieldViewModel(
        snapshot: .placeholder,
        interactionLogger: { _ in }
      )
    )
  }
}
#endif
