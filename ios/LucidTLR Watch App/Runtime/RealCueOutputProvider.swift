import AVFoundation
import Foundation
import WatchKit

enum RealCueOutputProviderError: Error, Equatable {
  case missingCueAsset(String)
  case playbackRejected
}

final class RealCueOutputProvider: CueOutputProviding, CueOutputCapabilityProviding {
  private let stateQueue = DispatchQueue(label: "com.lucidtlr.watch.realCueOutputProvider")
  private var activePlayers: [ObjectIdentifier: AVAudioPlayer] = [:]
  private(set) var lastCueStatus = "not_attempted"

  func cueOutputCapabilities(for plan: WatchRuntimePlanV3) -> WatchCueOutputCapabilities {
    let audioAvailable = plan.cueOutput.audioEnabled && cueAudioURL(for: plan) != nil

    return WatchCueOutputCapabilities(
      hapticOutputAvailable: plan.cueOutput.hapticEnabled,
      audioOutputAvailable: audioAvailable,
      hapticPreflightRequired: plan.cueOutput.hapticEnabled,
      hapticPreflightPassed: plan.cueOutput.hapticEnabled,
      audioPreflightRequired: plan.cueOutput.audioEnabled && plan.cueOutput.audioRequiresPreflight,
      audioPreflightPassed: !plan.cueOutput.audioEnabled || audioAvailable
    )
  }

  func deliverCue(plan: WatchRuntimePlanV3, at date: Date) -> WatchCueOutputResult {
    guard plan.cueOutput.hapticEnabled || plan.cueOutput.audioEnabled else {
      lastCueStatus = "cue_output_disabled"
      return WatchCueOutputResult(
        attempted: false,
        delivered: false,
        outputChannel: "none",
        failureReason: "cue_output_disabled"
      )
    }

    var deliveredChannels: [String] = []
    var failures: [String] = []

    if plan.cueOutput.audioEnabled {
      do {
        try playAudioCue(plan: plan)
        deliveredChannels.append("audio")
      } catch {
        failures.append("audio:\(String(describing: error))")
      }
    }

    if plan.cueOutput.hapticEnabled {
      WKInterfaceDevice.current().play(.notification)
      deliveredChannels.append("haptic")
    }

    let delivered = !deliveredChannels.isEmpty
    let outputChannel = primaryOutputChannel(
      plan: plan,
      deliveredChannels: deliveredChannels
    )
    lastCueStatus = delivered
      ? "delivered:\(deliveredChannels.joined(separator: "+"))"
      : "failed:\(failures.joined(separator: ","))"

    return WatchCueOutputResult(
      attempted: true,
      delivered: delivered,
      outputChannel: outputChannel,
      failureReason: delivered ? nil : failures.joined(separator: ",")
    )
  }

  func requiredCueAssetsPresent(for plan: WatchRuntimePlanV3) -> Bool {
    guard plan.cueOutput.audioEnabled else {
      return true
    }

    return cueAudioURL(for: plan) != nil
  }

  private func playAudioCue(plan: WatchRuntimePlanV3) throws {
    guard let url = cueAudioURL(for: plan) else {
      throw RealCueOutputProviderError.missingCueAsset(
        "\(plan.cue.resourceName).\(plan.cue.resourceExtension)"
      )
    }

    try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
    try AVAudioSession.sharedInstance().setActive(true)

    let player = try AVAudioPlayer(contentsOf: url)
    player.volume = 1
    player.prepareToPlay()

    guard player.play() else {
      throw RealCueOutputProviderError.playbackRejected
    }

    let playerId = ObjectIdentifier(player)
    stateQueue.async {
      self.activePlayers[playerId] = player
    }
    scheduleSoftFade(for: player, id: playerId, duration: plan.cue.durationSeconds)
  }

  private func cueAudioURL(for plan: WatchRuntimePlanV3) -> URL? {
    Bundle.main.url(
      forResource: plan.cue.resourceName,
      withExtension: plan.cue.resourceExtension
    )
  }

  private func primaryOutputChannel(
    plan: WatchRuntimePlanV3,
    deliveredChannels: [String]
  ) -> String {
    if deliveredChannels.contains(plan.cueOutput.defaultOutput) {
      return plan.cueOutput.defaultOutput
    }

    if deliveredChannels.contains("audio") {
      return "audio"
    }

    if deliveredChannels.contains("haptic") {
      return "haptic"
    }

    return "none"
  }

  private func scheduleSoftFade(
    for player: AVAudioPlayer,
    id: ObjectIdentifier,
    duration: TimeInterval
  ) {
    let fadeDuration = min(0.5, max(0.1, duration * 0.25))
    let fadeStart = max(0, duration - fadeDuration)
    let steps = 5

    for step in 1...steps {
      DispatchQueue.main.asyncAfter(
        deadline: .now() + fadeStart + (fadeDuration / Double(steps)) * Double(step)
      ) { [weak self, weak player] in
        guard let self, let player else {
          return
        }

        player.volume = max(0, 1 - Float(step) / Float(steps))

        if step == steps {
          player.stop()
          self.stateQueue.async {
            self.activePlayers.removeValue(forKey: id)
          }
        }
      }
    }
  }
}
