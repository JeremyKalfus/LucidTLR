# LucidTLR LLM Orientation

Use this as the current implementation briefing. `TLR_App_Plan.md` remains the
product/science contract.

## Current Architecture

- Phone Mode is phone-owned. The iPhone owns presleep training, overnight audio,
  cue timing, movement pauses, cue playback, and native phone logs.
- Watch Mode is currently disabled and planned for a clean rebuild.
- Watch Mode UI affordances remain visible, but no button should create a Watch
  session, call native Watch runtime code, or import old native Watch-owned
  packages.
- Historical local Watch data remains readable from `watch_epochs` and
  `watch_runtime_events`.
- Android Phone Mode is later only. Do not implement Android work unless Jeremy
  explicitly asks. Do not add Android watch support.

## Current Watch Behavior

- Home may show the Watch Mode selection and Watch cue placeholders.
- Selecting Watch Mode must make `Begin TLR` and `No TLR` show the disabled
  message instead of starting a session.
- A stale active Watch session renders a local disabled placeholder and can be
  ended locally.
- Morning Review, Data, and diagnostics may read local historical Watch rows but
  must not probe native Watch status or imports.
- The Watch app target is a placeholder only.

## Vocabulary

- Sleep Session: the full night session after the user taps `Begin TLR` or
  `No TLR` and required gates pass. A TLR sleep session includes training plus
  the later TLR interval.
- Runtime Owner: the device responsible for session truth: timing, cue
  decisions, controls, stop behavior, and source-of-truth logs.
- Historical Watch Data: local rows that were already synced before Watch Mode
  was disabled.
- Watch Mode Placeholder: visible UI for the planned Watch product surface. It
  is not an implemented runtime.
- No TLR / Log Sleep Only: a sleep session with cueing disabled. It is not a
  research control night.

Avoid saying:

- Watch Mode is implemented.
- The app can start Watch Mode tonight.
- The phone sends cues to the Watch.
- Watch connected means Watch running.
- No TLR is a control night.
- Background audio when you mean training audio or cue audio. Use background
  sleep audio only for all-night audio beds.

## Research, Data, And Claims

- Plan ahead lightly for research-compatible data structures and exports.
- Do not build user-facing auth, upload, or research flows unless Jeremy asks.
- Sleep, cue, Watch, and journal data are local and consent-gated by default.
- Do not claim validated REM staging, medical benefit, guaranteed induction, or
  full physical overnight reliability.

## Source-Of-Truth Map

- Product/science: `TLR_App_Plan.md`
- Current Watch status: `docs/decisions/003-watch-mode-reset-placeholder.md`
- Future Watch architecture reference:
  `docs/decisions/001-watch-mode-is-watch-owned.md`
- Phone ownership: `docs/decisions/002-phone-mode-is-phone-owned.md`
- Session flow: `src/screens/HomeScreen.tsx`,
  `src/screens/ActiveNightSessionScreen.tsx`,
  `src/screens/MorningReviewScreen.tsx`
- Phone runtime: `src/native/phoneRuntime/`,
  `ios/LucidCue/LucidTLRPhoneRuntime.swift`
- Watch placeholder app: `ios/LucidCue Watch App/`
- Built-in cue metadata: `src/audio/cueCatalog.ts`
- Watch placeholder tests: `tests/watch/watchOwnedSourceOfTruth.test.ts`

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
- Watch Mode: run the placeholder source-of-truth tests and scan for old Watch
  runtime entry points before finishing.
