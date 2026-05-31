# Watch Mode Implementation

LucidCue Phone Mode remains the working native audio baseline: the iPhone owns
the overnight audio bed, cue playback, native timing, and runtime logs.

Watch Mode extends that baseline rather than replacing it. The Apple Watch is
the sensing device, collecting heart rate, triaxial motion, elapsed time,
battery, and connectivity in 30-second epochs. The iPhone receives those epochs
through WatchConnectivity, stores them locally, and remains the cue/audio device.

The Mallela random-forest model asset is exported from the public
`rmallela26/TLR` training CSVs and source at commit
`9cc30e7157696331dbb79e0cf43f164cfc9685c2`. The current native Watch runtime
still treats live REM cueing as disabled until exact native feature parity and
physical watch validation are complete.

Watch epoch and runtime data stay local by default. Raw motion debug payloads
are not persisted by default and should not be uploaded without a separate
explicit consent path.

Watch Mode is experimental until these physical checks pass:

1. Watch app installs and connects to the iPhone app.
2. A 10-minute test produces reliable 30-second epochs in local storage.
3. A 30-minute sensor test shows sane HR, motion, battery, and connectivity.
4. A 2-hour test confirms epoch continuity and battery trend.
5. An overnight test confirms full-night battery and missing-data behavior.
6. Classifier replay verifies the REM threshold and five-epoch suppression.
7. Production cueing is enabled only after live model/features/audio behavior is
   validated on a paired Apple Watch and iPhone.
