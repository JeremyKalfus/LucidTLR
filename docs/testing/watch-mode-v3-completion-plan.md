# Watch Mode v3 Completion Plan

Status: adopted 2026-06-10. Supersedes the open-ended drill sequencing in
`watch-mode-synthetic-transport-next-steps.md` (that doc remains valid for
move-on criteria and drill definitions).

Hard budget: **at most 8 more TestFlight builds (including error builds) and
exactly 2 full overnight tests** from build 14 to "Watch Mode fully working
and gated."

## Diagnosis Driving This Plan

Build 14's export was not a transport failure. The Watch's only reply
(`status.snapshot`, `watchState: idle`, matching session/plan, no package
fields) is the shape of the coordinator's automatic `plan.request` reply,
which hardcodes `.idle`. It proves the Watch was awake and auto-replied; it
does not prove the Watch baseline loop ran. The loop currently requires a
correctly-timed manual tap on the Watch, and its failures surface only on
the Watch screen. Separately, the idle auto-reply was applied to the phone
ledger as `watch_running_last_known`, creating the unresolved state that
blocked future starts — the harness poisoned its own ledger.

Conclusions:

1. The architecture (watch-owned runtime, durable ledger, transactional
   import, ack gating, epoch/idempotency hardening, public gating) is right
   and is not rebuilt by this plan.
2. The validation loop is wrong: manual two-device choreography, iterated
   through TestFlight builds, for code with zero physical-device
   dependencies. WatchConnectivity works between paired simulators; all
   connection iteration moves local.
3. Diagnostic auto-replies must never advance or block the sync ledger.

## Budget Ledger

| Build | Purpose | Validation gate |
| --- | --- | --- |
| (none) | Phase A: all connection hardening + edge cases | Scripted simulator drill matrix, 10 consecutive green runs |
| 15 | Phase B: transport confirmation | Physical drill matrix, one evening |
| 16 | Reserve: transport fixes | Re-run matrix |
| 17 | Phase C: all real providers at once + forced-cue mode | Couch test (~1 hour evening wear), then Overnight 1 |
| 18 | Reserve: provider fixes | Repeat couch test / Overnight 1 |
| 19 | Phase D: product surface + Overnight 1 fixes | Overnight 2 on the real gated user flow |
| 20 | Reserve | RC re-validation |
| 21-22 | Pure error reserve | Only if something breaks |

Nominal path: 5 builds, 2 overnights. The cap holds through three rounds of
surprises. A wasted overnight counts as a wasted build: each overnight is
pre-scripted with written pass/fail criteria before bed.

## Phase A - Connection Hardening, Zero Builds (local only)

The raw connection is the number 1 issue. It is finished here, locally,
before any further TestFlight build.

1. **Truthful, inert plan-request auto-reply.**
   - Watch replies with the actual current-session-index runtime state, or
     an explicit `lab_idle_auto_reply` marker, plus `autoReply: true`.
   - Phone records auto-replies as diagnostics only. They are never applied
     through `applyWatchRunningStatus`, never create or upgrade unresolved
     states, and can never set `blocksFutureWatchStart`.
2. **Event-driven Watch auto-baseline.**
   - Lab toggle (default on in internal lab): when a staged plan arrives via
     the WCSession delegate, the Watch automatically runs
     commit -> synthetic epochs -> seal -> transfer -> receipt/snapshot.
   - Removes the manually-timed Watch tap entirely. A baseline drill becomes
     one human action: phone `Run One-Button Baseline`.
   - This is the production shape too: real Watch Mode reacts to staged
     plans by events, not taps. Not throwaway harness code.
3. **Watch-side failure propagation.**
   - Any auto-baseline failure sends `lucidtlr.watch.transport.error` with
     stage + reason, so phone exports show why the Watch stalled instead of
     showing silence.
