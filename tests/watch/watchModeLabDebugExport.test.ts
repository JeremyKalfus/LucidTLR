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

const helperPath = "src/features/watchModeLab/watchModeLabDebugExport.ts";
const eventHelperPath = "src/features/watchModeLab/watchModeLabDebugEvents.ts";
const screenPath = "src/screens/WatchModeLabScreen.tsx";

describe("Watch Mode Lab debug export", () => {
  it("adds a versioned phone lab debug bundle helper", () => {
    const helper = readSource(helperPath);

    expect(fileExists(helperPath)).toBe(true);
    expect(helper).toContain("WATCH_MODE_LAB_DEBUG_BUNDLE_SCHEMA_VERSION");
    expect(helper).toContain("watch-mode-lab-debug-bundle-v1");
    expect(helper).toContain("watchModeEnabled");
    expect(helper).toContain("lab:");
    expect(helper).toContain("actionLog");
    expect(helper).toContain("transport:");
    expect(helper).toContain("syncLedger:");
    expect(helper).toContain("imports:");
    expect(helper).toContain("diagnostics:");
    expect(helper).toContain("timeline:");
    expect(helper).toContain("stateTransitions:");
    expect(helper).toContain("transportMessages:");
    expect(helper).toContain("packageFlow:");
    expect(helper).toContain("drillAssessment:");
  });

  it("exports recovery, transport, import, and ack diagnosis data", () => {
    const helper = readSource(helperPath);

    expect(helper).toContain("loadUnresolvedWatchSessionSyncStates");
    expect(helper).toContain("loadRecentWatchSessionSyncStates");
    expect(helper).toContain("loadRecentWatchSyncPackageImports");
    expect(helper).toContain("loadWatchModeLabRecoverySummary");
    expect(helper).toContain("getTransportStatus");
    expect(helper).toContain("latestImportSummary");
    expect(helper).toContain("latestValidationSummary");
    expect(helper).toContain("ackEligibleSeen");
    expect(helper).toContain("ackRecordedSeen");
    expect(helper).toContain("unresolvedCount");
    expect(helper).toContain("finalDrillStatus");
    expect(helper).toContain("failureReasons");
    expect(helper).toContain("transportErrorSeen");
    expect(helper).toContain("hasRegressedImportedState");
    expect(helper).toContain("stateRegressionDetected");
    expect(helper).toContain("finalUnresolvedStateBlocksStart");
    expect(helper).toContain("mismatchedHashDetected");
    expect(helper).toContain("transportCommitReceiptSeen");
    expect(helper).toContain("transportPackageReceivedSeen");
    expect(helper).toContain("transportPackageFileReceivedSeen");
    expect(helper).toContain("packageFilePersistedSeen");
    expect(helper).toContain("fixtureImportSeen");
    expect(helper).toContain("recoverySimulationSeen");
    expect(helper).toContain("currentTransportSessionId");
    expect(helper).toContain("currentSessionImportedPackageSeen");
    expect(helper).toContain("currentSessionAckEligibleSeen");
    expect(helper).toContain("currentSessionAckRecordedSeen");
    expect(helper).toContain("watchPackageTransferAttemptSeen");
    expect(helper).toContain("watchPackageTransferQueued");
    expect(helper).toContain("watchPackageTransferErrorSeen");
    expect(helper).toContain("terminalThenUnresolvedStateSeen");
    expect(helper).toContain("isTransportCommitReceiptEvent");
    expect(helper).toContain("isTransportPackageReceivedEvent");
    expect(helper).toContain("isWatchPackageTransferStatusEvent");
    expect(helper).toContain("Package manifest/status was observed, but no package file receipt was recorded on the phone.");
    expect(helper).toContain("Package file receipt was observed, but the phone did not persist a readable package file.");
    expect(helper).toContain("Watch commit receipt arrived, but no Watch package transfer attempt/status was observed.");
    expect(helper).toContain("Watch package transfer diagnostics reported an error.");
    expect(helper).toContain("sessionId ?? \"no-session\"");
  });

  it("exports a bounded postmortem timeline, transitions, messages, and package flow", () => {
    const helper = readSource(helperPath);
    const eventHelper = readSource(eventHelperPath);
    const migration = readSource(
      "src/data/local/migrations/010_watch_lab_debug_events.sql",
    );
    const schema = readSource("src/data/local/schema.ts");
    const runtimeMigrations = readSource("src/data/local/runtimeMigrations.ts");

    expect(fileExists(eventHelperPath)).toBe(true);
    expect(fileExists("src/data/local/migrations/010_watch_lab_debug_events.sql")).toBe(true);
    expect(migration).toContain("watch_lab_debug_events");
    expect(schema).toContain("010_watch_lab_debug_events");
    expect(runtimeMigrations).toContain("010_watch_lab_debug_events");
    expect(eventHelper).toContain("WATCH_MODE_LAB_DEBUG_EVENT_LIMIT = 100");
    expect(eventHelper).toContain("appendWatchModeLabStateTransition");
    expect(eventHelper).toContain("appendWatchModeLabTransportMessage");
    expect(eventHelper).toContain("appendWatchModeLabTransportStatusSnapshot");
    expect(helper).toContain("buildTimeline");
    expect(helper).toContain("buildStateTransitions");
    expect(helper).toContain("buildTransportMessages");
    expect(helper).toContain("buildPackageFlow");
    expect(helper).toContain("buildDrillAssessment");
    expect(helper).toContain("raw:");
    expect(helper).toContain("currentUnresolvedStates");
    expect(helper).toContain("currentRecentStates");
    expect(helper).toContain("WATCH_MODE_LAB_DEBUG_EVENT_LIMIT");
    expect(helper).toContain("PACKAGE_IMPORT_RECORD_LIMIT");
  });

  it("documents export warnings and limitations inside the bundle", () => {
    const helper = readSource(helperPath);

    for (const expected of [
      "Synthetic/internal lab export only.",
      "Local export only; no automatic upload is performed.",
      "No real HR, motion, or REM validation.",
      "No real haptics or audio validation.",
      "No overnight validation.",
      "Dream journal content is excluded.",
      "Raw high-rate motion is excluded.",
      "Supabase tokens, Apple credentials, API keys, and raw device identifiers are excluded.",
      "Public Watch Mode remains disabled.",
    ]) {
      expect(helper).toContain(expected);
    }
  });

  it("adds a local export UI with share and clipboard fallback", () => {
    const screen = readSource(screenPath);

    expect(screen).toContain("Export Watch Lab Debug Bundle");
    expect(screen).toContain("Local export only");
    expect(screen).toContain("No upload");
    expect(screen).toContain("Excludes dream journal content");
    expect(screen).toContain("Synthetic/internal lab only");
    expect(screen).toContain("createWatchModeLabDebugBundle");
    expect(screen).toContain("actionLog");
    expect(screen).toContain("recordLabAction");
    expect(screen).toContain("phone_lab_opened");
    expect(screen).toContain("Mark phone reload recovery tested");
    expect(screen).toContain("phone_reload_recovery_tested");
    expect(screen).toContain("Run Transport Drill");
    expect(screen).toContain("Run One-Button Baseline");
    expect(screen).toContain("one-button happy path");
    expect(screen).toContain("does not replace force-quit");
    expect(screen).toContain("automated_transport_baseline_started");
    expect(screen).toContain("automated_transport_baseline_waiting_for_watch");
    expect(screen).toContain("automated_transport_baseline_waiting_for_package_file");
    expect(screen).toContain("automated_transport_baseline_completed");
    expect(screen).toContain("guided_transport_drill_started");
    expect(screen).toContain("guided_transport_drill_step_completed");
    expect(screen).toContain("activate transport again");
    expect(screen).toContain("package transfer stage/bytes");
    expect(screen).toContain("Mark current guided step complete");
    expect(screen).toContain("do not prove");
    expect(screen).toContain("WatchConnectivity");
    expect(screen).toContain("Includes lab action timeline");
    expect(screen).toContain("sync-state");
    expect(screen).toContain("transitions");
    expect(screen).toContain("package/import/ack summaries");
    expect(screen).toContain("package transfer stage");
    expect(screen).toContain("package transfer bytes");
    expect(screen).toContain("package transfer outstanding");
    expect(screen).toContain("package transfer error");
    expect(screen).toContain("latest package file");
    expect(screen).toContain("packageFilePersistenceLabel");
    expect(screen).toContain("FileSystem.writeAsStringAsync");
    expect(screen).toContain("Share.share");
    expect(screen).toContain('import("expo-clipboard")');
  });

  it("keeps the export local-only and out of research or dream-content upload paths", () => {
    const combined = [helperPath, eventHelperPath, screenPath]
      .map(readSource)
      .join("\n");

    for (const forbidden of [
      "@supabase/supabase-js",
      "prepareAnonymousResearchUpload",
      "dream_upload",
      "upload_queue",
      "research upload",
      "dream_journal_entries",
      "DreamJournalEntry",
      "journalText",
      "audioUri",
      "transcript",
      "SUPABASE_URL",
      "SUPABASE_ANON_KEY",
      "appleDeveloper",
    ]) {
      expect(combined).not.toContain(forbidden);
    }

    expect(combined).toContain("[redacted]");
  });

  it("keeps Watch Mode public-disabled and the internal lab gate intact", () => {
    const availability = readSource(
      "src/features/watchMode/watchModeAvailability.ts",
    );
    const home = readSource("src/screens/HomeScreen.tsx");
    const appState = readSource("src/state/AppState.tsx");
    const flags = readSource("src/features/internalBuild/internalBuildFlags.ts");
    const screen = readSource(screenPath);

    expect(availability).toContain("WATCH_MODE_ENABLED = false");
    expect(home).toContain("WATCH_MODE_DISABLED_MESSAGE");
    expect(appState).toContain("throw new Error(WATCH_MODE_DISABLED_MESSAGE)");
    expect(flags).toContain("EXPO_PUBLIC_WATCH_MODE_LAB_ENABLED");
    expect(screen).toContain("if (!isWatchModeLabAvailable())");
    expect(screen).toContain("<Redirect href=\"/\" />");
  });

  it("does not add real sensor, audio, haptic, or transport-runtime behavior", () => {
    const combined = [helperPath, eventHelperPath, screenPath]
      .map(readSource)
      .join("\n");

    for (const forbidden of [
      "import HealthKit",
      "import CoreMotion",
      "import AVFoundation",
      "HKWorkoutSession",
      "startDeviceMotionUpdates",
      "startAccelerometerUpdates",
      "WKInterfaceDevice.play",
      "playCue",
      "scheduleCue",
    ]) {
      expect(combined).not.toContain(forbidden);
    }
  });

  it("keeps importer transaction and ack eligibility guardrails visible", () => {
    const importer = readSource("src/features/watchHistory/importWatchPackage.ts");
    const labTransport = readSource(
      "src/features/watchModeLab/watchModeTransportLab.ts",
    );

    expect(importer).toContain("withTransaction");
    expect(importer).toContain("ackEligible: true");
    expect(labTransport).toContain("importWatchPackage");
    expect(labTransport).toContain("No ack-eligible imported Watch package exists");
  });
});
