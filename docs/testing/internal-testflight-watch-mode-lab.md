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
npx eas build --platform ios --profile testflight-internal-lab --non-interactive --wait
```

After the build is available in App Store Connect, distribute it only through
Internal TestFlight. Do not use this profile for external beta or public
enablement.

Submit the latest successful build with the pinned submit profile:

```sh
npx eas submit --platform ios --latest --profile testflight-internal-lab --wait
```

Do not add external/public testers for this lane.

## Current EAS CLI Status

As of June 8, 2026, the internal lab lane is linked to the dedicated EAS project
`@jeremykalfus/lucidtlr`:

- EAS project ID: `b5900bca-cd97-4304-ab80-560efa783e43`
- App Store Connect app ID: `6777900695`
- Bundle IDs:
  - `com.jeremykalfus.lucidtlr`
  - `com.jeremykalfus.lucidtlr.watchkitapp`
- Submit API key: EAS-managed App Store Connect API key `KFK366A9JD`

Successful build:

- Build ID: `381e1d9b-4276-47db-8ea9-b23ddc46fef1`
- EAS build URL:
  `https://expo.dev/accounts/jeremykalfus/projects/lucidtlr/builds/381e1d9b-4276-47db-8ea9-b23ddc46fef1`
- IPA artifact:
  `https://expo.dev/artifacts/eas/7VVjXKta4LgJ7b44xp6Xu6.ipa`

The June 8 CLI submit succeeded and Apple processing started. The build appears
in App Store Connect after Apple finishes processing:
`https://appstoreconnect.apple.com/apps/6777900695/testflight/ios`.

Do not pass `--what-to-test` to `eas submit` for this project right now; EAS maps
that parameter to a changelog field that is Enterprise-plan only. Paste the text
below into the Internal TestFlight build notes manually.

## Phase A Close-Out And Build 15 Notebook

Date: June 10, 2026.

Phase A source close-out:

- Simulator shim commit: `fb98036` (`Add simulator-only transport shim for lab
  drills`), pushed to `origin/main`.
- Participant-id reload verdict: lab-only artifact. The drill can reset before a
  persisted onboarding participant exists, so a phone app relaunch may get a new
  transient participant id. Real onboarded users keep the persisted participant
  row across app restart through `AppState` hydration and `getLocalParticipant`.
- Final simulator soak: `npm run drill:sim-soak`, 10/10 consecutive full-matrix
  runs passed.
- Final soak timing: started `2026-06-10T19:16:46Z`, ended
  `2026-06-10T19:26:05Z`, duration about 9m19s after incremental build cache was
  warm.
- Matrix per run: baseline, phone reload, Watch reload, duplicate re-run,
  unreachable-watch/reconnect.
- Fixed non-counted flakes before the final soak:
  - `ENOTEMPTY` while wiping `/tmp/lucidtlr-sim-transport`; fixed by stopping
    the Watch writer before reset and retrying transient directory removal.
  - One fresh-export timeout from terminating the phone app before each reset;
    fixed by keeping the phone dev-client alive and only stopping the Watch
    writer before shim wipe.

Verification:

- `npm run typecheck` passed.
- `npm test` passed: 38 files, 240 tests.
- `npm run verify:watch-testflight-lab` passed.
- `git diff --check` passed.
- `graphify update .` passed.
- Exact iPhone simulator build passed:
  `xcodebuild -workspace ios/LucidTLR.xcworkspace -scheme LucidTLR -configuration Debug -destination 'platform=iOS Simulator,id=68B5B474-6340-4B1A-B63E-E18127856B8D' -derivedDataPath /tmp/lucidtlr-xcodebuild-lab-reset-hardening-iphone build`
- Exact Watch simulator build passed:
  `xcodebuild -workspace ios/LucidTLR.xcworkspace -scheme 'LucidTLR Watch App' -configuration Debug -destination 'platform=watchOS Simulator,id=8E651A1B-E7F2-4669-B578-C3AA8779B099' -derivedDataPath /tmp/lucidtlr-xcodebuild-lab-reset-hardening-watch build`

Build 15:

- EAS build ID: `7277fe80-1003-4b0c-8bd1-68ae9cb948c1`
- EAS build URL:
  `https://expo.dev/accounts/jeremykalfus/projects/lucidtlr/builds/7277fe80-1003-4b0c-8bd1-68ae9cb948c1`
- IPA artifact:
  `https://expo.dev/artifacts/eas/keQkevjeP4pAqm8qGNgTWJBjugCk_a1CVausyCEb1lc.ipa`
- EAS submission ID: `93babb06-8926-4072-a71c-7ab6f239f37f`
- EAS submission URL:
  `https://expo.dev/accounts/jeremykalfus/projects/lucidtlr/submissions/93babb06-8926-4072-a71c-7ab6f239f37f`
- App Store Connect TestFlight URL:
  `https://appstoreconnect.apple.com/apps/6777900695/testflight/ios`
- Submit status: uploaded to App Store Connect; Apple processing pending.

Next Jeremy action: install build 15 on iPhone and Watch, then run the Phase B
physical drill matrix: clean baseline, phone force-quit/reopen recovery, Watch
kill/reopen recovery, duplicate re-run, and unreachable-watch then reconnect.
Export the debug bundle after each drill and send the JSON files. Hardware
failures go to review, not repeated on-device iteration.

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
- Confirm `Export Watch Lab Debug Bundle` is present. It creates a local JSON
  file for Codex analysis, does not upload anything, and excludes dream journal
  content.
- For a clean non-interruption sanity check, use the baseline pair: tap
  `Run One-Button Baseline` on phone, tap `Run Watch baseline loop` on Watch if
  the phone waits for Watch proof, then tap the phone baseline again and export
  the bundle.

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

Use the baseline above for happy-path transport/import/ack sanity checks. Use
this drill when testing force-quit, background, lock, delayed delivery, or
unreachable behavior.

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
