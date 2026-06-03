# LucidCue

LucidCue is a planned React Native + TypeScript app for targeted lucidity
reactivation (TLR) lucid-dream induction.

The app is designed to be local-first, with optional consent-gated research
upload through Supabase. It currently contains the protocol, domain, onboarding,
session, local storage, sync-policy, native Phone runtime, native Watch runtime,
and theme foundations.

This is not a medical device or treatment, and results are not guaranteed.

## Current Status

- Phone Mode is implemented for custom iOS development builds and remains
  iPhone-owned.
- Domain/session/report/journal types are defined before UI work.
- Onboarding is modeled as a single data-driven survey wizard.
- Local SQLite and Supabase schemas are scaffolded.
- Upload decisions are centralized and consent-gated.
- Watch Mode v2 targets Watch-owned overnight operation: the iPhone syncs the
  plan/assets/model before sleep and imports Watch logs after waking.
- WatchConnectivity is for pre-sleep sync and morning log import, not live cue
  timing.
- Watch Mode uses experimental REM probability, not validated sleep staging. It
  does not use GPS, SensorKit, live Apple sleep stages, wrist temperature,
  respiratory rate, or SpO2.
- The current phone-dependent Watch runtime is legacy; Watch-owned v2 is the
  target, and physical overnight reliability is not yet claimed.

## Development Builds

Physical-device testing of native iOS behavior requires a custom Expo
development build, not Expo Go. See [docs/dev-build.md](docs/dev-build.md).
The hidden iPhone locked-background feasibility harness is documented in
[docs/iphone-feasibility.md](docs/iphone-feasibility.md).
