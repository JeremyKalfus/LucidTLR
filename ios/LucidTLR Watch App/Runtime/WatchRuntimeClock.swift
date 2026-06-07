import Foundation

enum WatchRuntimeDateFormat {
  private static let formatter: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter
  }()

  private static let fallbackFormatter: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime]
    return formatter
  }()

  static func string(from date: Date) -> String {
    formatter.string(from: date)
  }

  static func date(from string: String) -> Date? {
    formatter.date(from: string) ?? fallbackFormatter.date(from: string)
  }
}

final class DeterministicWatchClock: AdjustableWatchClock {
  private(set) var now: Date

  init(start: Date) {
    now = start
  }

  func advance(by seconds: TimeInterval) {
    now = now.addingTimeInterval(seconds)
  }
}
