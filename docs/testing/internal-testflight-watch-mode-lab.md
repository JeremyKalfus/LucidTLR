# Internal TestFlight Watch Mode Lab

## Purpose

Use this lane for Jeremy-based real-device Watch Mode recovery and sync testing.
TestFlight is preferred over dev builds for this stage because it removes
Metro, dev-client reload state, and Xcode-run lifecycle behavior from the test
environment.

This is still synthetic QA only. Public Watch Mode remains disabled, no real
overnight Watch Mode is available, no real sensors/cueing are used, and no
uploads are added.

## Build Lane

The EAS build profile is `testflight-internal-lab`.

It sets:

- `EXPO_PUBLIC_WATCH_MODE_LAB_ENABLED=true` for the JS phone lab gate.
- `LUCIDTLR_INTERNAL_TESTFLIGHT_SWIFT_FLAGS=-D LUCIDTLR_INTERNAL_TESTFLIGHT_LAB`
  for the Watch lab compile gate.

It does not change `WATCH_MODE_ENABLED`, which must remain false.

## Archive And Upload

Use the current EAS setup:

```sh
eas build --platform ios --profile testflight-internal-lab
```

After the build is available in App Store Connect, distribute it only through
Internal TestFlight. Do not use this profile for external beta or public
enablement.

## Install

Install the Internal TestFlight build on the iPhone through TestFlight. Confirm
the paired Watch receives the matching Watch app build through the normal
TestFlight/watchOS install flow.

## Confirm Lab Access

On iPhone:

- Open the hidden phone lab route `/debug/watch-mode-lab`.
- Confirm it labels itself `Internal TestFlight Lab`.
- Confirm it labels itself synthetic/QA only, public Watch Mode disabled, no
  real overnight Watch Mode, and no uploads.
- Confirm the transport section labels WatchConnectivity as synthetic/internal
  only and `reachable` as informational only.

On Watch:

- Open the Watch app.
- Confirm the synthetic lab button is present only for the internal lab build.
- Confirm the transport section labels itself synthetic only.
- Confirm the public placeholder remains the default public-facing copy.

In a normal production build, the hidden phone route must redirect home and the
Watch app must show only the rebuild placeholder.

## First QA Checklist

- Open the phone lab.
- Open the Watch lab.
- Verify public Watch Mode is still disabled from Home and Settings.
- Simulate unresolved/running phone recovery state.
- Simulate sealed-waiting-import phone recovery state.
- Simulate phone import success / ack eligible.
- Simulate ack recorded.
- Confirm synthetic abandon/discard requires explicit local-only action.
- Build synthetic TLR and sleep-log plans.
- Import and re-import synthetic packages.
- Validate corrupt package rejection.
- On Watch, recover current synthetic session, seal it, record synthetic ack,
  and discard synthetic lab session with explicit confirmation.

## First Transport Drill

This drill tests the v1/v2 connection and recovery failure class. It still does
not test real heart-rate, motion, workouts, haptics, audio, overnight runtime,
or uploads.

1. Install the Internal TestFlight Lab build on iPhone and the paired Watch.
2. Confirm public Watch Mode is disabled from Home and the Watch placeholder.
3. Open the phone lab and Watch lab.
4. Activate transport on both.
5. Stage a synthetic TLR plan from the phone.
6. On Watch, check/pull the staged synthetic plan.
7. Commit the staged plan on Watch.
8. Send the Watch commit receipt.
9. Kill and reopen the phone app.
10. Confirm the phone shows unresolved Watch committed/running recovery from the
    local DB ledger, not from reachability.
11. Send a Watch status snapshot.
12. Seal a synthetic package on Watch.
13. Transfer the sealed synthetic package to the phone.
14. Import the latest received synthetic package on phone.
15. Send ack for the latest imported package from phone.
16. On Watch, record the received ack.
17. Kill and reopen both apps.
18. Confirm no unresolved/unacked session remains.
19. Repeat package transfer/import/ack and confirm idempotency.
20. Repeat with Watch initially unreachable or the phone backgrounded, then
    retry transfer/ack.

## Not In This Lane Yet

No real heart-rate, motion, workout, haptic, audio, overnight runtime, or upload
testing is expected in this pass. The next phase after this lab should use the
same Internal TestFlight lane to harden retry/reconciliation behavior from real
device drill notes before adding real HealthKit/CoreMotion providers.
