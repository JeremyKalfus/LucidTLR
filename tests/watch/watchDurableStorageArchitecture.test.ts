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

const storageSwiftFiles = [
  "ios/LucidTLR Watch App/Storage/WatchStorageErrors.swift",
  "ios/LucidTLR Watch App/Storage/WatchStoragePaths.swift",
  "ios/LucidTLR Watch App/Storage/WatchSessionDirectoryStore.swift",
  "ios/LucidTLR Watch App/Storage/WatchFileBackedLogStore.swift",
  "ios/LucidTLR Watch App/Storage/WatchPackageStore.swift",
  "ios/LucidTLR Watch App/Storage/WatchPackageAckStore.swift",
  "ios/LucidTLR Watch App/Storage/WatchSyntheticStorageFixtures.swift",
];

describe("Watch Mode v3 durable Watch storage architecture", () => {
  it("adds storage Swift files to the Watch target", () => {
    const project = readSource("ios/LucidTLR.xcodeproj/project.pbxproj");

    for (const file of storageSwiftFiles) {
      const fileName = path.basename(file);

      expect(fileExists(file)).toBe(true);
      expect(project).toContain(`${fileName} in Sources`);
    }
  });

  it("keeps durable storage free of real provider frameworks and SQLite hot paths", () => {
    const forbidden = [
      "import HealthKit",
      "import CoreMotion",
      "import WatchConnectivity",
      "import AVFoundation",
      "HKWorkoutSession",
      "SQLite",
      "sqlite3",
    ];
    const combined = storageSwiftFiles.map(readSource).join("\n");

    for (const token of forbidden) {
      expect(combined).not.toContain(token);
    }
  });

  it("uses append-only JSONL files and required sealed package files", () => {
    const paths = readSource("ios/LucidTLR Watch App/Storage/WatchStoragePaths.swift");
    const directoryStore = readSource(
      "ios/LucidTLR Watch App/Storage/WatchSessionDirectoryStore.swift",
    );

    expect(paths).toContain("Sessions");
    expect(paths).toContain("plan.json");
    expect(paths).toContain("commit.json");
    expect(paths).toContain("events.jsonl");
    expect(paths).toContain("epochs.jsonl");
    expect(paths).toContain("cue_events.jsonl");
    expect(paths).toContain("movement_events.jsonl");
    expect(paths).toContain("runtime_summary.json");
    expect(paths).toContain("manifest.json");
    expect(paths).toContain("seal.json");
    expect(paths).toContain("ack.json");

    expect(directoryStore).toContain("appendJSONLine");
    expect(directoryStore).toContain("FileHandle(forWritingTo:");
    expect(directoryStore).toContain("writeJSONAtomically");
    expect(directoryStore).toContain("readJSONLines");
  });

  it("supports recovery lists for unsealed, sealed-unacked, acknowledged, and partial sessions", () => {
    const directoryStore = readSource(
      "ios/LucidTLR Watch App/Storage/WatchSessionDirectoryStore.swift",
    );

    expect(directoryStore).toContain("pendingUnsealedSessions");
    expect(directoryStore).toContain("sealedButUnackedPackages");
    expect(directoryStore).toContain("acknowledgedPackages");
    expect(directoryStore).toContain("corruptedOrPartialSessions");
    expect(directoryStore).toContain("partialSeal");
    expect(directoryStore).toContain("corrupted");
  });

  it("gates package deletion on a matching durable ack", () => {
    const ackStore = readSource("ios/LucidTLR Watch App/Storage/WatchPackageAckStore.swift");
    const storageFixture = readSource(
      "ios/LucidTLR Watch App/Storage/WatchSyntheticStorageFixtures.swift",
    );

    expect(ackStore).toContain("recordAck");
    expect(ackStore).toContain("ackDoesNotMatchPackage");
    expect(ackStore).toContain("canDeletePackageAfterAck");
    expect(ackStore).toContain("ack.packageId == manifest.packageId");
    expect(ackStore).toContain("ack.packageHash == manifest.packageHash");
    expect(storageFixture).toContain("canDeleteBeforeAck");
    expect(storageFixture).toContain("canDeleteAfterMatchingAck");
  });

  it("lets the synthetic coordinator opt into file-backed storage without changing the default", () => {
    const coordinator = readSource(
      "ios/LucidTLR Watch App/Runtime/WatchSessionCoordinator.swift",
    );
    const logStore = readSource("ios/LucidTLR Watch App/Runtime/WatchRuntimeLogStore.swift");
    const fileBacked = readSource(
      "ios/LucidTLR Watch App/Storage/WatchFileBackedLogStore.swift",
    );

    expect(coordinator).toContain("logStoreFactory");
    expect(coordinator).toContain("WatchRuntimeLogStore(sessionId: $0)");
    expect(coordinator).toContain("WatchRuntimePlanPersisting");
    expect(logStore).toContain("class WatchRuntimeLogStore");
    expect(logStore).toContain("restoreRecords");
    expect(fileBacked).toContain("final class WatchFileBackedLogStore: WatchRuntimeLogStore");
    expect(fileBacked).toContain("restoreFromDisk");
  });

  it("writes package manifests from file-backed records and keeps structural hashes explicit", () => {
    const packageStore = readSource("ios/LucidTLR Watch App/Storage/WatchPackageStore.swift");
    const sealer = readSource("ios/LucidTLR Watch App/Runtime/WatchPackageSealer.swift");

    expect(packageStore).toContain("WatchPackageStore: WatchPackageSealing");
    expect(packageStore).toContain("WatchStoragePaths.runtimeSummaryFileName");
    expect(packageStore).toContain("WatchStoragePaths.manifestFileName");
    expect(packageStore).toContain("WatchStoragePaths.sealFileName");
    expect(packageStore).toContain("WatchRuntimeStructuralHash.placeholderHex");
    expect(sealer).toContain("cue_events.jsonl");
    expect(sealer).toContain("movement_events.jsonl");
  });

  it("keeps public Watch Mode disabled and sleep shield not publicly wired", () => {
    const availability = readSource("src/features/watchMode/watchModeAvailability.ts");
    const home = readSource("src/screens/HomeScreen.tsx");
    const appState = readSource("src/state/AppState.tsx");
    const contentView = readSource("ios/LucidTLR Watch App/ContentView.swift");
    const phoneScreens = [
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
    expect(contentView).toContain("Watch Mode is being rebuilt.");
    expect(contentView).not.toContain("SleepShieldView");
    expect(phoneScreens).not.toContain("@/src/native/watchRuntime");
    expect(phoneScreens).not.toContain("WatchSessionCoordinator");
    expect(phoneScreens).not.toContain("WatchFileBackedLogStore");
  });
});
