# iPhone Phone Mode Validation

This document records manual validation evidence for iPhone Phone Mode. It is an engineering validation log, not a public support claim or medical/therapeutic claim.

Legacy `LucidCue` URLs, filenames, and asset IDs below are retained only as
historical evidence from the May 30, 2026 validation run.

## Overnight Locked Run - May 30, 2026

### Test Context

- Test date: May 30, 2026
- Test subject: Jeremy
- Device: iPhone 15 Pro
- iOS version: 26.5
- Model number: MTU03LL/A
- App build URL: https://expo.dev/accounts/jeremykalfus/projects/lucidcue/builds/a72bea87-0b28-497e-96aa-cdc4c931bdcb
- EAS build ID: `a72bea87-0b28-497e-96aa-cdc4c931bdcb`
- EAS build profile: `development`
- Distribution: internal
- Platform: iOS physical device build
- Expo SDK: 56.0.0
- App version: 0.1.0
- App build version: 1
- Build commit: `959793c86b4b1e43b5a0cc1bfcdda931083260b6`
- Build commit message: `Add locked presleep training and phone runtime log export`
- Build completed: 2026-05-30T05:20:24.045Z

### Source Evidence

- Runtime export: `/Users/jeremykalfus/Downloads/lucidcue-phone-runtime-session-1780120828885-6355bef2c4bb14-2026-05-30T15_06_59.062Z.json`
- Exported at: 2026-05-30T15:06:59.062Z
- Runtime event count: 18,970
- Session ID: `session-1780120828885-6355bef2c4bb14`
- Session type/mode: TLR / phone
- Session status: morning review complete
- Protocol version: `tlr-2026-001`
- Native policy version: `iphone-phone-runtime-2026-001`

### Session Timeline

- App session started: 2026-05-30T06:00:28.885Z
- Training started: 2026-05-30T06:01:53.869Z
- Training ended: 2026-05-30T06:24:15.004Z
- Native runtime started: 2026-05-30T06:24:15.011Z
- Native runtime stopped: 2026-05-30T14:33:01.321Z
- App session ended: 2026-05-30T14:33:01.792Z
- Stop reason: user stopped
- Alarm enabled: false

Local EDT equivalents:

- App session started: 2:00:28 AM
- Training ended / runtime started: about 2:24:15 AM
- Runtime stopped: about 10:33:01 AM

### Audio Bed and Cue Settings

- Audio bed asset: `lucidcue-audible-bed-sine-220hz`
- Audio bed volume: 0.03
- Audio bed logged as audible: true
- Audio bed tone: 220 Hz
- Background audio option: white_noise
- Background audio volume: 0.035
- Binaural carrier frequency: 200 Hz
- Binaural beat frequency: 4 Hz
- Selected cue: `clear-bell-chime`
- Cue runtime asset: `clear_bell_chime.mp3`
- Cue volume range during runtime: 0.16 to 0.2544

### Cue Window and Cue Delivery

- Cue window policy: broad cue window
- Earliest cue time: 2026-05-30T12:24:14.797Z
- Latest cue time: 2026-05-30T14:40:00.000Z
- First runtime cue played: 2026-05-30T12:24:40.714Z
- Last runtime cue played: 2026-05-30T13:56:20.562Z
- Training cues played: 17
- Runtime cues attempted: 60
- Runtime cues played: 60
- Runtime cue failures: 0
- Cue budget exhausted events: 437

Cue drift:

- Drift samples: 60
- Minimum drift: 304 ms
- Median drift: 1,964 ms
- 95th percentile drift: 5,018 ms
- Maximum drift: 1,202,955 ms
- Mean drift: 62,117 ms

Note: the maximum and mean drift are dominated by a large outlier. The median and 95th percentile better represent normal cue playback timing in this run.

### Motion Logging

- Motion source: phone accelerometer
- Motion update interval: 0.2 seconds
- Motion summary interval: 5 seconds
- Motion summaries logged: 5,866
- First motion summary: 2026-05-30T06:24:20.666Z
- Last motion summary: 2026-05-30T14:33:01.069Z
- Motion summaries continued through the locked overnight runtime until stop.
- Movement pauses: 1

### Battery, Low Power, and Thermal

- Battery summaries logged: 711
- First battery summary: 50%, charging, Low Power Mode true, thermal nominal
- Last battery summary: 100%, unplugged, Low Power Mode false, thermal nominal
- Minimum logged battery level: 50%
- Maximum logged battery level: 100%
- Thermal states observed: nominal
- Low Power Mode true summaries: 18
- Low Power Mode false summaries: 693

### Interruptions, Routes, and Failures

- Runtime errors: 0
- Audio bed failures: 0
- Background audio failures: 0
- Cue failures: 0
- Training cue failures: 0
- Audio interruptions logged: 0
- Route changes logged: 0
- Background audio stopped: 1, at runtime stop
- Runtime stopped cleanly with reason `user_stopped`

### Result

This overnight locked iPhone Phone Mode run succeeded as an internal production-flow validation:

- Locked presleep training completed.
- Native iPhone runtime started after training.
- Audible audio bed started and remained sufficient for locked runtime execution.
- Native motion summaries continued while locked.
- Native decision ticks continued while locked.
- Runtime cues played during the scheduled cue window.
- Movement pause behavior was logged.
- Battery/thermal summaries were logged.
- The session stopped cleanly and was available for Morning Review.

This validates the observed behavior for this device/build/run only. Final public support should still wait for the broader manual suite: 10-minute kitchen sink, 30-minute movement, 2-hour locked flow, overnight repeat, interruption/route-change, Low Power Mode, and Sleep Focus checks.
