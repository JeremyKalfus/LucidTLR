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

const watchLabSwiftFiles = [
  "ios/LucidTLR Watch App/WatchModeLabView.swift",
  "ios/LucidTLR Watch App/WatchModeLabViewModel.swift",
  "ios/LucidTLR Watch App/WatchModeProductView.swift",
  "ios/LucidTLR Watch App/WatchNightSessionController.swift",
];

const realProviderSwiftFiles = [
  "ios/LucidTLR Watch App/Runtime/RealBatteryProvider.swift",
  "ios/LucidTLR Watch App/Runtime/RealPowerModeProvider.swift",
  "ios/LucidTLR Watch App/Runtime/HealthKitHeartRateProvider.swift",
  "ios/LucidTLR Watch App/Runtime/CoreMotionProvider.swift",
  "ios/LucidTLR Watch App/Runtime/RealCueOutputProvider.swift",
  "ios/LucidTLR Watch App/Runtime/RealWatchRuntimePreflightProvider.swift",
  "ios/LucidTLR Watch App/Runtime/RealtimeWatchClock.swift",
];

describe("Watch Mode v3 hidden lab architecture", () => {
  it("adds a gated phone lab route and hidden settings affordance", () => {
    const route = readSource("app/debug/watch-mode-lab.tsx");
    const screen = readSource("src/screens/WatchModeLabScreen.tsx");
    const settings = readSource("src/screens/SettingsScreen.tsx");
    const flags = readSource("src/features/internalBuild/internalBuildFlags.ts");

    expect(route).toContain("WatchModeLabScreen");
    expect(screen).toContain("if (!isWatchModeLabAvailable())");
    expect(screen).toContain("<Redirect href=\"/\" />");
    expect(screen).toContain("Internal TestFlight Lab -- synthetic / QA only");
    expect(screen).toContain("Public Watch Mode remains disabled");
    expect(screen).toContain("real Watch sensors");
    expect(screen).toContain("WatchConnectivity");
    expect(screen).toContain("real overnight Watch Mode");
    expect(settings).toContain("isWatchModeLabAvailable()");
    expect(settings).toContain("/debug/watch-mode-lab");
    expect(settings).toContain("Internal TestFlight Lab -- synthetic / QA only");
    expect(flags).toContain("EXPO_PUBLIC_WATCH_MODE_LAB_ENABLED");
    expect(flags).toContain("WATCH_MODE_PUBLIC_ENABLED = WATCH_MODE_ENABLED");
  });

  it("uses the existing plan builder, fixtures, and transaction-wrapped importer", () => {
    const helper = readSource("src/features/watchModeLab/watchModeLab.ts");
    const screen = readSource("src/screens/WatchModeLabScreen.tsx");

    expect(helper).toContain("buildWatchRuntimePlan");
    expect(helper).toContain("buildSyntheticTlrWatchPackageFixture");
    expect(helper).toContain("buildSyntheticSleepLogWatchPackageFixture");
    expect(helper).toContain("importWatchPackage");
    expect(helper).toContain("validateWatchPackageForImport");
    expect(helper).toContain("allowExperimentalAudio: false");
    expect(screen).toContain("importSyntheticWatchModeLabPackage");
    expect(screen).toContain("Re-import synthetic TLR package");
    expect(screen).toContain("Validate corrupt package");
  });

  it("adds Watch lab Swift files to the Watch target", () => {
    const project = readSource("ios/LucidTLR.xcodeproj/project.pbxproj");

    for (const file of watchLabSwiftFiles) {
      const fileName = path.basename(file);

      expect(fileExists(file)).toBe(true);
      expect(project).toContain(`${fileName} in Sources`);
    }
  });

  it("keeps Watch lab entrypoints gated while allowing the Phase C provider switch", () => {
    const forbidden = [
      "import HealthKit",
      "import CoreMotion",
      "import WatchConnectivity",
      "import AVFoundation",
      "HKWorkoutSession",
      "WKInterfaceDevice.play",
    ];
    const combined = watchLabSwiftFiles.map(readSource).join("\n");

    for (const token of forbidden) {
      expect(combined).not.toContain(token);
    }

    expect(combined).toContain("SyntheticHeartRateProvider");
    expect(combined).toContain("SyntheticMotionProvider");
    expect(combined).toContain("SyntheticBatteryProvider");
    expect(combined).toContain("SyntheticCueOutputProvider");
    expect(combined).toContain("Run real-provider session (forced cue)");
    expect(combined).toContain("apply forced cue");
    expect(combined).toContain("HealthKitHeartRateProvider");
    expect(combined).toContain("CoreMotionProvider");
    expect(combined).toContain("RealCueOutputProvider");
    expect(combined).toContain("WatchFileBackedLogStore");
    expect(combined).toContain("WatchPackageStore");
    expect(combined).toContain("SleepShieldView");
    expect(combined).toContain("retained until matching ack");
  });

  it("adds real provider files to the Watch target behind explicit allowlists", () => {
    const project = readSource("ios/LucidTLR.xcodeproj/project.pbxproj");

    for (const file of realProviderSwiftFiles) {
      const fileName = path.basename(file);

      expect(fileExists(file)).toBe(true);
      expect(project).toContain(`${fileName} in Sources`);
    }

    const frameworkTokens = [
      "import HealthKit",
      "import CoreMotion",
      "import AVFoundation",
      "HKWorkoutSession",
      "startAccelerometerUpdates",
      "WKInterfaceDevice.play",
      "AVAudioPlayer",
    ];
    const frameworkHits = [
      ...realProviderSwiftFiles,
      ...watchLabSwiftFiles,
      "ios/LucidTLR Watch App/Connectivity/WatchTransportCoordinator.swift",
      "ios/LucidTLR/LucidTLRWatchTransport.swift",
    ].filter((file) =>
      frameworkTokens.some((token) => readSource(file).includes(token)),
    );

    expect(frameworkHits.sort()).toEqual(
      realProviderSwiftFiles
        .filter((file) =>
          frameworkTokens.some((token) => readSource(file).includes(token)),
        )
        .sort(),
    );
  });

  it("references real providers only from provider/preflight/lab-gated paths", () => {
    const providerTokens = [
      "RealBatteryProvider",
      "RealPowerModeProvider",
      "HealthKitHeartRateProvider",
      "CoreMotionProvider",
      "RealCueOutputProvider",
      "RealWatchRuntimePreflightProvider",
      "RealtimeWatchClock",
    ];
    const allowedCombined = [
      ...realProviderSwiftFiles,
      "ios/LucidTLR Watch App/WatchNightSessionController.swift",
    ].map(readSource).join("\n");
    const forbiddenCombined = [
      "src/screens/HomeScreen.tsx",
      "src/screens/ActiveNightSessionScreen.tsx",
      "src/screens/PresleepTrainingScreen.tsx",
      "src/screens/MorningReviewScreen.tsx",
      "src/screens/DataScreen.tsx",
      "src/screens/SettingsScreen.tsx",
      "src/features/watchModeLab/watchModeTransportLab.ts",
      "src/screens/WatchModeLabScreen.tsx",
      "app/debug/watch-mode-lab.tsx",
      "ios/LucidTLR/LucidTLRWatchTransport.swift",
      "ios/LucidTLR Watch App/Connectivity/WatchTransportCoordinator.swift",
      "ios/LucidTLR Watch App/ContentView.swift",
      "ios/LucidTLR Watch App/WatchModeLabViewModel.swift",
      "ios/LucidTLR Watch App/WatchModeProductView.swift",
    ].map(readSource).join("\n");

    for (const token of providerTokens) {
      expect(allowedCombined).toContain(token);
      expect(forbiddenCombined).not.toContain(token);
    }
  });

  it("gates the Watch product and lab surfaces behind debug while keeping the public placeholder", () => {
    const contentView = readSource("ios/LucidTLR Watch App/ContentView.swift");

    expect(contentView).toContain("Watch Mode is being rebuilt.");
    expect(contentView).toContain("Use Phone Mode on iPhone for tonight.");
    expect(contentView).toContain(
      "#if DEBUG || EXPO_CONFIGURATION_DEBUG || LUCIDTLR_INTERNAL_TESTFLIGHT_LAB",
    );
    expect(contentView).toContain("WatchModeProductView");
    expect(contentView).toContain("WatchModeLabView()");
    expect(contentView).toContain("#else");
    expect(contentView).toContain("placeholder");
    expect(
      contentView.indexOf(
        "#if DEBUG || EXPO_CONFIGURATION_DEBUG || LUCIDTLR_INTERNAL_TESTFLIGHT_LAB",
      ),
    ).toBeLessThan(contentView.indexOf("WatchModeProductView"));
  });

  it("documents the hidden lab as public-disabled with Phase C real providers gated", () => {
    const future = readSource("docs/future/watch-mode-implementation-watch-owned-v3.md");

    expect(future).toContain("## Hidden Watch Mode Lab");
    expect(future).toContain("transport drills");
    expect(future).toContain("not public Watch Mode");
    expect(future).toContain("Phase C real-provider");
    expect(future).toContain("WatchConnectivity");
    expect(future).toContain("Watch Mode remains disabled");
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
    ].map(readSource).join("\n");

    expect(availability).toContain("WATCH_MODE_ENABLED = false");
    expect(home).toContain("WATCH_MODE_DISABLED_MESSAGE");
    const productFlow = readSource("src/features/watchMode/watchModeProductFlow.ts");

    expect(appState).toContain("throw new Error(WATCH_MODE_DISABLED_MESSAGE)");
    expect(productFlow).toContain("isWatchModeLabAvailable()");
    expect(productFlow).toContain("WATCH_MODE_PRODUCT_SOURCE = \"phone_watch_mode_v3\"");
    expect(home).toContain("isWatchModeProductFlowAvailable()");
    expect(home).toContain('startWatchModeProductFlow("tlr")');
    expect(home).toContain('startWatchModeProductFlow("sleep_log")');
    expect(publicScreens).not.toContain("@/src/native/watchRuntime");
    expect(publicScreens).not.toContain("@/src/features/watchModeLab/watchModeLab");
    expect(publicScreens).not.toContain("WatchSessionCoordinator");
    expect(publicScreens).not.toContain("watchTransport.");
  });

  it("does not introduce WatchConnectivity or native bridge files", () => {
    const sourceFiles = [
      "src/features/watchModeLab/watchModeLab.ts",
      "src/screens/WatchModeLabScreen.tsx",
      "app/debug/watch-mode-lab.tsx",
      ...watchLabSwiftFiles,
    ];
    const combined = sourceFiles.map(readSource).join("\n");

    expect(combined).not.toContain("import WatchConnectivity");
    expect(combined).not.toContain("NativeModules");
    expect(combined).not.toContain("watchRuntimeClient");
    expect(fileExists("src/native/watchRuntime/watchRuntimeClient.ts")).toBe(false);
  });

  it("shows phone recovery state as synthetic-only", () => {
    const screen = readSource("src/screens/WatchModeLabScreen.tsx");

    expect(screen).toContain("Recovery state -- synthetic only");
    expect(screen).toContain("Simulate watch committed");
    expect(screen).toContain("Simulate watch running last-known");
    expect(screen).toContain("Simulate watch sealed waiting import");
    expect(screen).toContain("Simulate phone import success / ack eligible");
    expect(screen).toContain("Simulate ack recorded");
    expect(screen).toContain("Mark lab session abandoned local-only");
    expect(screen).toContain("Reload recovery state");
  });
});
