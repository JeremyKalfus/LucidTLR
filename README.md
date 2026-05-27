# LucidCue

LucidCue is a planned React Native + TypeScript app for targeted lucidity
reactivation (TLR) lucid-dream induction.

The app is designed to be local-first, with optional consent-gated research
upload through Supabase. It currently contains the protocol, domain, onboarding,
session, local storage, sync-policy, native-boundary, and theme scaffolding.

This is not a medical device or treatment, and results are not guaranteed.

## Current Status

- Phone Mode and Watch Mode protocol scaffolding is defined in `src/protocol`.
- Domain/session/report/journal types are defined before UI work.
- Onboarding is modeled as a single data-driven survey wizard.
- Local SQLite and Supabase schemas are scaffolded.
- Upload decisions are centralized and consent-gated.
- Native overnight behavior is represented by TypeScript adapter interfaces.

Study PDFs used for local project reference are intentionally not committed to
the public repository by default.
