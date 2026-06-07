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
];

describe("Watch Mode v3 hidden synthetic lab architecture", () => {
  it("adds a dev-only phone lab route and hidden settings affordance", () => {
    const route = readSource("app/debug/watch-mode-lab.tsx");
    const screen = readSource("src/screens/WatchModeLabScreen.tsx");
    const settings = readSource("src/screens/SettingsScreen.tsx");

    expect(route).toContain("WatchModeLabScreen");
    expect(screen).toContain("if (!__DEV__)");
    expect(screen).toContain("<Redirect href=\"/\" />");
    expect(screen).toContain("Watch Mode Lab -- synthetic only");
    expect(screen).toContain("Public Watch Mode remains disabled");
    expect(screen).toContain("real Watch sensors");
    expect(screen).toContain("WatchConnectivity");
    expect(settings).toContain("__DEV__");
    expect(settings).toContain("/debug/watch-mode-lab");
    expect(settings).toContain("Watch Mode Lab -- synthetic only");
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

  it("keeps Watch lab files synthetic-only and free of real provider frameworks", () => {
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
    expect(combined).toContain("WatchFileBackedLogStore");
    expect(combined).toContain("WatchPackageStore");
    expect(combined).toContain("SleepShieldView");
    expect(combined).toContain("retained until matching ack");
  });

  it("gates the Watch lab behind debug while keeping the placeholder default", () => {
    const contentView = readSource("ios/LucidTLR Watch App/ContentView.swift");

    expect(contentView).toContain("Watch Mode is being rebuilt.");
    expect(contentView).toContain("Use Phone Mode on iPhone for tonight.");
    expect(contentView).toContain("#if DEBUG || EXPO_CONFIGURATION_DEBUG");
    expect(contentView).toContain("WatchModeLabView()");
    expect(contentView).toContain("Synthetic Lab");
    expect(contentView.indexOf("#if DEBUG || EXPO_CONFIGURATION_DEBUG")).toBeLessThan(
      contentView.indexOf("WatchModeLabView()"),
    );
  });

  it("documents the hidden lab as synthetic-only and required before real providers", () => {
    const future = readSource("docs/future/watch-mode-implementation-watch-owned-v3.md");

    expect(future).toContain("## Hidden Watch Mode Lab");
    expect(future).toContain("synthetic-only");
    expect(future).toContain("not public Watch Mode");
    expect(future).toContain("must not use real Watch sensors");
    expect(future).toContain("WatchConnectivity");
    expect(future).toContain("required before real providers");
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
    expect(publicScreens).not.toContain("@/src/features/watchModeLab/watchModeLab");
    expect(publicScreens).not.toContain("WatchSessionCoordinator");
    expect(publicScreens).not.toContain("startWatch");
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
});
