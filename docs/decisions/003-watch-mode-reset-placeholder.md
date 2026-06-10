# ADR 003: Watch Mode Reset To Placeholder

Date: 2026-06-05

## Status

Accepted.

## Context

The previous Watch-owned v2 implementation was removed because it was not a
reliable current runtime. The app still needs visible Watch Mode affordances so
users can see the planned product shape, but those affordances must not route
into the removed runtime or imply Watch Mode is implemented.

## Decision

Watch Mode is a visible disabled/planned state until rebuilt. New Watch sessions
cannot be created. Stale local Watch sessions show a local-only placeholder and
may be ended locally. Historical local Watch data remains readable.

The current app must not call:

- phone-side Watch start/sync/import native methods,
- Watch-owned session plan builders,
- Watch REM classifier/cue-policy code,
- Watch app HealthKit, WatchConnectivity, runtime logging, or cue delivery code
  from public Watch Mode surfaces.

Exception: after Jeremy's explicit 2026-06-10 approval, the internal
TestFlight Watch lab may run Phase C real-provider forced-cue sessions for
couch/overnight validation. This exception does not enable public Home/AppState
Watch starts, uploads, package deletion, or live iPhone-driven Watch cue timing.

## Consequences

Phone Mode remains the only implemented runtime path. Watch data already stored
locally can still be viewed and exported, but unimported native Watch-owned
packages are intentionally invalidated by removal of the old native import path.

ADR 001 remains useful as future architecture reference, but it no longer
describes the current implementation status.
