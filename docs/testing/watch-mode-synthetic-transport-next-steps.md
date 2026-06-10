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

## Structural Transport Hardening

After the current TestFlight drill results are reviewed, harden the synthetic
transport layer itself rather than adding more point filters.

Status: items 1-5 below are implemented in the Watch interruption hardening
pass (single `WatchTransportLabState` epoch state, applicationContext-
authoritative staged plan, bounded idempotency ring, phone receive-boundary
SHA-256 package verification, Application Support storage). They remain
unvalidated on physical devices until the next TestFlight drills pass.

1. Replace scattered Watch `UserDefaults` keys with one session-scoped Codable
   transport state.
   - Store staged plan, commit/status summary, latest transfer, ack, last
     message, and last error under one `WatchTransportLabState`.
   - Reset the state atomically when the staged plan `sessionId` or `planHash`
     changes.
   - Keep this lab-scoped and do not alter the durable Watch current-session
     index semantics.
2. Make `applicationContext` the staged-plan source of truth.
   - Use latest-wins `updateApplicationContext` for the current staged plan.
   - Do not rely on queued `transferUserInfo` for current-plan delivery.
   - If a plan-available userInfo nudge remains, ignore it when its
     `createdAt`/identity is older than the persisted staged plan.
3. Persist a bounded recent-message idempotency ring.
   - Use stable `messageId`/`idempotencyKey` values for semantic transport
     events.
   - Deduplicate incoming queued userInfo/file/context handling across relaunch
     and redelivery.
   - Keep only a small recent ring so the lab cannot grow unbounded local
     metadata.
4. Verify received package content at the transport boundary.
   - When the phone receives a package file, compute/verify the expected package
     hash before declaring it the latest received package.
   - Report truncated/corrupt transfer as transport diagnostics, before import.
   - Replace placeholder/structural lab hashes with a real canonical digest
     before any real Watch Mode package path.
5. Move received package files out of `Caches`.
   - Store unacked received packages under Application Support with appropriate
     file protection.
   - Treat `Caches` as acceptable only for temporary synthetic lab artifacts,
     not for the only pre-ack copy of overnight Watch data.

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
