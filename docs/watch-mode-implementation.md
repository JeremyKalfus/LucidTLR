# Watch Mode Implementation

LucidCue Phone Mode remains unchanged: the iPhone owns its overnight audio bed,
cue playback, native timing, and runtime logs.

Watch Mode v2 is Watch-owned overnight. Before sleep, the iPhone prepares and
syncs the session plan, cue assets, and bundled Watch REM model through
WatchConnectivity. Overnight, the Apple Watch owns sensor collection,
30-second epoch processing, experimental REM probability, cue timing, cue
delivery, movement gates, and local runtime logs. After waking, the iPhone
imports Watch epoch, cue, and movement logs. WatchConnectivity is for pre-sleep
sync and morning log import, not live cue timing.

The Mallela random-forest model asset is exported from the public
`rmallela26/TLR` training CSVs and source at commit
`9cc30e7157696331dbb79e0cf43f164cfc9685c2`. The native Watch runtime loads the
bundled model as the experimental REM-probability signal for
`lucidcue-watch-rem-v1`, then adds LucidCue safety gates for sensor quality,
movement stability, cue budget, recent cueing, cue-associated movement, and
persistent likely-REM suppression beginning with the fifth consecutive
likely-REM epoch. This is REM-informed cueing, not validated sleep staging or a
claim of exact Mallela feature parity.

Watch Mode uses Watch-accessible heart rate, triaxial motion, and elapsed time.
It does not use GPS, SensorKit, live Apple sleep stages, wrist temperature,
respiratory rate, or SpO2.

Watch epoch and runtime data stay local by default. Raw motion debug payloads
are not persisted by default and should not be uploaded without a separate
explicit consent path.

Implementation status: the current phone-dependent Watch runtime is legacy.
Watch-owned Watch Mode v2 is the target.

Legacy simulator/dev-build validation can use the DEBUG-only iPhone launch
argument `--lucidcue-watch-runtime-self-test`. It injects one synthetic
likely-REM epoch through the native Watch runtime and writes local Watch runtime
logs without persisting raw motion.

The legacy phone-dependent Watch runtime has simulator and development-build
validation coverage. Watch-owned v2 should be treated as experimental for
physical overnight use until these checks pass:

1. Watch app installs and receives the pre-sleep plan/assets/model sync.
2. A 10-minute test produces reliable 30-second epochs in local storage.
3. A 30-minute sensor test shows sane HR, motion, battery, and connectivity.
4. A 2-hour test confirms epoch continuity and battery trend without live iPhone
   cue timing.
5. An overnight test confirms full-night battery and missing-data behavior.
6. Classifier replay verifies the REM threshold, sensor-quality gate, movement
   gate, cue budget, and five-epoch suppression.
7. Physical overnight reliability is validated on a paired Apple Watch and
   iPhone.
