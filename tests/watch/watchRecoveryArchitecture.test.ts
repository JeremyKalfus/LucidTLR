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

const recoverySourceFiles = [
  "src/features/watchSync/watchSessionSyncState.ts",
  "src/features/internalBuild/internalBuildFlags.ts",
  "src/features/watchModeLab/watchModeLab.ts",
  "src/screens/WatchModeLabScreen.tsx",
  "src/screens/SettingsScreen.tsx",
  "app/debug/watch-mode-lab.tsx",
  "ios/LucidTLR Watch App/Storage/WatchCurrentSessionIndex.swift",
  "ios/LucidTLR Watch App/WatchModeLabView.swift",
  "ios/LucidTLR Watch App/WatchModeLabViewModel.swift",
  "ios/LucidTLR Watch App/ContentView.swift",
];

describe("Watch Mode v3 recovery and internal lab architecture", () => {
  it("adds the durable phone Watch sync ledger migration and repository hooks", () => {
    const migration = readSource(
      "src/data/local/migrations/009_watch_session_sync_states.sql",
    );
    const runtimeMigrations = readSource("src/data/local/runtimeMigrations.ts");
    const schema = readSource("src/data/local/schema.ts");
    const repositories = readSource("src/data/local/repositories.ts");

    expect(migration).toContain("create table if not exists watch_session_sync_states");
    expect(migration).toContain("session_id text primary key");
    expect(migration).toContain("package_hash text");
    expect(migration).toContain("ack_eligible_at text");
    expect(migration).toContain(
      "idx_watch_session_sync_states_participant_status",
    );
    expect(runtimeMigrations).toContain("009_watch_session_sync_states");
    expect(schema).toContain('"watch_session_sync_states"');
    expect(repositories).toContain('"watch_session_sync_states"');
  });

  it("models all required sync statuses and future start guard helpers", () => {
    const stateMachine = readSource(
      "src/features/watchSync/watchSessionSyncState.ts",
    );

    for (const status of [
      "draft",
      "phone_plan_built",
      "plan_staged",
      "watch_commit_pending",
      "watch_committed",
      "watch_running_last_known",
      "watch_running_unconfirmed",
      "watch_sealed_waiting_import",
      "phone_importing",
      "phone_imported_ack_eligible",
      "ack_recorded",
      "completed",
      "abandoned_local_only",
      "error",
    ]) {
      expect(stateMachine).toContain(status);
    }

    for (const helper of [
      "WATCH_SESSION_SYNC_STATUS_PRECEDENCE",
      "assertNoUnresolvedWatchSyncStateForFutureStart",
      "computeWatchStartupRecoveryState",
      "applyPlanStaged",
      "applyWatchCommitReceipt",
      "applyWatchRunningStatus",
      "applyWatchSealedManifest",
      "applyPhoneImportSuccess",
      "applyAckRecorded",
      "applyTransportTimeout",
      "applyUserReopenedApp",
      "applyUserAbandonLocalOnly",
    ]) {
      expect(stateMachine).toContain(helper);
    }
  });

  it("adds Watch current session index to the Watch target and refuses silent overwrite", () => {
    const indexPath = "ios/LucidTLR Watch App/Storage/WatchCurrentSessionIndex.swift";
    const index = readSource(indexPath);
    const project = readSource("ios/LucidTLR.xcodeproj/project.pbxproj");

    expect(fileExists(indexPath)).toBe(true);
    expect(project).toContain("WatchCurrentSessionIndex.swift in Sources");
    expect(index).toContain("activeUnackedSessionExists");
    expect(index).toContain("requireCanStartSession(sessionId:");
    expect(index).toContain("discardSyntheticLabSession");
    expect(index).toContain("explicitConfirmation");
    expect(index).toContain("explicitDiscardRequired");
    expect(index).toContain("ackDoesNotMatchPackage");
  });

  it("wires Watch lab recovery actions to the current session index", () => {
    const labView = readSource("ios/LucidTLR Watch App/WatchModeLabView.swift");
    const labModel = readSource(
      "ios/LucidTLR Watch App/WatchModeLabViewModel.swift",
    );
    const combined = `${labView}\n${labModel}`;

    expect(combined).toContain("WatchCurrentSessionIndex");
    expect(combined).toContain("current index");
    expect(combined).toContain("Recover current synthetic session");
    expect(combined).toContain("Seal current synthetic session");
    expect(combined).toContain("Record synthetic ack");
    expect(combined).toContain("Discard Watch transport/session state");
    expect(combined).toContain("transportCoordinator.clearLabStatus()");
    expect(combined).toContain("requireCanStartSession(sessionId:");
  });

  it("centralizes lab access without relying only on __DEV__", () => {
    const flags = readSource("src/features/internalBuild/internalBuildFlags.ts");
    const phoneLab = readSource("src/screens/WatchModeLabScreen.tsx");
    const settings = readSource("src/screens/SettingsScreen.tsx");
    const watchContent = readSource("ios/LucidTLR Watch App/ContentView.swift");
    const eas = readSource("eas.json");

    expect(flags).toContain("EXPO_PUBLIC_WATCH_MODE_LAB_ENABLED");
    expect(flags).toContain("isInternalTestFlightLabBuild");
    expect(flags).toContain("isWatchModeLabAvailable");
    expect(phoneLab).toContain("if (!isWatchModeLabAvailable())");
    expect(phoneLab).toContain("<Redirect href=\"/\" />");
    expect(settings).toContain("isWatchModeLabAvailable()");
    expect(watchContent).toContain("LUCIDTLR_INTERNAL_TESTFLIGHT_LAB");
    expect(eas).toContain("testflight-internal-lab");
    expect(eas).toContain("LUCIDTLR_INTERNAL_TESTFLIGHT_SWIFT_FLAGS");
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
    expect(appState).toContain("throw new Error(WATCH_MODE_DISABLED_MESSAGE)");
    expect(home).toContain("isWatchModeProductFlowAvailable()");
    expect(home).toContain('startWatchModeProductFlow("tlr")');
    expect(home).toContain('startWatchModeProductFlow("sleep_log")');
    expect(publicScreens).not.toContain("@/src/features/watchModeLab/watchModeLab");
    expect(publicScreens).not.toContain("@/src/native/watchRuntime");
    expect(publicScreens).not.toContain("watchTransport.");
  });

  it("does not add Watch transport, real Watch sensors, native bridge, or upload behavior", () => {
    const combined = recoverySourceFiles.map(readSource).join("\n");

    for (const forbidden of [
      "import WatchConnectivity",
      "import HealthKit",
      "import CoreMotion",
      "import AVFoundation",
      "HKWorkoutSession",
      "startDeviceMotionUpdates",
      "startAccelerometerUpdates",
      "NativeModules",
      "watchRuntimeClient",
      "prepareAnonymousResearchUpload",
      "dream_upload",
      "upload_queue",
    ]) {
      expect(combined).not.toContain(forbidden);
    }
  });

  it("keeps importer ack eligibility transaction-gated", () => {
    const importer = readSource("src/features/watchHistory/importWatchPackage.ts");
    const lab = readSource("src/features/watchModeLab/watchModeLab.ts");

    expect(importer).toContain("withTransaction");
    expect(importer).toContain("requires LocalDb.withTransaction");
    expect(importer).toContain("ackEligible: true");
    expect(lab).toContain("importWatchPackage");
    expect(lab).toContain("applyPhoneImportSuccess");
  });

  it("preserves terminal fixture sync state during lab recovery simulations", () => {
    const lab = readSource("src/features/watchModeLab/watchModeLab.ts");

    expect(lab).toContain("loadWatchSessionSyncStateBySessionId");
    expect(lab).toContain("loadSyntheticFixtureSyncState");
    expect(lab).toContain("fixtureState ??");
    expect(lab).toContain("matching ??");
    expect(lab).toContain("sessionId: input.sealedPackage.manifest.sessionId");
  });

  it("documents internal lab wording on phone and Watch", () => {
    const phoneLab = readSource("src/screens/WatchModeLabScreen.tsx");
    const watchLab = readSource("ios/LucidTLR Watch App/WatchModeLabView.swift");
    const combined = `${phoneLab}\n${watchLab}`;

    expect(combined).toContain("Internal TestFlight Lab");
    expect(combined).toContain("synthetic");
    expect(combined).toContain("public Watch Mode");
    expect(combined).toContain("disabled");
  });
});
