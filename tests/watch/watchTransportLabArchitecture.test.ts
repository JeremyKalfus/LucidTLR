import { describe, expect, it } from "vitest";

declare const require: (moduleName: string) => any;

const { existsSync, readFileSync, readdirSync, statSync } = require("fs");
const path = require("path");
const repoRoot = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function fileExists(relativePath: string): boolean {
  return existsSync(path.join(repoRoot, relativePath));
}

function walkFiles(relativePath: string): string[] {
  const absolute = path.join(repoRoot, relativePath);

  if (!existsSync(absolute)) {
    return [];
  }

  return readdirSync(absolute).flatMap((entry: string) => {
    const childRelative = path.join(relativePath, entry);
    const childAbsolute = path.join(repoRoot, childRelative);

    return statSync(childAbsolute).isDirectory()
      ? walkFiles(childRelative)
      : [childRelative];
  });
}

const phoneTransportFiles = [
  "ios/LucidTLR/LucidTLRWatchTransport.swift",
  "ios/LucidTLR/LucidTLRWatchTransportBridge.m",
  "src/native/watchTransport/WatchTransportMessages.ts",
  "src/native/watchTransport/NativeWatchTransportTypes.ts",
  "src/native/watchTransport/watchTransportClient.ts",
  "src/native/watchTransport/LucidTLRWatchTransport.ts",
  "src/native/watchTransport/index.ts",
  "src/features/watchModeLab/watchModeTransportLab.ts",
];

const watchTransportFiles = [
  "ios/LucidTLR Watch App/Connectivity/WatchTransportMessages.swift",
  "ios/LucidTLR Watch App/Connectivity/WatchTransportPackageBuilder.swift",
  "ios/LucidTLR Watch App/Connectivity/WatchTransportCoordinator.swift",
];

const transportFiles = [...phoneTransportFiles, ...watchTransportFiles];

