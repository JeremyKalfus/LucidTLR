# Watch Mode Implementation Status

Watch Mode is visible but disabled in the current LucidTLR implementation.

Current behavior:

- Phone Mode remains implemented and phone-owned.
- Watch Mode choices, buttons, settings, and data placeholders remain visible.
- Watch Mode cannot start a new TLR or No TLR night.
- Active stale Watch sessions render a local placeholder and can be ended locally.
- The app no longer calls the native Watch runtime, Watch app runtime, Watch import, or Watch-owned sync code.
- Historical local `watch_epochs` and `watch_runtime_events` rows remain readable in Data, diagnostics, and full local exports.
- Legacy full local exports with `lucidcue-full-local-data-v1` remain importable.

Future Watch rebuild work should start from the source-of-truth product/science
contract and must not assume the removed v2 runtime is still active.
