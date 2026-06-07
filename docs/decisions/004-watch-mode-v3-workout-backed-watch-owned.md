# ADR 004: Watch Mode v3 Workout-Backed Watch-Owned Runtime

Date: 2026-06-07

## Status

Accepted for phased rebuild. Public Watch Mode remains disabled until physical
hardware validation passes.

## Context

ADR 003 reset Watch Mode to a visible disabled placeholder after the previous
runtime was removed. The next rebuild must preserve the product/science
boundary while avoiding the connectivity assumptions that made live Watch cue
timing fragile.

Perfect WatchConnectivity does not exist. `sendMessage` requires reachability
and is unsuitable for live cue timing. `updateApplicationContext` is latest
state only, `transferUserInfo` is queued but not real-time, and `transferFile`
is opportunistic. Overnight correctness cannot depend on the iPhone staying
reachable, unlocked, foregrounded, alive, paired, or nearby.

## Decision

Watch Mode v3 is watch-owned. After the start commit, the Apple Watch owns
presleep training playback, training cue markers, 30-second epoch generation,
heart-rate and motion collection, experimental REM-informed cue policy,
movement/arousal gates, cue delivery, pause/push-back/wake controls, durable
local logs, and sealed morning package generation.

Watch Mode v3 uses a workout-backed runtime for live heart-rate collection. If
a workout-backed runtime is unavailable, Watch Mode must not start.

WatchConnectivity is prohibited from live cue timing. It is allowed only for
plan staging, start receipts, latest status snapshots, sealed package transfer,
and phone import acknowledgements. No WatchConnectivity callback may directly
play a cue or determine an epoch decision.

Watch Mode starts only after local Watch plan commit. The phone builds and
stages the plan/assets/model, but the Watch verifies hashes and writes a local
commit before `Start Night` becomes available.

Default cue channel is haptic-only. Audio cueing is optional, experimental, and
requires same-night Watch preflight. Low Power Mode blocks Watch Mode start.

The overnight UI uses a black sleep shield. Tapping the Watch reveals dim
controls temporarily, logs a user interaction, then auto-hides back to black.
Cue policy suppresses cueing briefly after user interaction.

The Watch retains sealed packages until phone ack. Package transfer and import
must be idempotent, and duplicate packages must not duplicate local records.

Public Watch Mode remains disabled until hardware validation passes.

## Consequences

- Phone Mode remains phone-owned and unchanged.
- No TLR / Log Sleep Only uses the same Watch-owned sensing/logging runtime
  with cue delivery disabled.
- Watch Mode claims stay limited to experimental REM-informed cueing, not
  validated sleep staging, diagnosis, treatment, or guaranteed lucid dreaming.
- Watch Mode does not use GPS, SensorKit, live Apple sleep stages, wrist
  temperature, respiratory rate, SpO2, server REM inference, advertising IDs, or
  unnecessary identifiers.
- Hot-path Watch logs are append-only summary records, not raw high-rate motion
  streams.
- Normal Home UI must still block Watch Mode session creation while
  `WATCH_MODE_ENABLED` is false.

## Validation Gate

Do not enable public Watch Mode until JS tests, native builds, synthetic runtime
tests, physical live sensor tests, disconnected-phone tests, import retry tests,
Low Power Mode denial, low-battery safe seal, and overnight Log Sleep Only plus
conservative TLR tests have passed on physical hardware.