describe("Watch Mode v3 synthetic WatchConnectivity transport lab", () => {
  it("adds WatchConnectivity files only in transport and lab-scoped locations", () => {
    const project = readSource("ios/LucidTLR.xcodeproj/project.pbxproj");

    for (const file of transportFiles) {
      expect(fileExists(file)).toBe(true);
    }

    for (const fileName of [
      "LucidTLRWatchTransport.swift",
      "LucidTLRWatchTransportBridge.m",
      "WatchTransportMessages.swift",
      "WatchTransportPackageBuilder.swift",
      "WatchTransportCoordinator.swift",
    ]) {
      expect(project).toContain(`${fileName} in Sources`);
    }

    const activeSourceFiles = [
      ...walkFiles("ios/LucidTLR"),
      ...walkFiles("ios/LucidTLR Watch App"),
      ...walkFiles("src"),
      ...walkFiles("app"),
    ].filter((file: string) => /\.(swift|m|ts|tsx)$/.test(file));
    const watchConnectivityImportHits = activeSourceFiles.filter((file: string) =>
      readSource(file).includes("import WatchConnectivity"),
    );

    expect(watchConnectivityImportHits.sort()).toEqual(
      [
        "ios/LucidTLR/LucidTLRWatchTransport.swift",
        "ios/LucidTLR Watch App/Connectivity/WatchTransportCoordinator.swift",
      ].sort(),
    );
  });

  it("defines the shared synthetic transport message types on both sides", () => {
    const tsMessages = readSource(
      "src/native/watchTransport/WatchTransportMessages.ts",
    );
    const swiftMessages = readSource(
      "ios/LucidTLR Watch App/Connectivity/WatchTransportMessages.swift",
    );
    const combined = `${tsMessages}\n${swiftMessages}`;

    for (const messageType of [
      "lucidtlr.watch.plan.available",
      "lucidtlr.watch.plan.request",
      "lucidtlr.watch.plan.file",
      "lucidtlr.watch.plan.commit.receipt",
      "lucidtlr.watch.status.snapshot",
      "lucidtlr.watch.package.manifest",
      "lucidtlr.watch.package.file",
      "lucidtlr.watch.package.ack",
      "lucidtlr.watch.transport.error",
    ]) {
      expect(combined).toContain(messageType);
    }

    for (const requiredField of [
      "schemaVersion",
      "messageId",
      "idempotencyKey",
      "sessionId",
      "planHash",
      "packageId",
      "packageHash",
      "createdAt",
      "sender",
    ]) {
      expect(combined).toContain(requiredField);
    }
  });

  it("keeps transport files out of cue timing, cue delivery, and real sensor/audio frameworks", () => {
    const combined = transportFiles.map(readSource).join("\n");

    for (const forbidden of [
      "CuePolicyEngine",
      "scheduleCue",
      "playCue",
      "cuePlayAttempted",
      "WKInterfaceDevice.play",
      "sendMessage",
      "import HealthKit",
      "import CoreMotion",
      "import AVFoundation",
      "HKWorkoutSession",
      "startDeviceMotionUpdates",
      "startAccelerometerUpdates",
      "AVAudioPlayer",
      "prepareAnonymousResearchUpload",
      "dream_upload",
      "upload_queue",
    ]) {
      expect(combined).not.toContain(forbidden);
    }

    expect(combined).toContain("import WatchConnectivity");
    expect(combined).toContain("transferUserInfo");
    expect(combined).toContain("transferFile");
    expect(combined).toContain("WatchTransportPackageTransferStatus");
    expect(combined).toContain("outstandingUserInfoTransferCount");
    expect(combined).toContain("outstandingFileTransferCount");
    expect(combined).toContain("packageFileByteCount");
  });

  it("labels phone and Watch transport surfaces as synthetic/internal", () => {
    const phoneLab = readSource("src/screens/WatchModeLabScreen.tsx");
    const watchLab = readSource("ios/LucidTLR Watch App/WatchModeLabView.swift");
    const combined = `${phoneLab}\n${watchLab}`;

    expect(phoneLab).toContain("Transport -- synthetic only");
    expect(phoneLab).toContain("Internal TestFlight Lab");
    expect(phoneLab).toContain("Phone reload recovery");
    expect(watchLab).toContain("Transport -- synthetic only");
    expect(watchLab).toContain("Synthetic WatchConnectivity transport only");
    expect(combined).toContain("Public Watch Mode remains disabled");
  });

  it("treats isReachable as informational status only", () => {
    const combined = transportFiles
      .concat(["src/screens/WatchModeLabScreen.tsx"])
      .map(readSource)
      .join("\n");

    expect(combined).toContain("isReachable");
    expect(combined).toContain("isReachableInformationalOnly");
    expect(combined).toContain("informational only");
    expect(combined).not.toContain("watch_running = isReachable");
    expect(combined).not.toContain("running: session.isReachable");
  });

  it("integrates phone transport with the durable DB recovery state machine", () => {
    const labTransport = readSource(
      "src/features/watchModeLab/watchModeTransportLab.ts",
    );

    expect(labTransport).toContain("loadUnresolvedWatchSessionSyncStates");
    expect(labTransport).toContain("markWatchSessionPlanBuilt");
    expect(labTransport).toContain("markWatchSessionPlanStaged");
    expect(labTransport).toContain("applyWatchCommitReceipt");
    expect(labTransport).toContain("applyWatchRunningStatus");
    expect(labTransport).toContain("applyWatchSealedManifest");
    expect(labTransport).toContain("applyPhoneImportSuccess");
    expect(labTransport).toContain("applyAckRecorded");
    expect(labTransport).toContain("status.latestAck");
    expect(labTransport).toContain("watch_status_sealed_package");
    expect(labTransport).toContain("status.latestStatusSnapshot?.packageId");
    expect(labTransport).toContain("observedWatchAck");
    expect(labTransport).toContain("findUnresolvedConflictingActiveWatchSyncState");
  });

  it("keeps package import transaction-gated before ack send", () => {
    const labTransport = readSource(
      "src/features/watchModeLab/watchModeTransportLab.ts",
    );
    const importer = readSource("src/features/watchHistory/importWatchPackage.ts");

    expect(importer).toContain("withTransaction");
    expect(importer).toContain("ackEligible: true");
    expect(labTransport).toContain("importWatchPackage");
    expect(labTransport.indexOf("importWatchPackage")).toBeLessThan(
      labTransport.indexOf("sendAckForImportedPackage"),
    );
    expect(labTransport).toContain("No ack-eligible imported Watch package exists");
  });

  it("keeps the Watch current session index as the no-overwrite and ack-match boundary", () => {
    const watchModel = readSource(
      "ios/LucidTLR Watch App/WatchModeLabViewModel.swift",
    );
    const watchCoordinator = readSource(
      "ios/LucidTLR Watch App/Connectivity/WatchTransportCoordinator.swift",
    );
    const index = readSource(
      "ios/LucidTLR Watch App/Storage/WatchCurrentSessionIndex.swift",
    );

    expect(index).toContain("activeUnackedSessionExists");
    expect(watchModel).toContain("requireCanStartSession(sessionId:");
    expect(watchCoordinator).toContain("recordLatestAckIfMatches");
    expect(watchCoordinator).toContain("entry.sealedPackageId == ack.packageId");
    expect(watchCoordinator).toContain("entry.sealedPackageHash == ack.packageHash");
  });

  it("keeps public Watch Mode disabled and public screens disconnected", () => {
    const availability = readSource("src/features/watchMode/watchModeAvailability.ts");
    const home = readSource("src/screens/HomeScreen.tsx");
    const appState = readSource("src/state/AppState.tsx");
    const contentView = readSource("ios/LucidTLR Watch App/ContentView.swift");
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
    expect(contentView).toContain("Watch Mode is being rebuilt.");
    expect(contentView).toContain(
      "#if DEBUG || EXPO_CONFIGURATION_DEBUG || LUCIDTLR_INTERNAL_TESTFLIGHT_LAB",
    );
    expect(publicScreens).not.toContain("@/src/native/watchTransport");
    expect(publicScreens).not.toContain("WatchTransportCoordinator");
    expect(publicScreens).not.toContain("startWatch");
  });
});
