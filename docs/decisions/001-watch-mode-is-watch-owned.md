# 001: Watch Mode Is Watch-Owned

## Decision

Watch Mode is Watch-owned. The Apple Watch owns overnight sensing, 30-second
epochs, training playback, REM-informed cue policy, cue delivery, Watch
controls, stopping, local logs, and morning log sync.

The iPhone begins Watch Mode by showing `Waiting for Watch Sync`. The Watch
shows `Sync Phone`; the user taps that Watch button to pull the plan/data and
start the Watch-owned runtime. During the night, the iPhone is a clock-only
sync/status surface. Background sleep audio is off in Watch Mode. The Watch
controls are `Push Back 30m`, `Pause/Play TLR`, and `Wake`. In the morning,
Watch waits for phone sync and the phone shows `Sync Watch`. Complete v2 Watch
logs are the source of truth for review and data.

## Rationale

Watch-owned runtime keeps cue timing, movement gating, battery stops, and log
ownership on the device that has the overnight sensors. User-led sync checkpoints
make start and wakeup state explicit instead of hiding fragile automatic
connectivity assumptions.

## Rejected Alternatives

- Phone-owned Watch cue timing.
- Live iPhone messages as overnight Watch Mode truth.
- Automatic hidden start/end sync gates without user-led `Sync Phone` and
  `Sync Watch` checkpoints.
- Treating presleep training completion as a Watch runtime gate.

## Consequences

- WatchConnectivity is for start sync, status, and morning log import, not live
  cue timing.
- Watch Mode training audio and cue audio are Watch-delivered.
- Background sleep audio is Phone Mode only.
- Watch Mode No TLR / Log Sleep Only uses the same Watch-owned runtime with cue
  delivery disabled.
- Watch Mode is current architecture but engineering beta until physical
  overnight reliability is validated.

## Key Files

- `docs/llm-orientation.md`
- `src/screens/ActiveNightSessionScreen.tsx`
- `src/native/watch/`
- `ios/LucidCue/LucidCueWatchRuntime.swift`
- `ios/LucidCue Watch App/`
