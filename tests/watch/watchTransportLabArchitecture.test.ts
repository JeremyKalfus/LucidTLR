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

  it("persists received package files before queued phone status updates", () => {
    const phoneBridge = readSource("ios/LucidTLR/LucidTLRWatchTransport.swift");
    const receiveMethodIndex = phoneBridge.indexOf(
      "func session(_ session: WCSession, didReceive file: WCSessionFile)",
    );
    const immediatePersistIndex = phoneBridge.indexOf(
      "let persistedFile = attemptPersistReceivedPackageFile(file)",
      receiveMethodIndex,
    );
    const queuedStatusIndex = phoneBridge.indexOf("queue.async", receiveMethodIndex);

    expect(receiveMethodIndex).toBeGreaterThan(-1);
    expect(immediatePersistIndex).toBeGreaterThan(receiveMethodIndex);
    expect(immediatePersistIndex).toBeLessThan(queuedStatusIndex);
    expect(phoneBridge).toContain("attemptPersistReceivedPackageFile");
    expect(phoneBridge).toContain("sourceExistsBeforeCopy");
    expect(phoneBridge).toContain("fileByteCount");
    expect(phoneBridge).toContain("latestPackageFile");
    expect(phoneBridge).toContain("Package file receive failed before queued status update");
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
    expect(labTransport).toContain("transportRecordForCurrentStagedPlan");
    expect(labTransport).toContain("transportStatusSnapshotForCurrentStagedPlan");
    expect(labTransport).toContain("record.matchesStagedPlan === false");
    expect(labTransport).toContain("watch_status_sealed_package");
    expect(labTransport).toContain("latestStatusSnapshot?.packageId");
    expect(labTransport).toContain("observedWatchAck");
    expect(labTransport).toContain("findUnresolvedConflictingActiveWatchSyncState");
    expect(labTransport).toContain("isReplaceableTransportLabPackageConflict");
    expect(labTransport).toContain("replaceStaleTransportLabPackageState");
    expect(labTransport).toContain("baselineReplacedStalePackage");
    expect(labTransport).toContain(
      "one_button_baseline_latest_received_package_imported",
    );
    expect(labTransport).toContain("resetWatchModeLabTransportBaselineState");
    expect(labTransport).toContain("watch_mode_lab_clean_transport_baseline_reset");
    expect(labTransport).toContain("isTransportBaselineResettableState");
    expect(labTransport).toContain("preservedPackageBearingCount");
    expect(labTransport).toContain('"watch_sealed_waiting_import"');
    expect(labTransport).toContain('"phone_imported_ack_eligible"');
    expect(labTransport).toContain(
      "isIgnorableTerminalTransportLabPackageConflict",
    );
    expect(labTransport).toContain("ignoredUntilLatestPackageImport");
    expect(labTransport).toContain("state.metadata.transportLab === true");
    expect(labTransport).toContain("applyUserAbandonLocalOnly");
    expect(labTransport).toContain("cleanBaselineReset");
  });

  it("applies native transport snapshots into the ledger during status refresh", () => {
    const labTransport = readSource(
      "src/features/watchModeLab/watchModeTransportLab.ts",
    );
    const loadSummary = labTransport.slice(
      labTransport.indexOf("export async function loadWatchModeLabTransportSummary"),
      labTransport.indexOf("export async function activateWatchModeLabTransport"),
    );
    const activateTransport = labTransport.slice(
      labTransport.indexOf("export async function activateWatchModeLabTransport"),
      labTransport.indexOf("export async function stageSyntheticWatchModeTransportPlan"),
    );
    const requestStatus = labTransport.slice(
      labTransport.indexOf("export async function requestWatchModeLabTransportStatus"),
      labTransport.indexOf("export async function importLatestReceivedSyntheticWatchPackage"),
    );

    expect(loadSummary).toContain("watchTransport.getTransportStatus");
    expect(loadSummary).toContain("applyWatchTransportReceiptSnapshotsFromStatus");
    expect(activateTransport).toContain("watchTransport.activateTransport");
    expect(activateTransport).toContain("applyWatchTransportReceiptSnapshotsFromStatus");
    expect(requestStatus).toContain("watchTransport.requestWatchStatus");
    expect(requestStatus).toContain("appendWatchModeLabTransportStatusSnapshot");
    expect(requestStatus).toContain("applyWatchTransportReceiptSnapshotsFromStatus");
    expect(labTransport).toContain(
      "async function applyWatchTransportReceiptSnapshotsFromStatus",
    );
    expect(labTransport).toContain("status.latestCommitReceipt");
    expect(labTransport).toContain("applyWatchCommitReceipt");
    expect(labTransport).toContain("latestStatusSnapshot?.watchState");
    expect(labTransport).toContain("applyWatchRunningStatus");
    expect(labTransport).toContain("latestPackageManifest");
    expect(labTransport).toContain("applyWatchSealedManifest");
    expect(labTransport).toContain("latestAck");
    expect(labTransport).toContain("applyAckRecorded");
  });

  it("filters stale transport evidence before applying ledger transitions", () => {
    const labTransport = readSource(
      "src/features/watchModeLab/watchModeTransportLab.ts",
    );
    const phoneBridge = readSource("ios/LucidTLR/LucidTLRWatchTransport.swift");
    const types = readSource(
      "src/native/watchTransport/NativeWatchTransportTypes.ts",
    );
    const applier = labTransport.slice(
      labTransport.indexOf(
        "async function applyWatchTransportReceiptSnapshotsFromStatus",
      ),
      labTransport.indexOf("async function markTransportPackageImportedInLedger"),
    );

    expect(labTransport).toContain("record.matchesStagedPlan === false");
    expect(labTransport).toContain(
      "record.sessionId !== status.latestStagedPlanId",
    );
    expect(labTransport).toContain(
      "record.planHash !== status.latestStagedPlanHash",
    );
    expect(applier).toContain(
      "const latestCommitReceipt = transportRecordForCurrentStagedPlan",
    );
    expect(applier).toContain(
      "const latestStatusSnapshot = transportStatusSnapshotForCurrentStagedPlan",
    );
    expect(applier).toContain(
      "const latestPackageManifest = transportRecordForCurrentStagedPlan",
    );
    expect(applier).toContain(
      "const latestAck = transportRecordForCurrentStagedPlan",
    );
    expect(applier).not.toContain("if (state && status.latestCommitReceipt)");
    expect(applier).not.toContain("if (state && status.latestPackageManifest)");
    expect(applier).not.toContain("if (state && status.latestAck)");
    expect(phoneBridge).toContain("latestStagedPlanHash");
    expect(phoneBridge).toContain("incomingPlanHash");
    expect(phoneBridge).toContain(
      "\"matchesStagedPlan\": self.matchesStagedPlan(payload, status: status)",
    );
    expect(types).toContain("matchesStagedPlan?: boolean");
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
    expect(labTransport).toContain("loadRecentWatchSessionSyncStates");
    expect(labTransport).toContain("latestTransportPackageIdentity");
    expect(labTransport).toContain("isTerminalAckForPackage");
    expect(labTransport).toContain("ack_already_recorded");
    expect(labTransport).toContain("duplicate retry is idempotent");
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

  it("adds an explicit one-button synthetic baseline without replacing interruption testing", () => {
    const phoneLab = readSource("src/screens/WatchModeLabScreen.tsx");
    const watchLab = readSource("ios/LucidTLR Watch App/WatchModeLabView.swift");
    const watchModel = readSource(
      "ios/LucidTLR Watch App/WatchModeLabViewModel.swift",
    );

    expect(phoneLab).toContain("Run One-Button Baseline");
    expect(phoneLab).toContain("Reset Clean Phone Baseline");
    expect(phoneLab).toContain("resetCleanTransportBaselineState");
    expect(phoneLab).toContain("abandoned_local_only");
    expect(phoneLab).toContain("Discard Watch transport/session state");
    expect(phoneLab).toContain("Package-bearing states are preserved");
    expect(phoneLab).toContain("runOneButtonTransportBaseline");
    expect(phoneLab).toContain("doesNotReplaceInterruptionTesting");
    expect(phoneLab).toContain("currentBaselineSessionId");
    expect(phoneLab).toContain("matchingBaselineCommitReceipt");
    expect(phoneLab).toContain("hasPersistedPackageFileForBaseline");
    expect(phoneLab).toContain("Baseline import belonged to a stale session");
    expect(phoneLab).toContain("stageSyntheticWatchModeTransportPlan");
    expect(phoneLab).toContain("requestWatchModeLabTransportStatus");
    expect(phoneLab).toContain("importLatestReceivedSyntheticWatchPackage");
    expect(phoneLab).toContain("sendAckForLatestImportedWatchPackage");
    expect(phoneLab).toContain("automated_transport_baseline_waiting_for_watch");
    expect(phoneLab).toContain("automated_transport_baseline_waiting_for_package_file");
    expect(watchLab).toContain("Run Watch baseline loop");
    expect(watchLab).toContain("Discard Watch transport/session state");
    expect(watchModel).toContain("runWatchBaselineTransportLoop");
    expect(watchModel).toContain("latestStagedPlan");
    expect(watchModel).toContain("watch_baseline_no_staged_plan");
    expect(watchModel).toContain("watch_baseline_loop_failed");
    expect(watchModel).toContain("transportCoordinator.clearLabStatus()");
    expect(watchModel).toContain("discardStaleBaselineCurrentSessionIfNeeded");
    expect(watchModel).toContain("after discarding stale synthetic current session");
    expect(watchModel).toContain("retransferExistingBaselinePackageIfPossible");
    expect(watchModel).toContain("readManifest");
    expect(watchModel).toContain("Retransferred existing sealed baseline package");
    expect(watchModel).toContain("sendCommitReceipt");
    expect(watchModel).toContain("transferSyntheticPackage");
    expect(watchModel).toContain("transferSealedPackage");
    expect(watchModel).toContain("sendStatusSnapshot");
    expect(watchModel).toContain("requireCanStartSession(sessionId:");
  });

  it("documents the next synthetic transport recovery drills before real providers", () => {
    const nextSteps = readSource(
      "docs/testing/watch-mode-synthetic-transport-next-steps.md",
    );

    expect(nextSteps).toContain("Immediate QA Harness Cleanup");
    expect(nextSteps).toContain("Phone-closed package recovery");
    expect(nextSteps).toContain("Watch reload recovery");
    expect(nextSteps).toContain("Delayed/unreachable retry");
    expect(nextSteps).toContain("Move-On Criteria");
    expect(nextSteps).toContain("Start with low-risk battery and Low Power Mode");
    expect(nextSteps).toContain("Do not add HealthKit, CoreMotion, workout runtime");
  });

  it("lets the Watch baseline pull the latest application-context plan before using stale local state", () => {
    const watchCoordinator = readSource(
      "ios/LucidTLR Watch App/Connectivity/WatchTransportCoordinator.swift",
    );

    expect(watchCoordinator).toContain(
      "syncReceivedApplicationContextStagedPlanIfPresent",
    );
    expect(watchCoordinator).toContain("WCSession.default.receivedApplicationContext");
    expect(watchCoordinator).toContain("persistedStagedPlan");
    expect(watchCoordinator).toContain("applyStagedPlan");
    expect(watchCoordinator).toContain("requestedSessionId ?? stagedPlan?.sessionId");
    expect(watchCoordinator).toContain("requestedPlanHash ?? stagedPlan?.planHash");
  });

  it("uses applicationContext as the current staged-plan source instead of queuing plan.available userInfo", () => {
    const phoneBridge = readSource("ios/LucidTLR/LucidTLRWatchTransport.swift");
    const labTransport = readSource(
      "src/features/watchModeLab/watchModeTransportLab.ts",
    );
    const stageMethod = phoneBridge.slice(
      phoneBridge.indexOf("func stageSyntheticPlan"),
      phoneBridge.indexOf("@objc(requestWatchStatus"),
    );

    expect(stageMethod).toContain("session.updateApplicationContext(payload)");
    expect(stageMethod).not.toContain("session.transferUserInfo(payload)");
    expect(labTransport).toContain('deliveryMethod: "applicationContext"');
    expect(labTransport).not.toContain("applicationContext+transferUserInfo");
  });

  it("keeps Watch transport lab state in one atomic session-scoped Codable value", () => {
    const watchMessages = readSource(
      "ios/LucidTLR Watch App/Connectivity/WatchTransportMessages.swift",
    );
    const watchCoordinator = readSource(
      "ios/LucidTLR Watch App/Connectivity/WatchTransportCoordinator.swift",
    );

    expect(watchMessages).toContain("struct WatchTransportLabState: Codable");
    expect(watchMessages).toContain("watch-transport-lab-state-v2");
    expect(watchMessages).toContain("mutating func resetForNewStagedPlan");
    expect(watchMessages).toContain("recentIncomingMessageIds");
    expect(watchMessages).toContain("noteStaleIgnored");
    expect(watchCoordinator).toContain(
      "stateKey = \"lucidtlr.watchTransportLab.state.v2\"",
    );
    expect(watchCoordinator).toContain("removeLegacyScatteredStateKeys");
    expect(watchCoordinator).toContain("mutateState");

    // The scattered per-field current-session keys must not be written or
    // read individually anymore; they only appear in the legacy cleanup list.
    for (const legacyKeyProperty of [
      "stagedPlanJsonKey",
      "stagedPlanReceivedAtKey",
      "latestAckSessionIdKey",
      "latestAckPlanHashKey",
      "latestAckPackageIdKey",
      "latestAckPackageHashKey",
      "latestAckedAtKey",
      "latestPackageTransferJsonKey",
    ]) {
      expect(watchCoordinator).not.toContain(legacyKeyProperty);
    }
    expect(watchCoordinator).not.toContain("defaults.set(plan.sessionId");
    expect(watchCoordinator).not.toContain("defaults.set(true, forKey:");
  });

  it("resets the Watch lab transport epoch when a new plan is staged", () => {
    const watchMessages = readSource(
      "ios/LucidTLR Watch App/Connectivity/WatchTransportMessages.swift",
    );
    const watchCoordinator = readSource(
      "ios/LucidTLR Watch App/Connectivity/WatchTransportCoordinator.swift",
    );

    expect(watchCoordinator).toContain("state.resetForNewStagedPlan()");
    expect(watchMessages).toContain(
      "self = WatchTransportLabState.empty(updatedAt: preservedUpdatedAt)",
    );
    expect(watchMessages).toContain("recentIncomingMessageIds = preservedRing");
  });

  it("ignores stale queued plan nudges instead of overwriting the newer staged plan", () => {
    const watchCoordinator = readSource(
      "ios/LucidTLR Watch App/Connectivity/WatchTransportCoordinator.swift",
    );
    const watchMessages = readSource(
      "ios/LucidTLR Watch App/Connectivity/WatchTransportMessages.swift",
    );

    expect(watchMessages).toContain("messageCreatedAt");
    expect(watchCoordinator).toContain("incomingCreatedAt < existingCreatedAt");
    expect(watchCoordinator).toContain(
      "stale_plan_nudge_older_than_current_staged_plan",
    );
  });

  it("deduplicates incoming transport messages with a bounded idempotency ring on both sides", () => {
    const watchMessages = readSource(
      "ios/LucidTLR Watch App/Connectivity/WatchTransportMessages.swift",
    );
    const watchCoordinator = readSource(
      "ios/LucidTLR Watch App/Connectivity/WatchTransportCoordinator.swift",
    );
    const phoneBridge = readSource("ios/LucidTLR/LucidTLRWatchTransport.swift");

    expect(watchMessages).toContain("recentIncomingMessageIdLimit");
    expect(watchMessages).toContain("hasSeenIncomingMessageId");
    expect(watchCoordinator).toContain("duplicateIgnoredCount");
    expect(watchCoordinator).toContain("duplicate.ignored");
    expect(phoneBridge).toContain("noteIncomingMessageIdAndDetectDuplicate");
    expect(phoneBridge).toContain("recentIncomingMessageIds");
    expect(phoneBridge).toContain("recentIncomingMessageIdLimit");
    expect(phoneBridge).toContain("duplicate.ignored");
    expect(phoneBridge).toContain("latestIgnoredDuplicate");
  });

  it("ignores and logs stale old-session ack evidence instead of counting it as current-session success", () => {
    const watchCoordinator = readSource(
      "ios/LucidTLR Watch App/Connectivity/WatchTransportCoordinator.swift",
    );
    const watchMessages = readSource(
      "ios/LucidTLR Watch App/Connectivity/WatchTransportMessages.swift",
    );

    expect(watchCoordinator).toContain("ack_for_stale_old_session");
    expect(watchCoordinator).toContain("noteStaleIgnored");
    expect(watchMessages).toContain("WatchTransportStaleIgnoredRecord");
    expect(watchMessages).toContain("staleIgnoredCount");
    expect(watchMessages).toContain("staleIgnoredSummary");
  });

  it("verifies received package content hashes at the phone receive boundary", () => {
    const phoneBridge = readSource("ios/LucidTLR/LucidTLRWatchTransport.swift");
    const packageBuilder = readSource(
      "ios/LucidTLR Watch App/Connectivity/WatchTransportPackageBuilder.swift",
    );

    // The Watch transport package builder seals with real SHA-256 content
    // digests, so the phone can fully verify at receive time.
    expect(packageBuilder).toContain("import CryptoKit");
    expect(packageBuilder).toContain("SHA256.hash");
    expect(phoneBridge).toContain("import CryptoKit");
    expect(phoneBridge).toContain("verifyReceivedPackageFile");
    expect(phoneBridge).toContain("canonicalJSONString");
    expect(phoneBridge).toContain("sha256Hex");
    expect(phoneBridge).toContain("hashVerification");
    expect(phoneBridge).toContain("verified-sha256");
    expect(phoneBridge).toContain("receive-boundary hash verification");
    // A failed verification must never surface as the latest received package.
    expect(phoneBridge.indexOf("verifyReceivedPackageFile")).toBeLessThan(
      phoneBridge.indexOf("return .success("),
    );
  });

  it("stores received unacked packages under Application Support, not purgeable Caches", () => {
    const phoneBridge = readSource("ios/LucidTLR/LucidTLRWatchTransport.swift");

    expect(phoneBridge).toContain(".applicationSupportDirectory");
    expect(phoneBridge).toContain("completeUntilFirstUserAuthentication");
    expect(phoneBridge).not.toContain("cachesDirectory");
  });

  it("exports stale-ignored versus duplicate-ignored transport diagnostics", () => {
    const exportSource = readSource(
      "src/features/watchModeLab/watchModeLabDebugExport.ts",
    );
    const types = readSource(
      "src/native/watchTransport/NativeWatchTransportTypes.ts",
    );
    const phoneLab = readSource("src/screens/WatchModeLabScreen.tsx");

    expect(types).toContain("hashVerification?: string");
    expect(types).toContain("latestIgnoredDuplicate");
    expect(types).toContain("watchStaleIgnoredSummary");
    expect(types).toContain("duplicateIgnoredCount");
    expect(types).toContain("matchesStagedPlan");
    expect(exportSource).toContain("receivedPackageHashVerification");
    expect(exportSource).toContain("phoneDuplicateIgnoredCount");
    expect(exportSource).toContain("watchStaleIgnoredSummary");
    expect(exportSource).toContain("watchDuplicateIgnoredCount");
    expect(phoneLab).toContain("package hash check");
    expect(phoneLab).toContain("phone dupes ignored");
    expect(phoneLab).toContain("watch stale ignored");
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
