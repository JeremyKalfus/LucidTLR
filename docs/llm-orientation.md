# LucidCue LLM Orientation

Use this as the current implementation briefing. `TLR_App_Plan.md` remains the
product/science contract.

## Current Architecture

- Phone Mode is phone-owned. The iPhone owns presleep training, overnight audio,
  cue timing, movement pauses, cue playback, and native phone logs.
- Watch Mode is watch-owned. The Apple Watch owns overnight sensing, 30-second
  epochs, training playback, REM-informed cue policy, cue delivery, Watch
  controls, stopping, local logs, and morning log sync.
- In Watch Mode, the iPhone is sync/status UI only. It must not drive live Watch
  cue timing, training playback, cue playback, or background sleep audio.
- Android Phone Mode is later only. Do not implement Android work unless Jeremy
  explicitly asks. Do not add Android watch support.

## Watch Mode Workflow

1. The user taps `Begin TLR` or `No TLR` on the phone.
2. The phone locks on `Waiting for Watch Sync`; there are no user action buttons.
3. The Watch shows `Sync Phone` with explanatory text that the Watch manages TLR
   through the night and sends data back after waking.
4. When the user taps `Sync Phone` on Watch, the Watch pulls the plan/data and
   starts the Watch-owned runtime.
5. For Watch Mode TLR, the Watch plays training audio and then transitions the
   same sleep session into the TLR interval. Background sleep audio is off.
6. The phone remains a sync/status surface only.
7. Overnight Watch controls are `Push Back 30m`, `Pause/Play TLR`, and `Wake`.
8. When the user taps `Wake` on Watch, the Watch shows a waiting-for-phone-sync
   state.
9. The phone shows `Sync Watch`; tapping it imports complete v2 Watch logs.
10. v2 Watch logs are the source of truth for Watch Mode review and data.

## Mode/Session Matrix

- Phone Mode TLR: phone-owned runtime and cueing.
- Watch Mode TLR: Watch-owned training, runtime, cueing, controls, and logs;
  phone sync/status only.
- Watch Mode No TLR / Log Sleep Only: Watch-owned sensing and logs, cue delivery
  disabled.
- Android Phone Mode: planned later, phone-only.

## Vocabulary

- Sleep Session: the full night session after the user taps `Begin TLR` or
  `No TLR` and required gates pass. A TLR sleep session includes training plus
  the later TLR interval.
- Gate: a checkpoint where the phone or Watch cannot continue until a required
  user, device, or data condition is satisfied.
- Start Gate: the beginning-of-night Watch Mode checkpoint. Phone shows
  `Waiting for Watch Sync`; Watch shows `Sync Phone`.
- End Gate: the morning Watch Mode checkpoint. Watch shows
  `Waiting for Phone Sync`; phone shows `Sync Watch`.
- Training: the presleep cue-association interval. In Phone Mode, the phone
  plays training audio. In Watch Mode, the Watch plays training audio.
- TLR Interval: the part of the sleep session after training. In `No TLR`, this
  interval is logging-only with cueing disabled.
- Runtime Owner: the device responsible for session truth: timing, cue
  decisions, controls, stop behavior, and source-of-truth logs.
- Source Of Truth: the data stream used for review and session history. In
  Watch Mode, v2 Watch logs are the source of truth.
- Training Audio: the presleep training track. In Watch Mode, this plays on the
  Watch.
- Cue Audio: short cue sounds used during training markers or overnight TLR cue
  delivery. In Watch Mode, cue audio is delivered by the Watch.
- Background Sleep Audio: all-night audio such as white noise or sleep sounds.
  This is Phone Mode only. Watch Mode does not use background sleep audio.
- Sync Phone: the Watch button used at the start gate. It pulls plan/data from
  the phone and starts the Watch-owned sleep session.
- Sync Watch: the phone button used at the end gate. It imports complete Watch
  logs from the Watch.
- Reachability: a setup/sync signal only. It is not overnight runtime truth and
  must not drive live cue timing.
- No TLR / Log Sleep Only: a sleep session with cueing disabled. It is not a
  research control night.

Avoid saying:

- The phone starts the Watch session.
- Phone-delivered Watch Mode training.
- The phone sends cues to the Watch.
- Watch connected means Watch running.
- No TLR is a control night.
- Background audio when you mean training audio or cue audio. Use background
  sleep audio only for all-night audio beds.

## Research, Data, And Claims

- Plan ahead lightly for research-compatible data structures and exports.
- Do not build user-facing auth, upload, or research flows unless Jeremy asks.
- Sleep, cue, Watch, and journal data are local and consent-gated by default.
- Watch Mode is current architecture but engineering beta. Do not claim validated
  REM staging, medical benefit, guaranteed induction, or full physical overnight
  reliability.

## Source-Of-Truth Map

- Product/science: `TLR_App_Plan.md`
- Mode ownership: `docs/decisions/001-watch-mode-is-watch-owned.md`,
  `docs/decisions/002-phone-mode-is-phone-owned.md`
- Session flow: `src/screens/HomeScreen.tsx`,
  `src/screens/ActiveNightSessionScreen.tsx`,
  `src/screens/MorningReviewScreen.tsx`
- Phone runtime: `src/native/phoneRuntime/`, `ios/LucidCue/LucidCuePhoneRuntime.swift`
- Watch sync/import: `src/native/watch/`, `ios/LucidCue/LucidCueWatchRuntime.swift`
- Watch app runtime: `ios/LucidCue Watch App/`
- Built-in cue metadata: `src/audio/cueCatalog.ts`
- Watch source-of-truth tests: `tests/watch/watchOwnedSourceOfTruth.test.ts`

## Worker Rules

- Ask Jeremy when uncertain about UI flow, copy intent, product behavior,
  science/protocol, consent/privacy, research posture, claims, or user-facing
  defaults.
- For technical tradeoffs, explain the high-level consequence if asking Jeremy.
- Use `.agent_work/current.md` for native, multi-agent, broad, interrupted, or
  protocol/session/science work.
- Keep docs short and operational; avoid duplicating discoverable code details.

## Verification Gates

- JS/docs-only: `npm run typecheck`, `npm test`, `git diff --check`.
- Native iOS/watch: also run the relevant iPhone and Watch simulator builds when
  available.
- Watch Mode: run source-of-truth tests and scan for old phone-owned Watch
  runtime strings before finishing.
