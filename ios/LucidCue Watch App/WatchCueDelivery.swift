import AVFoundation
import Foundation
import WatchKit

struct WatchCueDeliveryResult {
  var deliveredHaptic: Bool
  var deliveredAudio: Bool
  var reason: String
}

protocol WatchCueDelivering {
  func deliverCue(plan: WatchRuntimePlan) -> WatchCueDeliveryResult
}

final class WatchLocalCueDelivery: WatchCueDelivering {
  private var audioPlayer: AVAudioPlayer?

  func deliverCue(plan: WatchRuntimePlan) -> WatchCueDeliveryResult {
    let wantsHaptic = plan.cueMode == "haptic_only" || plan.cueMode == "audio_haptic"
    let wantsAudio = plan.cueMode == "audio_only" || plan.cueMode == "audio_haptic"

    if wantsHaptic {
      WKInterfaceDevice.current().play(.notification)
    }

    guard wantsAudio else {
      return WatchCueDeliveryResult(
        deliveredHaptic: wantsHaptic,
        deliveredAudio: false,
        reason: wantsHaptic ? "watch_haptic_delivered" : "watch_cue_mode_disabled"
      )
    }

    guard !plan.iPhoneAudio.cueResourceName.isEmpty,
      let url = Bundle.main.url(
        forResource: plan.iPhoneAudio.cueResourceName,
        withExtension: plan.iPhoneAudio.cueResourceExtension
      )
    else {
      return WatchCueDeliveryResult(
        deliveredHaptic: wantsHaptic,
        deliveredAudio: false,
        reason: wantsHaptic ? "watch_audio_missing_haptic_delivered" : "watch_audio_missing"
      )
    }

    do {
      let player = try AVAudioPlayer(contentsOf: url)
      player.volume = Float(plan.iPhoneAudio.startVolume)
      player.prepareToPlay()
      let played = player.play()
      audioPlayer = player

      return WatchCueDeliveryResult(
        deliveredHaptic: wantsHaptic,
        deliveredAudio: played,
        reason: played ? "watch_audio_delivered" : "watch_audio_play_failed"
      )
    } catch {
      return WatchCueDeliveryResult(
        deliveredHaptic: wantsHaptic,
        deliveredAudio: false,
        reason: wantsHaptic ? "watch_audio_error_haptic_delivered" : "watch_audio_error"
      )
    }
  }
}
