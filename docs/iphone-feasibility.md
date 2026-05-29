# iPhone Locked-Background Feasibility Harness

This development-only harness tests whether iPhone Phone Mode can support
locked-phone adaptive behavior using a native background-audio session. It does
not implement production TLR, Watch Mode, Android behavior, research controls,
or cloud upload. Normal Phone Mode no longer routes through this screen.

Open the hidden debug route manually:

```text
/debug/iphone-feasibility
```

In a development build, start Metro with:

```sh
npx expo start --dev-client
```

Then open the route in the installed LucidCue development client.

## What It Tests

Inspect persisted local logs for:

- `cue_scheduled`, `cue_play_attempted`, `cue_played`, `cue_failed`
- cue drift fields: `plannedCueAt`, `actualCueAttemptAt`, `actualCuePlayedAt`, `driftMs`
- `audio_session_configured`, `audio_route_changed`, `audio_interruption_started`, `audio_interruption_ended`
- `audio_bed_volume_changed`, `audio_bed_paused`, `audio_bed_resumed`
- `audio_segment_preloaded`, `audio_segment_play_attempted`, `audio_segment_played`, `audio_segment_completed`, `audio_segment_failed`
- `native_audio_decision_made`
- `motion_started`, `motion_summary`, `motion_stopped`
- `battery_summary`, `thermal_state_changed`
- `app_backgrounded`, `app_foregrounded`, `app_will_terminate`
- `protected_data_available`, `protected_data_unavailable`
- `notification_scheduled`, `notification_fired`
- `session_restored`, `session_stopped`, `session_error`

Logs are stored locally by the native iOS module and are not uploaded.

## Locked-Runtime Findings

- Locked native background audio worked when an audible audio bed was running.
- Locked native motion logging worked while the audio bed was running.
- Mattress movement was separable from stillness in motion summaries.
- Native timers and native decision-making continued while the audio bed was
  running.
- Native cue segment playback worked while locked.
- The no-audio-bed locked control failed; the cue only fired after the app
  returned foreground.

Production iPhone Phone Mode therefore requires a legitimate audible background
audio bed. It must not use silent-audio hacks, notification fallback as the
primary behavior, raw microphone recording, or React Native/JS timers for locked
runtime behavior.

## Presets

Use a physical iPhone. For locked tests, start the test, lock the phone, keep it
charging, then return after the test duration and inspect logs.

1. Foreground sanity cue: 30-second cue, 120-second test, audio bed on.
2. Locked audio short: 10-minute cue, 12-minute test, audio bed on.
3. Locked audio control: 10-minute cue, 12-minute test, audio bed off.
4. Locked motion short: 10-minute cue, 30-minute test, audio bed on, motion on.
5. Locked motion control: same as motion short with audio bed off.
6. Kitchen sink audio test: 15-minute locked test with audio bed control, bundled
   low/medium/high segment playback, native random segment selection, and motion on.
7. Interruption test: locked motion short plus call/alarm/Siri/AirPods/Bluetooth route change.
8. Low Power Mode test: locked motion short after manually enabling Low Power Mode.
9. Sleep Focus test: locked audio short after enabling Sleep Focus or Do Not Disturb.
10. Notification fallback test: 10-minute local notification cue, audio bed off.
11. Two-hour locked test: one-hour cue, two-hour test, audio bed and motion on.
12. Overnight locked test: configurable, default four-hour cue and eight-hour duration.
13. Recovery behavior: run a locked test, reopen or relaunch, and confirm logs persisted.

For the locked motion short tests, place the phone on the mattress beside the
pillow and alternate stillness, light body shift, stillness, large roll,
stillness, mattress tap/shift, and stillness.

For the kitchen sink audio test, inspect logs for:

- `audio_segment_preloaded` for all three bundled WAV files.
- `audio_bed_volume_changed`, `audio_bed_paused`, and `audio_bed_resumed` while
  `appState` is `background`.
- `audio_segment_played` for explicit low/high bundled segments.
- `native_audio_decision_made` followed by `audio_segment_played` while locked.
- A primary `cue_played` near the 10-minute planned timestamp, backed by one of
  the selected bundled segment files rather than the generated test tone.

## Decision Tree

If locked audio short fails:

- iPhone locked Option 2 is not viable.
- Future iPhone users need foreground dim-screen adaptive mode or locked
  historical-prior timed/notification fallback.

If locked audio short passes but locked motion fails:

- iPhone locked timed cueing is viable.
- iPhone Phone Mode should use historical sleep priors plus native timed cues.
- Do not depend on continuous movement gating while locked.

If locked audio and locked motion both pass:

- iPhone locked adaptive Phone Mode may be viable.
- A later production spike can wire native audio cues, native motion summaries,
  engine decisions, and local cue/movement logs.

If overnight fails after short tests pass:

- Keep Option 2 experimental/advanced until reliability improves.

Do not claim production locked adaptive Phone Mode works until physical-device
logs pass the relevant locked tests.
