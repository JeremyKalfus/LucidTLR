# Watch Mode Implementation

LucidCue Phone Mode remains the working native audio baseline: the iPhone owns
the overnight audio bed, cue playback, native timing, and runtime logs.

Watch Mode extends that baseline rather than replacing it. The Apple Watch is
the sensing device, collecting heart rate, triaxial motion, elapsed time,
battery, and connectivity in 30-second epochs. The iPhone receives those epochs
through WatchConnectivity, stores them locally, and remains the cue/audio device.

The Mallela random-forest model asset is exported from the public
`rmallela26/TLR` training CSVs and source at commit
`9cc30e7157696331dbb79e0cf43f164cfc9685c2`. The native Watch runtime loads the
bundled model as the REM-probability signal for `lucidcue-watch-rem-v1`, then
adds LucidCue safety gates for sensor quality, sleep probability, movement
stability, cue budget, recent cueing, cue-associated movement, and five-epoch
persistent likely-REM suppression. This is not claimed as exact Mallela feature
parity.

Watch epoch and runtime data stay local by default. Raw motion debug payloads
are not persisted by default and should not be uploaded without a separate
explicit consent path.

Simulator/dev-build validation can use the DEBUG-only iPhone launch argument
`--lucidcue-watch-runtime-self-test`. It injects one synthetic likely-REM epoch
through the native Watch runtime and writes local Watch runtime logs without
persisting raw motion.

Watch Mode is code-complete for simulator and development-build testing. It is
still experimental for physical overnight use until these checks pass:

1. Watch app installs and connects to the iPhone app.
2. A 10-minute test produces reliable 30-second epochs in local storage.
3. A 30-minute sensor test shows sane HR, motion, battery, and connectivity.
4. A 2-hour test confirms epoch continuity and battery trend.
5. An overnight test confirms full-night battery and missing-data behavior.
6. Classifier replay verifies the REM threshold, sleep gate, movement gate, cue
   budget, and five-epoch suppression.
7. Physical overnight reliability is validated on a paired Apple Watch and
   iPhone.
