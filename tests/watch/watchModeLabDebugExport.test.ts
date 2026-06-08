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
const screenPath = "src/screens/WatchModeLabScreen.tsx";

describe("Watch Mode Lab debug export", () => {
  it("adds a versioned phone lab debug bundle helper", () => {
    const helper = readSource(helperPath);

    expect(fileExists(helperPath)).toBe(true);
    expect(helper).toContain("WATCH_MODE_LAB_DEBUG_BUNDLE_SCHEMA_VERSION");
    expect(helper).toContain("watch-mode-lab-debug-bundle-v1");
    expect(helper).toContain("watchModeEnabled");
    expect(helper).toContain("lab:");
    expect(helper).toContain("transport:");
    expect(helper).toContain("syncLedger:");
    expect(helper).toContain("imports:");
    expect(helper).toContain("diagnostics:");
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
    expect(helper).toContain("transportErrorSeen");
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
    expect(screen).toContain("FileSystem.writeAsStringAsync");
    expect(screen).toContain("Share.share");
    expect(screen).toContain('import("expo-clipboard")');
  });

  it("keeps the export local-only and out of research or dream-content upload paths", () => {
    const combined = [helperPath, screenPath].map(readSource).join("\n");

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
    ]) {
      expect(combined).not.toContain(forbidden);
    }
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
    const combined = [helperPath, screenPath].map(readSource).join("\n");

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
