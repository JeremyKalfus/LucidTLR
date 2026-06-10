import Foundation

final class RealtimeWatchClock: AdjustableWatchClock {
  var now: Date {
    Date()
  }

  func advance(by seconds: TimeInterval) {
    // Real sessions advance with wall-clock time; deterministic tests use
    // DeterministicWatchClock.
  }
}
