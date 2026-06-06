# 002: Phone Mode Is Phone-Owned

## Decision

Phone Mode is phone-owned. The iPhone owns presleep training, overnight audio,
cue timing, movement pauses, cue playback, and native phone logs for Phone Mode.

## Rationale

Phone Mode follows the Konkoly-style phone-based at-home TLR path. It is not a
fallback or lesser version of Watch Mode; it has its own runtime, logs, and
validation boundary.

## Rejected Alternatives

- Moving Phone Mode cue timing to Watch code.
- Treating Phone Mode as a fallback implementation detail of Watch Mode.
- Weakening Phone Mode claims or behavior because Watch Mode exists.

## Consequences

- Phone Mode changes should use the native phone runtime and phone session plan.
- Watch Mode cleanup must not remove or degrade Phone Mode behavior.
- Shared concepts such as cue assets and sleep priors may be reused, but runtime
  ownership stays separate.

## Key Files

- `TLR_App_Plan.md`
- `src/native/phoneRuntime/`
- `ios/LucidTLR/LucidTLRPhoneRuntime.swift`
- `src/screens/PresleepTrainingScreen.tsx`
- `src/screens/ActiveNightSessionScreen.tsx`
