# iOS Development Build

LucidCue needs a custom iOS development build before testing locked-background
behavior. Expo Go is not sufficient for this project because Expo Go cannot
include LucidCue-specific native modules, iOS background-mode entitlements, or
custom native audio/motion behavior.

This setup does not add production native TLR logic, Watch Mode, or any science
protocol changes. It only prepares the app to run custom native iOS code on a
physical iPhone.

## One-time Setup

Install dependencies:

```sh
npm install
```

Install the EAS CLI:

```sh
npm install --global eas-cli
```

Log in to Expo:

```sh
eas login
```

Configure the EAS project:

```sh
eas build:configure --platform ios
```

If this is the first internal iOS build for this iPhone, register the device:

```sh
eas device:create
```

## Create an iOS Development Build

Build the iOS development client for a physical iPhone:

```sh
eas build --platform ios --profile development
```

When the build finishes, open the EAS build URL on the iPhone or scan the QR
code from the build page to install it. If EAS reports that the iPhone is not in
the provisioning profile, run `eas device:create`, then rebuild.

## Run Metro

Start Metro for the installed development client:

```sh
npx expo start --dev-client
```

Open the LucidCue development build on the iPhone and connect to the Metro
server shown by Expo. If the phone cannot reach the computer on the local
network, retry with:

```sh
npx expo start --dev-client --tunnel
```

## Native Project

The `ios/` project has been generated from Expo config. Regenerate it after
Expo config changes with:

```sh
npx expo prebuild --platform ios
```

Use this when changing native iOS files, entitlements, or config plugins. The
feasibility harness adds iOS background audio mode for testing only; do not treat
that as production TLR support until physical-device logs pass.

## iPhone Feasibility Harness

The hidden native locked-background harness lives at:

```text
/debug/iphone-feasibility
```

See [iphone-feasibility.md](iphone-feasibility.md) for the physical-device test
matrix and decision tree.

## 45-Minute Production Runtime Smoke Test

Development builds also include a hidden production-runtime smoke test:

```text
/debug/iphone-kitchen-sink
```

This route is dev-only. It starts the real native iPhone Phone runtime with a
compressed 45-minute test plan, an audible audio bed, motion summaries, native
cue scheduling, a test-only predicted REM window, local native logs, and log
sharing/import controls. It is for locked-device stress testing only and does
not change the public Phone Mode protocol.
