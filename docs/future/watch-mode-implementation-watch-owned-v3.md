# Watch Mode v3 Implementation Plan

This is the phased implementation reference for the Watch-owned rebuild. It
supersedes the v2 reference for new work, while ADR 003 remains the current
public app status until hardware validation passes.

## Current Public Status

Watch Mode remains visible but disabled. `WATCH_MODE_ENABLED` stays false.
Home must block `Begin TLR` and `No TLR` for Watch Mode, and stale active Watch
sessions remain local placeholders only.

## Ownership

The Apple Watch is the runtime source of truth after the user commits a staged
plan locally on the Watch. The Watch owns training playback, cue markers,
30-second epochs, heart-rate and motion collection, REM-informed cue policy,
movement/arousal gates, haptic cue delivery, optional preflighted audio cue
delivery, controls, append-only logs, and sealed package generation.

The iPhone owns plan creation, explicit start-sync UI, last-known status/review
UI, explicit morning import, local database import, review, data, and export.
The phone is never in the live cue timing path.

## WatchConnectivity Boundary

WatchConnectivity is a non-live sync fabric:

- stage plan/assets/model,
- send start receipts opportunistically,
- publish latest status snapshots as last-known status,
- transfer sealed package files,
- send phone import acknowledgements.

`sendMessage` must not be used for cue timing. `updateApplicationContext` is
not durable history. `transferUserInfo` is queued but not real-time.
`transferFile` is useful for staged assets and sealed packages, but transfer is
opportunistic. Overnight correctness must not depend on the iPhone staying
reachable, unlocked, foregrounded, alive, paired, or nearby.

## Runtime Contract

The phone builds a `watch-runtime-plan-v3` plan with explicit protocol,
watch-policy, REM-model, asset, safety, privacy, and cue-output versions. The
Watch verifies hashes and writes a local commit atomically before enabling
`Start Night`.

The Watch seals a `watch-package-manifest-v3` package in the morning or on
safe-stop. Packages include hash/count metadata, sequence continuity, runtime
summary, and idempotency-safe IDs. The Watch retains sealed packages until a
matching phone acknowledgement is durably stored.

## Live Runtime

The live runtime must be workout-backed for live-enough heart-rate sampling.
Start is denied if the workout session cannot be created, HealthKit
authorization is missing, motion is unavailable, Low Power Mode is on, battery
is below the threshold, or required assets/model files are missing.

Epochs are 30 seconds. Watch logs include summary HR/motion counts, sensor
quality, REM probability, movement state, cue decision reason, and battery
snapshot. Raw high-rate motion is not persisted by default.

Cue policy suppresses cues for sleep-log nights, before the TLR interval, while
sensor quality is bad/missing, during movement gates, during refractory windows,
after recent user interaction, during cue-associated movement pauses, and until
the REM persistence rule passes.

## Durable Watch Storage

The Watch runtime writes append-only JSONL hot-path logs for runtime events,
30-second epochs, cue summaries, and movement summaries. Plan and commit records
are written atomically before the night starts. Sealing creates a local package
manifest and runtime summary without deleting unsealed logs.

Sealed packages stay on the Watch until a durable ack with the matching
`packageId` and `packageHash` is stored. Package deletion must be gated by that
matching ack. Raw high-rate motion is not persisted by default.

## Phone Package Import

The iPhone morning importer validates the sealed package manifest, plan hash,
file hashes, sequence continuity, and record counts before writing session data.
Imports are local-only and idempotent: duplicate packages must not duplicate
epochs, runtime events, cue events, movement events, or package tracking rows.

Package import tracking lives in `watch_sync_packages`. The phone may mark a
package imported locally, but package deletion remains a Watch-side retention
decision after a later matching ack path is implemented. The importer does not
add WatchConnectivity or a native bridge.

## Implementation Sequencing

The synthetic Watch-owned runtime core with fake providers must compile and pass
tests before real providers are added. The file-backed Watch storage layer and
phone-side package importer must compile and pass tests before hidden lab or
real providers are added. Real HealthKit, workout, CoreMotion, haptic, audio,
WatchConnectivity, and package-transfer providers remain later phases and must
stay behind the same provider protocols.

## Cue Output

Default cue delivery is haptic-only. Audio is optional and experimental. Audio
requires same-night Watch preflight and may be downgraded to haptic-only or
blocked for the night if preflight fails.

## Sleep Shield

The active overnight Watch UI is a black sleep shield. It shows no bright clock,
graph, timer, progress ring, or live status screen. A tap reveals dim controls
for a short window, logs `watch_user_interaction`, then hides controls again.
Runtime correctness does not depend on screen visibility.

The sleep shield can be compile-checked before public Watch Mode is enabled,
but it must not create a public Watch start path. Lab or demo wiring remains
separate from Home/AppState public session creation.

Setup copy before Start Night should instruct the user to turn on Theater Mode,
keep Low Power Mode off, keep the Watch charged before bed, and tap to reveal
controls. The app must not attempt to programmatically toggle Theater Mode.

## Public Enablement

Do not flip public Watch Mode on until physical hardware validation passes:
synthetic runtime, 10-minute live sensor test, 30-minute live sensor test,
2-hour live sensor test, overnight Log Sleep Only, overnight conservative TLR,
phone killed/disconnected, interrupted import retry, Low Power Mode denial,
low-battery safe seal, and manual haptic/audio comfort acceptance.
