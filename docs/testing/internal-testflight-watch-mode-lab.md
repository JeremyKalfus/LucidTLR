# Internal TestFlight Watch Mode Lab

## Purpose

Use this lane for Jeremy-based real-device Watch Mode recovery and sync testing.
TestFlight is preferred over dev builds for this stage because it removes
Metro, dev-client reload state, and Xcode-run lifecycle behavior from the test
environment.

This is still synthetic QA only. Public Watch Mode remains disabled, no real
overnight Watch Mode is available, and no uploads are added.

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

On Watch:

- Open the Watch app.
- Confirm the synthetic lab button is present only for the internal lab build.
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

## Not In This Lane Yet

No real heart-rate, motion, workout, WatchConnectivity, haptic, or audio testing
is expected in this pass. The next phase should add a synthetic
WatchConnectivity transport drill through this same internal TestFlight lab
lane before any real provider work.
