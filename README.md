# LucidTLR

LucidTLR is a React Native + TypeScript app for targeted lucidity reactivation
(TLR).

The app is local-first, with optional consent-gated research upload through
Supabase. It contains the protocol, domain, onboarding, session, local storage,
sync-policy, native iPhone Phone Mode runtime, disabled Watch Mode placeholders,
and theme foundations.

This is not a medical device or treatment, and results are not guaranteed.

## Current Status

- Phone Mode is implemented for custom iOS development builds and remains
  iPhone-owned.
- Watch Mode remains visible in UI as a planned option, but cannot start nights
  in this build.
- Historical local Watch rows in `watch_epochs` and `watch_runtime_events`
  remain readable in Data, diagnostics, and full local exports.
- Domain/session/report/journal types are defined.
- Onboarding is modeled as a single data-driven survey wizard.
- Local SQLite and Supabase schemas are scaffolded.
- Upload decisions are centralized and consent-gated.

## Development Builds

Physical-device testing of native iOS behavior requires a custom Expo
development build, not Expo Go. See [docs/dev-build.md](docs/dev-build.md).
The hidden iPhone locked-background feasibility harness is documented in
[docs/iphone-feasibility.md](docs/iphone-feasibility.md).
