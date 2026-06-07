import { describe, expect, it } from "vitest";

declare const require: (moduleName: string) => any;

const { existsSync, readFileSync } = require("fs");
const path = require("path");
const repoRoot = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(readSource(relativePath));
}

function fileExists(relativePath: string): boolean {
  return existsSync(path.join(repoRoot, relativePath));
}

const phase4SwiftFiles = [
  "ios/LucidTLR Watch App/Runtime/WatchRuntimeState.swift",
  "ios/LucidTLR Watch App/Runtime/WatchRuntimeProtocols.swift",
  "ios/LucidTLR Watch App/Runtime/WatchRuntimeClock.swift",
  "ios/LucidTLR Watch App/Runtime/WatchSessionCoordinator.swift",
  "ios/LucidTLR Watch App/Runtime/EpochAggregator.swift",
  "ios/LucidTLR Watch App/Runtime/CuePolicyEngine.swift",
  "ios/LucidTLR Watch App/Runtime/RemProbabilityEvaluator.swift",
  "ios/LucidTLR Watch App/Runtime/SyntheticHeartRateProvider.swift",
  "ios/LucidTLR Watch App/Runtime/SyntheticMotionProvider.swift",
  "ios/LucidTLR Watch App/Runtime/SyntheticBatteryProvider.swift",
  "ios/LucidTLR Watch App/Runtime/SyntheticCueOutputProvider.swift",
  "ios/LucidTLR Watch App/Runtime/WatchRuntimeLogStore.swift",
  "ios/LucidTLR Watch App/Runtime/WatchPackageSealer.swift",
  "ios/LucidTLR Watch App/Runtime/WatchSyntheticRuntimeFixtures.swift",
];

describe("Watch Mode v3 synthetic runtime architecture", () => {
  it("adds Phase 4 Swift runtime files to the Watch target", () => {
    const project = readSource("ios/LucidTLR.xcodeproj/project.pbxproj");

    for (const file of phase4SwiftFiles) {
      const fileName = path.basename(file);

      expect(fileExists(file)).toBe(true);
      expect(project).toContain(`${fileName} in Sources`);
    }
  });

  it("keeps Phase 4 synthetic runtime free of real provider frameworks", () => {
    const forbidden = [
      "import HealthKit",
      "import CoreMotion",
      "import WatchConnectivity",
      "import AVFoundation",
      "WKInterfaceDevice.play",
      "HKWorkoutSession",
    ];
    const combined = phase4SwiftFiles.map(readSource).join("\n");

    for (const token of forbidden) {
      expect(combined).not.toContain(token);
    }
  });

  it("keeps public Watch Mode disabled and blocked", () => {
    const availability = readSource("src/features/watchMode/watchModeAvailability.ts");
    const home = readSource("src/screens/HomeScreen.tsx");
    const appState = readSource("src/state/AppState.tsx");

    expect(availability).toContain("WATCH_MODE_ENABLED = false");
    expect(home).toContain("WATCH_MODE_DISABLED_MESSAGE");
    expect(appState).toContain("throw new Error(WATCH_MODE_DISABLED_MESSAGE)");
  });

  it("keeps user-facing screens from importing Watch runtime contracts or synthetic runtime", () => {
    const screenFiles = [
      "src/screens/HomeScreen.tsx",
      "src/screens/ActiveNightSessionScreen.tsx",
      "src/screens/PresleepTrainingScreen.tsx",
      "src/screens/MorningReviewScreen.tsx",
      "src/screens/DataScreen.tsx",
      "src/screens/SettingsScreen.tsx",
    ];
    const combined = screenFiles.map(readSource).join("\n");

    expect(combined).not.toContain("@/src/native/watchRuntime");
    expect(combined).not.toContain("WatchSessionCoordinator");
    expect(combined).not.toContain("WatchSyntheticRuntimeFixtures");
  });

  it("documents synthetic-before-real-provider sequencing", () => {
    const future = readSource("docs/future/watch-mode-implementation-watch-owned-v3.md");
    const syntheticIndex = future.indexOf("synthetic Watch-owned runtime core with fake providers");
    const realProviderIndex = future.indexOf("Real HealthKit, workout, CoreMotion");

    expect(syntheticIndex).toBeGreaterThanOrEqual(0);
    expect(realProviderIndex).toBeGreaterThan(syntheticIndex);
  });

  it("keeps canonical synthetic fixtures small and watch-owned", () => {
    const tlrFixture = readJson("tests/watch/fixtures/watch-synthetic-tlr-run-v3.json");
    const sleepLogFixture = readJson(
      "tests/watch/fixtures/watch-synthetic-sleep-log-run-v3.json",
    );

    expect(tlrFixture.runtimeOwner).toBe("watch");
    expect(tlrFixture.expectedEpochCount).toBe(20);
    expect(tlrFixture.cueingEnabled).toBe(true);
    expect(tlrFixture.defaultOutput).toBe("haptic");

    expect(sleepLogFixture.runtimeOwner).toBe("watch");
    expect(sleepLogFixture.expectedEpochCount).toBe(20);
    expect(sleepLogFixture.cueingEnabled).toBe(false);
  });
});