4. **Paired-simulator drill rig.**
   - `xcrun simctl pair` an iPhone + Watch simulator; run the internal-lab
     scheme on both.
   - Scripted drills (npm scripts; assertion = parsed debug export with
     `finalDrillStatus: pass`, unresolved 0, no regression, no mismatch,
     no overwrite):
     - `drill:sim-baseline` - clean one-button baseline.
     - `drill:sim-phone-reload` - terminate/relaunch phone mid-flow.
     - `drill:sim-watch-reload` - terminate/relaunch Watch around
       commit/transfer.
     - `drill:sim-duplicate` - redeliver queued payloads; assert idempotent.
     - `drill:sim-unreachable` - stage while counterpart is down; assert
       queued recovery, no "nothing running".
5. **Simulator transport shim (added after a verified platform limitation).**
   The Simulator does not deliver `WCSession.transferUserInfo`/`transferFile`
   between paired simulators (`updateApplicationContext` does deliver). A
   compile-gated `#if targetEnvironment(simulator)` shim mirrors queued
   payloads through a shared host directory and feeds them into the exact
   same `handleIncoming` paths, so all logic (epoch reset, dedup, hash
   verification, ledger) is exercised unchanged; only the wire is swapped.
   The real WCSession wire is validated on hardware in Phase B, which was
   always its job.
6. **Exit criteria:** full matrix passes 10 consecutive runs. Every
   reload/refresh/duplicate/out-of-order edge case is closed here. After
   Phase A, the transport layer is frozen except for bugs found by Phase B.

Invariants preserved throughout: `WATCH_MODE_ENABLED=false`, no public Watch
start, no real sensors/HealthKit/CoreMotion/workout/haptics/audio/uploads,
no package deletion, ack only after transactional import.

## Phase B - Builds 15-16: Physical Transport Confirmation

- One evening, full drill matrix on physical iPhone + Watch: clean baseline,
  phone-closed package recovery, Watch-reload, delayed/unreachable retry,
  duplicate retry.
- TestFlight here confirms only what simulators cannot: real background
  delivery timing and device quirks. It is not a debugger; failures go back
  to the simulator rig, fixed, and consume build 16.
- Exit: move-on criteria from
  `watch-mode-synthetic-transport-next-steps.md`. Then the transport layer
  is declared done and is not reworked again.

## Phase C - Builds 17-18: All Real Providers At Once + Overnight 1

All providers land in one build behind the existing preflight gates and
internal-lab flags. Granularity moves from builds to toggles: the preflight
scenario picker and lab screens validate each provider independently inside
the same binary.

Contents of build 17:

1. Real battery + Low Power Mode preflight values (proves gate plumbing).
2. HealthKit authorization + `HKWorkoutSession` runtime + HR stream.
3. CoreMotion epochs + movement/arousal gating.
4. Haptic/audio cue output with the plan's suppression rules (movement
   pauses cueing; post-cue movement extends pause; resume after stable low
   movement).
5. REM signal v0: simplest versioned HR/motion heuristic, log-only, with
   `classifier_version`. It informs cue timing later; it does not gate this
   plan.
6. **Forced-cue lab mode**: fire a cue at T+N minutes regardless of REM
   signal. This is what saves the overnight budget - cue output, suppression
   and movement gating are validated in an evening couch test, not a night.

Validation:

- Couch test (~1 hour evening wear): per-provider checklist on the lab
  screen - HR epochs flowing, motion gating reacts, forced cue fires and is
  suppressed by movement, seal -> transfer -> import -> ack clean.
- **Overnight 1** (on build 17 or 18): the questions only a night can
  answer - workout session survives ~8h, battery burn acceptable, epoch
  continuity, cue at forced late-night time, morning import + ack clean.
  Pass/fail criteria written before bed; export captured in the morning.

Known risk concentration: HealthKit/workout background runtime on real
hardware (simulator coverage is weak there). Conservative defaults: require
high battery, block on Low Power Mode. Build 18 reserve exists for this.

## Phase D - Builds 19-20: Product Surface + Overnight 2 + RC

Build 19 combines Overnight 1 fixes with the product surface:

