# Watch Mode Synthetic Transport Next Steps

## Current Boundary

The Internal TestFlight Lab has now shown a clean synthetic transport baseline
and a basic phone-reload interruption recovery on physical iPhone/Watch. This
validates the lab path for plan staging, Watch proof, package transfer, phone
import, ack, and final ledger cleanup.

This is not public Watch Mode readiness. It validates the synthetic
WatchConnectivity recovery shell only.

## Immediate QA Harness Cleanup

1. Treat duplicate retry after `ack_recorded` as idempotent success in the phone
   lab message.
2. Infer `phoneReloadRecoverySeen` from a real phone lab reopen that reuses an
   unresolved staged transport session.
3. Keep the export explicit about what was real transport, what was fixture
   import, and what was recovery simulation.

## Next TestFlight Drills

1. Phone-closed package recovery:
   - stage plan on phone,
   - force-quit phone,
   - run Watch baseline loop while phone is closed,
   - reopen phone,
   - complete package import and ack.
2. Watch reload recovery:
   - stage plan on phone,
   - interrupt the Watch around commit/package transfer,
   - reopen Watch,
   - verify current-session index prevents overwrite and transfer/ack can
     complete.
3. Delayed/unreachable retry:
   - stage plan while phone/Watch are not immediately reachable,
   - verify queued transport recovers without creating "nothing running",
   - confirm duplicate receipts/imports/acks are harmless.

## Move-On Criteria

Declare the synthetic transport recovery layer good enough to stop reworking
when the baseline plus phone-reload, Watch-reload, delayed/unreachable, and
duplicate-retry drills produce clean exports:

- `finalDrillStatus: pass`,
- unresolved count `0`,
- commit/package/import/ack evidence for the current session,
- no state regression,
- no current-session hash mismatch,
- no overwrite of active/unacked Watch state.

## Later Real-Provider Work

Only after the synthetic recovery shell is stable, add real-provider preflight
one provider at a time. Start with low-risk battery and Low Power Mode checks.
Do not add HealthKit, CoreMotion, workout runtime, haptics, audio, uploads, or
public Watch Mode behavior until Jeremy explicitly approves that next phase.
