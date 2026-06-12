# ADR 005: Watch Night Presleep Training Is Phone-Played

Date: 2026-06-12

## Status

Accepted.

## Context

Watch Mode v3 remains watch-owned for the overnight session. The Watch commits
the staged plan, owns overnight sensing, cue timing, cue delivery, controls, and
logs, and does not depend on live phone messages for cue decisions.

Presleep training has a separate bedtime usability constraint: the user starts a
Watch night from the iPhone and the iPhone is the device already presenting the
locked running screen. The final guided training asset is already bundled in the
iPhone app and the native phone runtime already supports locked presleep
training playback that survives screen lock.

## Decision

For Watch TLR nights, the iPhone plays the guided presleep training audio after
the Watch plan is staged. The Watch plan is still staged immediately and carries
`training.durationSeconds`; the TLR cue interval is anchored to planned training
end plus the protocol delay.

The iPhone training path is training-only. It must not start the Phone Mode
overnight runtime, phone cue engine, audio bed, motion summaries, phone cue
timing, or Phone Mode calibration import for Watch nights.

Skipping training stops only the iPhone training audio. It does not restage the
Watch plan, send a completion signal, or change Watch cue timing.

## Consequences

- WatchConnectivity remains frozen to staged plans, receipts, status snapshots,
  sealed packages, and phone import acknowledgements.
- No new Watch transport message type is introduced for training completion.
- `skipGuidedTraining: true` and Watch sleep-log nights do not play presleep
  training audio.
- The locked iPhone Watch running screen may show temporary training controls
  while the planned training window is active, then returns to the plain locked
  Watch-owned night surface.
