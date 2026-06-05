# Watch Mode Implementation

LucidCue Phone Mode remains unchanged: the iPhone owns its overnight audio bed,
cue playback, native timing, and runtime logs.

Watch Mode v2 is Watch-owned overnight. The phone first locks on `Waiting for
Watch Sync`; the Watch shows `Sync Phone`, and the user taps that Watch button
to pull the plan/data and start the Watch-owned runtime. Overnight, the Apple
Watch owns training playback, sensor collection, 30-second epoch processing,
experimental REM probability, cue timing, cue delivery, movement gates, and
local runtime logs. The iPhone is sync/status UI only. Background sleep audio is
Phone Mode only. After `Wake` on the Watch,
the Watch waits for phone sync and the phone shows `Sync Watch` to import v2
Watch logs. WatchConnectivity is for start sync, status, and morning log import,
not live cue timing.

For Log Sleep Only / No TLR nights, Watch Mode still uses the Watch-owned
overnight runtime for sensing and logs, but the synced plan disables cue
delivery.

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

Watch epoch and runtime data stay local by default and should stay compatible
with future consented research exports. Raw motion debug payloads are not
persisted by default and should not be uploaded without a separate explicit
consent path.

Watch-owned v2 is the current Watch Mode architecture. It should still be
treated as engineering beta for physical overnight use until these checks pass:

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
