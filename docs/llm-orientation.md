# LucidTLR LLM Orientation

Use this as the current implementation briefing. `TLR_App_Plan.md` remains the
product/science contract.

## Repository Rename Transition

- This repo and app are now `LucidTLR`.
- Older docs, generated artifacts, local data, bundle paths, export schemas, or
  migration code may still mention `LucidCue` for history or backward
  compatibility.
- Do not treat every `LucidCue` string as stale. Preserve legacy names when
  they are required to read old local databases, import old exports, migrate
  native snapshots, or explain pre-rename history.
- New user-facing copy, app metadata, native targets, and docs should use
  `LucidTLR` unless Jeremy explicitly asks for different branding.
- `graphify-out/` may lag behind the rename because it is generated local
  output. Use it for navigation only, refresh it with `graphify update .` when
  needed, and do not commit it.

## Current Architecture

- Phone Mode is phone-owned. The iPhone owns presleep training, overnight audio,
  cue timing, movement pauses, cue playback, and native phone logs.
- Watch Mode v3 is implemented and watch-owned. The Watch owns overnight
  sensing (HealthKit heart rate, CoreMotion), preflight gates, cue timing and
  delivery, the sleep shield controls, and source-of-truth logs
  (`WatchNightSessionController` + `WatchSessionCoordinator` with real
  providers).
- Watch TLR nights use phone-played presleep training after the Watch plan is
  staged. This is a training-audio-only exception (ADR 005): the Watch remains
  the overnight owner, cue timing anchors to the planned training end, and no
  phone cue engine or live transport completion signal is used.
- The phone/Watch sync runs over a hardened, FROZEN WatchConnectivity
  transport (applicationContext-staged plans, hash-verified packages,
  transactional import, ack gating, idempotency rings). Do not modify it.
- Public builds remain gated: `WATCH_MODE_ENABLED` is false and public
  Home/AppState block Watch starts. The internal product flow
  (`startWatchModeProductSession` -> locked running screen -> morning import)
  is the only start path.
- Android Phone Mode is later only. Do not implement Android work unless Jeremy
  explicitly asks. Do not add Android watch support.

## Current Watch Behavior

- Internal builds: Home `Begin TLR`/`No TLR` with Watch Mode selected stages a
  real plan; the Watch auto-commits, runs preflight on real providers, and
  enters the sleep shield. Confirm Wake seals, transfers, and the phone
  imports + acks into Morning Review. The phone locked running screen is
  derived from the sync ledger only.
- Public builds: `Begin TLR` and `No TLR` show the disabled message instead of
  starting a session.
- Interrupted/sealed-unacked sessions have explicit confirmed discard exits on
  the Watch; the phone has a confirmed local escape hatch.
- The internal lab screens remain synthetic/QA surfaces, not the product flow.

## Vocabulary

- Sleep Session: the full night session after the user taps `Begin TLR` or
  `No TLR` and required gates pass. A TLR sleep session includes training plus
  the later TLR interval.
- Runtime Owner: the device responsible for session truth: timing, cue
  decisions, controls, stop behavior, and source-of-truth logs.
- No TLR / Log Sleep Only: a sleep session with cueing disabled but full sleep
  logging (sensors run). It is not a research control night.

Avoid saying:

- Watch Mode is publicly available (it is implemented but gated).
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
- Watch Mode v3 status + validation roadmap:
  `docs/testing/watch-mode-v3-completion-plan.md`
- Watch ownership: `docs/decisions/001-watch-mode-is-watch-owned.md`
  (implemented); `docs/decisions/003-watch-mode-reset-placeholder.md` is
  historical.
- Phone-played Watch presleep training:
  `docs/decisions/005-watch-night-presleep-training-is-phone-played.md`
- Phone ownership: `docs/decisions/002-phone-mode-is-phone-owned.md`
- Session flow: `src/screens/HomeScreen.tsx`,
  `src/screens/ActiveNightSessionScreen.tsx`,
  `src/screens/WatchModeRunningScreen.tsx`,
  `src/screens/MorningReviewScreen.tsx`
- Watch product flow: `src/features/watchMode/watchModeProductFlow.ts`,
  `ios/LucidTLR Watch App/WatchNightSessionController.swift`
- Phone runtime: `src/native/phoneRuntime/`,
  `ios/LucidTLR/LucidTLRPhoneRuntime.swift`
- Watch app: `ios/LucidTLR Watch App/`
- Transport (frozen): `ios/LucidTLR Watch App/Connectivity/`,
  `ios/LucidTLR/LucidTLRWatchTransport.swift`
- Rename compatibility: `src/data/local/legacyLocalDataMigration.ts`,
  `ios/LucidTLR/LucidTLRLegacyMigration.swift`
- Built-in cue metadata: `src/audio/cueCatalog.ts`
- Watch guardrail tests: `tests/watch/`

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
