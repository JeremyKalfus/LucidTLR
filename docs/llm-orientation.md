# LucidCue LLM Orientation

Use this as the current implementation briefing. `TLR_App_Plan.md` remains the
product/science contract.

## Current Architecture

- Phone Mode is phone-owned. The iPhone owns presleep training, overnight audio,
  cue timing, movement pauses, cue playback, and native phone logs.
- Watch Mode is watch-owned. The Apple Watch owns overnight sensing, 30-second
  epochs, REM-informed cue policy, cue delivery, Watch controls, stopping, local
  logs, and morning log sync.
- In Watch Mode, the iPhone is sleep audio plus sync/status UI only. It must not
  drive live Watch cue timing.
- Android Phone Mode is later only. Do not implement Android work unless Jeremy
  explicitly asks. Do not add Android watch support.

## Watch Mode Workflow

1. The user taps `Begin TLR` or `No TLR` on the phone.
2. The phone locks on `Waiting for Watch Sync`; there are no user action buttons.
3. The Watch shows `Sync Phone` with explanatory text that the Watch manages TLR
   through the night and sends data back after waking.
4. When the user taps `Sync Phone` on Watch, the Watch pulls the plan/data and
   starts the Watch-owned runtime.
5. The phone becomes a clock-only sleep-audio speaker. It may play training
   audio if enabled, then the selected sleep audio or white noise, but Watch
   runtime does not depend on whether training was skipped.
6. Overnight Watch controls are `Push Back 30m`, `Pause/Play TLR`, and `Wake`.
7. When the user taps `Wake` on Watch, the Watch shows a waiting-for-phone-sync
   state.
8. The phone shows `Sync Watch`; tapping it imports complete v2 Watch logs.
9. v2 Watch logs are the source of truth for Watch Mode review and data.

## Mode/Session Matrix

- Phone Mode TLR: phone-owned runtime and cueing.
- Watch Mode TLR: Watch-owned runtime and cueing; phone speaker/sync only.
- Watch Mode No TLR / Log Sleep Only: Watch-owned sensing and logs, cue delivery
  disabled.
- Android Phone Mode: planned later, phone-only.

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
