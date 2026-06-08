import { describe, expect, it } from "vitest";

declare const require: (moduleName: string) => any;

const { existsSync, readFileSync } = require("fs");
const path = require("path");
const repoRoot = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function fileExists(relativePath: string): boolean {
  return existsSync(path.join(repoRoot, relativePath));
}

const preflightSwiftFiles = [
  "ios/LucidTLR Watch App/Runtime/WatchRuntimeCapabilities.swift",
  "ios/LucidTLR Watch App/Runtime/WatchRuntimePreflight.swift",
  "ios/LucidTLR Watch App/Runtime/WatchRuntimeStartGate.swift",
  "ios/LucidTLR Watch App/Runtime/SyntheticPreflightProvider.swift",
  "ios/LucidTLR Watch App/Runtime/WatchRuntimePreflightFixtures.swift",
];

describe("Watch Mode v3 preflight architecture", () => {
  it("adds preflight Swift files to the Watch target", () => {
    const project = readSource("ios/LucidTLR.xcodeproj/project.pbxproj");

    for (const file of preflightSwiftFiles) {
      const fileName = path.basename(file);

      expect(fileExists(file)).toBe(true);
      expect(project).toContain(`${fileName} in Sources`);
    }
  });

  it("keeps preflight scaffolding free of real runtime frameworks and starts", () => {
    const forbidden = [
      "import HealthKit",
      "import CoreMotion",
      "import WatchConnectivity",
      "import AVFoundation",
      "HKWorkoutSession",
      "startUpdating",
      "startDeviceMotionUpdates",
      "startAccelerometerUpdates",
      "WKInterfaceDevice.play",
      "AVAudioPlayer",
    ];
    const combined = preflightSwiftFiles.map(readSource).join("\n");

    for (const token of forbidden) {
      expect(combined).not.toContain(token);
    }
  });

  it("models the hard start gates and provider protocols", () => {
    const capabilities = readSource(
      "ios/LucidTLR Watch App/Runtime/WatchRuntimeCapabilities.swift",
    );
    const preflight = readSource(
      "ios/LucidTLR Watch App/Runtime/WatchRuntimePreflight.swift",
    );

    for (const protocolName of [
      "BatteryStatusProviding",
      "PowerModeProviding",
      "HealthAuthorizationProviding",
      "WorkoutRuntimeCapabilityProviding",
      "MotionCapabilityProviding",
      "CueOutputCapabilityProviding",
      "AssetAvailabilityProviding",
      "PlanCommitProviding",
    ]) {
      expect([capabilities, readSource(
        "ios/LucidTLR Watch App/Runtime/WatchRuntimeProtocols.swift",
      )].join("\n")).toContain(protocolName);
    }

    for (const reason of [
      "lowBattery",
      "lowPowerModeEnabled",
      "healthKitNotAuthorized",
      "workoutRuntimeUnavailable",
      "motionUnavailable",
      "noCueOutputAvailable",
      "hapticPreflightMissing",
      "audioPreflightMissing",
      "missingRequiredAsset",
      "missingRequiredModel",
      "planNotCommitted",
      "invalidPlan",
      "storageUnavailable",
    ]) {
      expect(preflight).toContain(reason);
    }
  });

  it("enforces preflight through the synthetic coordinator start gate", () => {
    const coordinator = readSource(
      "ios/LucidTLR Watch App/Runtime/WatchSessionCoordinator.swift",
    );
    const startGate = readSource(
      "ios/LucidTLR Watch App/Runtime/WatchRuntimeStartGate.swift",
    );

    expect(coordinator).toContain("WatchRuntimeStartGate.evaluate");
    expect(coordinator).toContain("requiresStartPreflight");
    expect(coordinator).toContain("preflightBlocked");
    expect(coordinator).toContain("lastPreflightResult");
    expect(startGate).toContain("requirePassingPreflight");
    expect(startGate).toContain("WatchRuntimeProviderBackedPreflightProvider");
  });

  it("adds synthetic preflight fixtures for all-pass and blocked states", () => {
    const synthetic = readSource(
      "ios/LucidTLR Watch App/Runtime/SyntheticPreflightProvider.swift",
    );
    const fixtures = readSource(
      "ios/LucidTLR Watch App/Runtime/WatchRuntimePreflightFixtures.swift",
    );

    for (const scenario of [
      "allPass",
      "lowBattery",
      "lowPowerModeOn",
      "missingHealthAuthorization",
      "missingWorkoutRuntime",
      "missingMotion",
      "missingCueOutput",
      "missingHapticPreflight",
      "missingAudioPreflight",
      "missingAsset",
      "missingModel",
      "noPlanCommit",
    ]) {
      expect(synthetic).toContain(scenario);
      expect(fixtures).toContain(scenario);
    }
  });

  it("shows synthetic preflight states in the DEBUG Watch lab", () => {
    const labView = readSource("ios/LucidTLR Watch App/WatchModeLabView.swift");
    const labModel = readSource("ios/LucidTLR Watch App/WatchModeLabViewModel.swift");
    const contentView = readSource("ios/LucidTLR Watch App/ContentView.swift");
    const combined = `${labView}\n${labModel}`;

    expect(labView).toContain(
      "#if DEBUG || EXPO_CONFIGURATION_DEBUG || LUCIDTLR_INTERNAL_TESTFLIGHT_LAB",
    );
    expect(contentView).toContain(
      "#if DEBUG || EXPO_CONFIGURATION_DEBUG || LUCIDTLR_INTERNAL_TESTFLIGHT_LAB",
    );
    expect(combined).toContain("Show all-pass preflight");
    expect(combined).toContain("Simulate low battery");
    expect(combined).toContain("Simulate Low Power Mode");
    expect(combined).toContain("Simulate missing HealthKit");
    expect(combined).toContain("Simulate missing motion");
    expect(combined).toContain("Simulate missing cue output");
    expect(combined).toContain("Simulate missing audio preflight");
    expect(combined).toContain("Run 10-minute synthetic TLR without preflight");
    expect(combined).toContain("Run 10-minute synthetic TLR with preflight");
    expect(combined).toContain("WatchRuntimePreflightFixtures");
    expect(combined).toContain("SyntheticPreflightProvider");
  });

  it("keeps public Watch Mode disabled and public phone screens disconnected", () => {
    const availability = readSource("src/features/watchMode/watchModeAvailability.ts");
    const home = readSource("src/screens/HomeScreen.tsx");
    const appState = readSource("src/state/AppState.tsx");
    const publicScreens = [
      "src/screens/HomeScreen.tsx",
      "src/screens/ActiveNightSessionScreen.tsx",
      "src/screens/PresleepTrainingScreen.tsx",
      "src/screens/MorningReviewScreen.tsx",
      "src/screens/DataScreen.tsx",
      "src/screens/SettingsScreen.tsx",
    ].map(readSource).join("\n");

    expect(availability).toContain("WATCH_MODE_ENABLED = false");
    expect(home).toContain("WATCH_MODE_DISABLED_MESSAGE");
    expect(appState).toContain("throw new Error(WATCH_MODE_DISABLED_MESSAGE)");
    expect(publicScreens).not.toContain("@/src/native/watchRuntime");
    expect(publicScreens).not.toContain("WatchRuntimeStartGate");
    expect(publicScreens).not.toContain("WatchRuntimePreflight");
    expect(publicScreens).not.toContain("startWatch");
  });

  it("does not introduce transport or a phone-side native Watch bridge", () => {
    const sourceFiles = [
      ...preflightSwiftFiles,
      "ios/LucidTLR Watch App/WatchModeLabView.swift",
      "ios/LucidTLR Watch App/WatchModeLabViewModel.swift",
      "src/features/watchModeLab/watchModeLab.ts",
      "src/screens/WatchModeLabScreen.tsx",
      "app/debug/watch-mode-lab.tsx",
    ];
    const combined = sourceFiles.map(readSource).join("\n");

    expect(combined).not.toContain("import WatchConnectivity");
    expect(combined).not.toContain("NativeModules");
    expect(combined).not.toContain("watchRuntimeClient");
    expect(fileExists("src/native/watchRuntime/watchRuntimeClient.ts")).toBe(false);
  });

  it("keeps the phone lab synthetic-only and importer transaction-wrapped", () => {
    const screen = readSource("src/screens/WatchModeLabScreen.tsx");
    const importer = readSource("src/features/watchHistory/importWatchPackage.ts");
    const localDb = readSource("src/data/local/localDb.ts");

    expect(screen).toContain("Internal TestFlight Lab -- synthetic / QA only");
    expect(screen).toContain("Public Watch Mode remains disabled");
    expect(screen).toContain("real Watch sensors");
    expect(screen).toContain("ack eligible");
    expect(importer).toContain("withTransaction");
    expect(importer).toContain("requires LocalDb.withTransaction");
    expect(localDb).toContain("withTransaction?");
  });
});
