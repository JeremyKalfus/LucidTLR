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

function legacyName(...parts: string[]): string {
  return parts.join("");
}

describe("Watch Mode v3 architecture guardrails", () => {
  it("keeps public Watch Mode disabled", () => {
    const availability = readSource("src/features/watchMode/watchModeAvailability.ts");

    expect(availability).toContain("WATCH_MODE_ENABLED = false");
  });

  it("keeps Home blocking Watch Mode session creation", () => {
    const home = readSource("src/screens/HomeScreen.tsx");
    const productFlow = readSource("src/features/watchMode/watchModeProductFlow.ts");

    expect(home).toContain('selectedMode === "watch"');
    expect(home).toContain("WATCH_MODE_DISABLED_MESSAGE");
    expect(home).toContain("showWatchDisabledMessage()");
    expect(home).toContain("isWatchModeProductFlowAvailable()");
    expect(productFlow).toContain("WATCH_MODE_PRODUCT_SOURCE = \"phone_watch_mode_v3\"");
    expect(productFlow).toContain("isWatchModeLabAvailable()");
    expect(home).not.toContain('selectedMode === "watch") {\n      startSession("tlr")');
    expect(home).not.toContain('selectedMode === "watch") {\n      startSession("sleep_log")');
  });

  it("keeps active Watch sessions as local placeholders outside hidden lab work", () => {
    const activeNight = readSource("src/screens/ActiveNightSessionScreen.tsx");
    const appState = readSource("src/state/AppState.tsx");

    expect(activeNight).toContain("Local Watch Mode placeholder");
    expect(activeNight).toContain("End Local Session");
    expect(appState).toContain("throw new Error(WATCH_MODE_DISABLED_MESSAGE)");
  });

  it("documents the v3 workout-backed Watch-owned architecture", () => {
    const adr = readSource(
      "docs/decisions/004-watch-mode-v3-workout-backed-watch-owned.md",
    );
    const future = readSource("docs/future/watch-mode-implementation-watch-owned-v3.md");
    const combined = `${adr}\n${future}`;

    expect(combined).toContain("Watch Mode v3 is watch-owned");
    expect(combined).toContain("workout-backed runtime for live heart-rate collection");
    expect(combined).toContain("WatchConnectivity is prohibited from live cue timing");
    expect(combined).toContain("Watch Mode starts only after local Watch plan commit");
    expect(combined).toContain("Default cue channel is haptic-only");
    expect(combined).toContain("Audio cueing is optional");
    expect(combined).toContain("Low Power Mode blocks Watch Mode start");
    expect(combined).toContain("black sleep shield");
    expect(combined).toContain("Watch retains sealed packages until phone ack");
    expect(combined).toContain("Public Watch Mode remains disabled until hardware validation passes");
  });

  it("does not reintroduce old phone-owned Watch cue timing strings in runtime source", () => {
    const sourceFiles = [
      "src/state/AppState.tsx",
      "src/screens/HomeScreen.tsx",
      "src/screens/ActiveNightSessionScreen.tsx",
      "src/screens/PresleepTrainingScreen.tsx",
    ];
    const combined = sourceFiles.map(readSource).join("\n");

    expect(combined).not.toContain("phone sends cues to the Watch");
    expect(combined).not.toContain("Watch connected means Watch running");
    expect(combined).not.toContain(legacyName("startPhone", "WatchSpeakerSession"));
    expect(combined).not.toContain(legacyName("beginWatch", "OwnedStartSync"));
    expect(combined).not.toContain(legacyName("requestWatch", "OwnedLogSync"));
  });

  it("keeps old active Watch runtime modules out of user-facing screens", () => {
    const screens = [
      "src/screens/HomeScreen.tsx",
      "src/screens/ActiveNightSessionScreen.tsx",
      "src/screens/PresleepTrainingScreen.tsx",
      "src/screens/MorningReviewScreen.tsx",
      "src/screens/DataScreen.tsx",
      "src/screens/SettingsScreen.tsx",
    ];
    const combined = screens.map(readSource).join("\n");

    expect(combined).not.toContain("@/src/native/watchRuntime");
    expect(combined).not.toContain("WatchSessionManager");
    expect(combined).not.toContain("WatchConnectivity");
    expect(fileExists("src/native/watch")).toBe(false);
  });

  it("derives the product running lock without adding a persisted running flag", () => {
    const productFlow = readSource("src/features/watchMode/watchModeProductFlow.ts");
    const runningScreen = readSource("src/screens/WatchModeRunningScreen.tsx");
    const layout = readSource("app/(main)/_layout.tsx");
    const watchController = readSource(
      "ios/LucidTLR Watch App/WatchNightSessionController.swift",
    );
    const scanned = [
      ...[
        "src/features/watchMode/watchModeProductFlow.ts",
        "src/screens/WatchModeRunningScreen.tsx",
        "src/state/AppState.tsx",
        "app/(main)/_layout.tsx",
        "ios/LucidTLR Watch App/WatchNightSessionController.swift",
        "ios/LucidTLR Watch App/WatchModeProductView.swift",
      ].map(readSource),
    ].join("\n");

    for (const forbiddenKey of [
      "watchModeRunning",
      "watch_mode_running",
      "watchRunningFlag",
      "watch_mode_running_flag",
    ]) {
      expect(scanned).not.toContain(forbiddenKey);
    }

    expect(productFlow).toContain("loadUnresolvedWatchSessionSyncStates");
    expect(productFlow).toContain("computeWatchStartupRecoveryState");
    expect(layout).toContain("loadWatchModeProductLockState");
    expect(watchController).toContain("WatchCurrentSessionIndex");
    expect(runningScreen).not.toContain("setAppSetting");
  });

  it("keeps the locked phone running screen view-only except the explicit local escape hatch", () => {
    const runningScreen = readSource("src/screens/WatchModeRunningScreen.tsx");
    const productFlow = readSource("src/features/watchMode/watchModeProductFlow.ts");

    expect(runningScreen).toContain("Watch Mode running - started");
    expect(runningScreen).toContain("Night ended on watch - syncing...");
    expect(runningScreen).toContain("Alert.alert");
    expect(runningScreen).toContain("End Watch session?");
    expect(runningScreen).toContain("Ending here may lose the night's data from the Watch.");
    expect(runningScreen).toContain("style: \"destructive\"");
    expect(runningScreen).toContain("End session on this phone");
    expect(productFlow).toContain("applyUserAbandonLocalOnly");
    expect(productFlow).toContain("phone_local_end_active_watch_session");
    expect(runningScreen).not.toContain("startSession(");
    expect(runningScreen).not.toContain("sendSessionEvent(");
    expect(runningScreen).not.toContain("deleteSession(");
  });

  it("shares the real Watch night session controller between product and lab skins", () => {
    const project = readSource("ios/LucidTLR.xcodeproj/project.pbxproj");
    const controller = readSource(
      "ios/LucidTLR Watch App/WatchNightSessionController.swift",
    );
    const productView = readSource(
      "ios/LucidTLR Watch App/WatchModeProductView.swift",
    );
    const labViewModel = readSource(
      "ios/LucidTLR Watch App/WatchModeLabViewModel.swift",
    );
    const autoBaseline = readSource(
      "ios/LucidTLR Watch App/WatchAutoBaselineController.swift",
    );

    expect(project).toContain("WatchNightSessionController.swift in Sources");
    expect(project).toContain("WatchModeProductView.swift in Sources");
    expect(productView).toContain("WatchNightSessionController.shared");
    expect(labViewModel).toContain("nightSessionController.startLabForcedCueSession");
    expect(labViewModel).toContain("nightSessionController.endActiveSessionAndTransfer");
    expect(controller).toContain("HealthKitHeartRateProvider");
    expect(controller).toContain("CoreMotionProvider");
    expect(controller).toContain("RealCueOutputProvider");
    expect(controller).toContain("sendCommitReceipt");
    expect(controller).toContain("sendStatusSnapshot");
    expect(controller).toContain("endActiveSessionAndTransfer");
    expect(autoBaseline).toContain("WatchNightSessionController.isSyntheticLabPlan");
    expect(autoBaseline).toContain("WatchNightSessionController.shared.startProductSession");

    for (const providerToken of [
      "HealthKitHeartRateProvider",
      "CoreMotionProvider",
      "RealBatteryProvider",
      "RealPowerModeProvider",
      "RealCueOutputProvider",
      "RealWatchRuntimePreflightProvider",
      "RealtimeWatchClock",
    ]) {
      expect(labViewModel).not.toContain(providerToken);
    }
  });

  it("keeps Swift v3 contract mirrors in the Watch target without runtime frameworks", () => {
    const project = readSource("ios/LucidTLR.xcodeproj/project.pbxproj");
    const swiftFiles = [
      "ios/LucidTLR Watch App/Runtime/WatchRuntimePlanV3.swift",
      "ios/LucidTLR Watch App/Runtime/WatchPackageManifestV3.swift",
      "ios/LucidTLR Watch App/Runtime/WatchRuntimeEventV3.swift",
      "ios/LucidTLR Watch App/Runtime/WatchEpochRecordV3.swift",
      "ios/LucidTLR Watch App/Runtime/WatchCueRecordV3.swift",
      "ios/LucidTLR Watch App/Runtime/WatchMovementRecordV3.swift",
    ];

    for (const file of swiftFiles) {
      const source = readSource(file);
      const fileName = path.basename(file);

      expect(project).toContain(`${fileName} in Sources`);
      expect(source).toContain("Codable");
      expect(source).not.toContain("import HealthKit");
      expect(source).not.toContain("import CoreMotion");
      expect(source).not.toContain("import WatchConnectivity");
      expect(source).not.toContain("import AVFoundation");
      expect(source).not.toContain("import WatchKit");
    }
  });
});
