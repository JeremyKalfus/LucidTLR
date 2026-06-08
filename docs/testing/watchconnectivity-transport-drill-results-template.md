# WatchConnectivity Transport Drill Results Template

Use this template for the Internal TestFlight synthetic WatchConnectivity
transport drill. This is synthetic QA only: no real HR, motion, workout,
haptic, audio, REM, overnight runtime, uploads, or public Watch Mode behavior is
being tested.

## Build

- Build profile: `testflight-internal-lab`
- Build URL:
- iPhone model / iOS:
- Watch model / watchOS:
- Installed from TestFlight on iPhone: yes / no
- Watch app installed from matching TestFlight build: yes / no

## Pass Criteria

- Public Watch Mode remains disabled.
- No public Watch session starts.
- No active/unacked Watch lab session is silently overwritten.
- Phone reload preserves unresolved Watch session recovery from local DB state.
- Duplicate commit receipt, package import, and ack are idempotent.
- Connection failures produce retry/recovery state, not "nothing running".
- Ack is sent only after transaction-wrapped package import reports
  `ackEligible = true`.

## Drill Checklist

1. Install the Internal TestFlight build on iPhone.
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

## Failure Capture

If anything fails, capture:

- Step number:
- Phone screen text:
- Watch screen text:
- Activation state:
- Reachable state:
- Session ID:
- Plan hash, first 8-12 chars:
- Package ID:
- Package hash, first 8-12 chars:
- Phone lab screenshot attached: yes / no
- Watch screenshot/photo attached: yes / no
- Phone app killed/backgrounded/locked: yes / no
- Watch app killed/backgrounded: yes / no
- Notes:

## Result

- Overall result: pass / fail / partial
- Blocking issue:
- Retry performed: yes / no
- Final unresolved phone state:
- Final unacked Watch state:
