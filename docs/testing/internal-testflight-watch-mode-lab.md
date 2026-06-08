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
npm run verify:watch-testflight-lab
npx eas build --platform ios --profile testflight-internal-lab --non-interactive
```

After the build is available in App Store Connect, distribute it only through
Internal TestFlight. Do not use this profile for external beta or public
enablement.

If CLI submission is available after the build completes:

```sh
npx eas submit --platform ios --latest --non-interactive
```

Do not add external/public testers for this lane.

## Current EAS CLI Status

As of June 8, 2026, local simulator verification passes, but cloud build
submission is blocked before a TestFlight archive is created.

The configured EAS project ID currently resolves to the legacy Expo project slug
`lucidcue`, while this repo's app slug is `lucidtlr`. The CLI has no exposed
project rename command. The clean permanent fix is to rename the Expo project
slug for project ID `1927a3da-a23c-4160-b86e-a312d9326558` from `lucidcue` to
`lucidtlr` in Expo project settings, then rerun:

```sh
npm run verify:watch-testflight-lab
npx eas build --platform ios --profile testflight-internal-lab --non-interactive
```

If EAS still reports credentials cannot be validated non-interactively, run the
same build without `--non-interactive` and validate the iOS distribution
certificate plus provisioning profiles for both native targets:

```sh
npx eas build --platform ios --profile testflight-internal-lab
```

Targets:

- `LucidTLR` / `com.jeremykalfus.lucidtlr`
- `LucidTLR Watch App` / `com.jeremykalfus.lucidtlr.watchkitapp`

After EAS reports a successful App Store build, submit the latest build:

```sh
npx eas submit --platform ios --latest --non-interactive
```

If submit requires App Store Connect authentication, use the interactive submit
flow and choose internal TestFlight only. Do not enable external/public testing
for this lab build.

## TestFlight What To Test

Paste this into the Internal TestFlight build notes:

```text
Internal synthetic WatchConnectivity transport drill only.

Public Watch Mode must remain disabled. This build does not test real HR,
motion, workouts, haptics, audio, REM detection, overnight runtime, uploads, or
public Watch session start.

Run the phone/Watch lab drill:
1. Open phone and Watch labs.
2. Activate transport on both.
3. Stage synthetic TLR plan on phone.
4. Commit staged plan on Watch and send commit receipt.
5. Force-quit/reopen phone and confirm DB-backed unresolved recovery state.
6. Seal and transfer synthetic package from Watch.
7. Import latest package on phone and confirm ackEligible = true.
8. Send ack and confirm Watch records matching ack.
9. Repeat package transfer/import/ack and confirm idempotency/no overwrite.
10. Repeat once with a delayed/unreachable condition.

Capture failures with step number, phone/Watch screen text, activation/reachable
state, sessionId, planHash prefix, packageId/packageHash prefix, and screenshots
where possible.
```

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

1. Install the Internal TestFlight Lab build on iPhone.
2. Confirm the Watch app is installed.
3. Confirm public Watch Mode remains disabled.
4. Open the phone lab.
5. Open the Watch lab.
6. Activate transport on both.
7. Stage synthetic TLR plan on phone.
8. Commit staged plan on Watch.
9. Send commit receipt.
10. Force-quit phone app.
11. Reopen phone app and phone lab.
12. Confirm unresolved/recovery state is restored from local DB.
13. Seal synthetic package on Watch.
14. Transfer sealed package to phone.
15. Import latest package on phone.
16. Confirm `ackEligible = true`.
17. Send ack.
18. Confirm Watch records matching ack.
19. Repeat package transfer/import/ack.
20. Confirm no duplicate records and no overwrite.
21. Repeat one delayed/unreachable condition:
    - lock phone before receipt
    - force-quit phone before package transfer
    - background Watch app and reopen
    - temporarily break/recover Bluetooth only if comfortable

Expected pass criteria:

- no public Watch session starts
- no silent overwrite
- phone reload does not lose unresolved Watch session
- duplicate receipt/import/ack is idempotent
- connection failure produces retry/recovery state, not "nothing running"
- ack only occurs after transaction-wrapped import

Capture on failure:

- step number
- phone and Watch screen text
- activation and reachable state
- session ID
- plan hash first 8-12 chars
- package ID and package hash first 8-12 chars
- phone lab screenshot
- Watch lab screenshot/photo if possible
- whether phone/Watch app was killed, backgrounded, or locked

Use `docs/testing/watchconnectivity-transport-drill-results-template.md` for the
report.

## Not In This Lane Yet

No real heart-rate, motion, workout, haptic, audio, overnight runtime, or upload
testing is expected in this pass. The next phase after this lab should use the
same Internal TestFlight lane to harden retry/reconciliation behavior from real
device drill notes before adding real HealthKit/CoreMotion providers.
