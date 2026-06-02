# LucidCue

LucidCue is a planned React Native + TypeScript app for targeted lucidity
reactivation (TLR) lucid-dream induction.

The app is designed to be local-first, with optional consent-gated research
upload through Supabase. It currently contains the protocol, domain, onboarding,
session, local storage, sync-policy, native Phone runtime, native Watch runtime,
and theme foundations.

This is not a medical device or treatment, and results are not guaranteed.

## Current Status

- Phone Mode and Watch Mode are implemented for custom iOS development builds.
- Domain/session/report/journal types are defined before UI work.
- Onboarding is modeled as a single data-driven survey wizard.
- Local SQLite and Supabase schemas are scaffolded.
- Upload decisions are centralized and consent-gated.
- Watch Mode is code-complete for simulator/dev-build testing, but physical
  overnight reliability is not yet claimed.

## Development Builds

Physical-device testing of native iOS behavior requires a custom Expo
development build, not Expo Go. See [docs/dev-build.md](docs/dev-build.md).
The hidden iPhone locked-background feasibility harness is documented in
[docs/iphone-feasibility.md](docs/iphone-feasibility.md).