- Real gated phone start flow: Home -> Begin TLR with Watch Mode selected
  runs the proven plan-stage -> commit -> overnight -> seal -> import -> ack
  pipeline (the exact code path the lab validated).
- Morning import wiring into Morning Review/Data (which already read
  `watch_epochs`).
- `WATCH_MODE_ENABLED` remains false; the internal gate exposes the flow
  for validation only.

### Canonical Watch Mode Running UX (locked-flow design)

Principle: while a Watch session is active/unacked, both apps present exactly
one surface with no mutating actions. The lock is enforced by durable state,
not by holding the screen (iOS/watchOS cannot prevent backgrounding or crown
exit). There is NO new "watch mode running" flag: the phone derives lock
state from the existing sync ledger (active/unacked Watch session - the same
state that drives `blocksFutureWatchStart`), and the Watch derives it from
the file-backed current session index. Both are restart-proof; on every app
launch/foreground, route from that state. A parallel boolean would be a
second source of truth and is forbidden.

Phone screen states (view-only, derived from ledger + transport evidence):

1. `Watch Mode running - started <time>`: active session, no seal evidence.
   No buttons except the buried escape hatch (below).
2. `Night ended on watch - syncing...`: seal/snapshot evidence arrived,
   import/ack not yet complete. Still no mutating actions; import/ack runs
   automatically.
3. Unlocked -> Morning Review: ledger resolved (import + ack recorded).

Watch screen states (derived from current session index):

1. `Waiting for plan from phone` until a plan commits.
2. Sleep shield: black screen, count-up clock, Wake button (existing
   `SleepShieldView` concept). Crown-exit and app restart return here while
   the index shows an active/unacked session.
3. Wake button: seals the package locally on the Watch immediately
   (watch-owned truth; works with the phone dead). Transfer/import/ack then
   proceed asynchronously whenever connectivity allows.

The wake handshake is asynchronous by design: the phone must never block on
"watch wake received" as a synchronous gate. Each phone state transition
tolerates delayed, duplicated, and out-of-order delivery - guaranteed by the
Phase A/B transport boundary.

Escape hatch (phone only, for a dead/lost Watch):

- A deliberately small "End session on this phone" action behind a native
  confirm popup (`Alert.alert` -> UIAlertController) whose copy states
  plainly that ending locally may lose the night's data from the Watch, with
  explicit Cancel / End Session choices. Destructive style on the confirm.
- Ending locally marks the ledger session abandoned-local-only (existing
  semantics). The Watch package, if one was sealed, is never deleted without
  ack; if it arrives later it is logged as stale under current rules.
- Open product decision for Jeremy (default conservative): whether a
  late-arriving package from a locally-ended night can be manually imported
  as historical data instead of staying stale-ignored.

**Overnight 2** runs the real user flow end-to-end, not the lab path. It is
simultaneously the product-surface test, the recovery test, and the RC
validation. Exit: clean night + clean morning import + drill matrix still
green on the release build.

Ship with Watch Mode present, working, and gated. Written flip criteria
(documented in the decision record when reached): N clean dogfood nights on
the shipped build + drill matrix green; flipping `WATCH_MODE_ENABLED`
remains an explicit Jeremy decision.

## Explicit Cuts (what keeps the budget honest)

- REM classifier tuning/validation: v0 ships log-only; tuned post-ship from
  accumulated night data. Sanctioned by `TLR_App_Plan.md` (REM-informed
  cueing, not validated staging).
- Further debug-export/forensics sophistication: frozen as of build 14.
- Exotic drill variants beyond the scripted matrix: post-ship, behind the
  gate.
- Per-provider build sequencing: replaced by per-provider toggles in one
  build.

## Discipline Rules

1. No TestFlight build for anything reproducible in the simulator rig.
2. No new diagnostics work; failures must be prevented (automation), not
   better described.
3. Every overnight has written pass/fail criteria before bed.
4. Transport layer is frozen after Phase B except for bugs found on
   physical hardware.
5. All non-negotiable invariants in `AGENTS.md` hold in every phase.
