import { describe, expect, it } from "vitest";

declare const require: (moduleName: string) => any;

const { existsSync, readdirSync, readFileSync } = require("fs");
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

describe("Watch Mode disabled placeholder source of truth", () => {
  it("keeps one shared disabled-state source", () => {
    const source = readSource("src/features/watchMode/watchModeAvailability.ts");

    expect(source).toContain("WATCH_MODE_ENABLED = false");
    expect(source).toContain("WATCH_MODE_DISABLED_MESSAGE");
    expect(source).toContain("planned option");
  });

  it("keeps Watch Mode visible on Home while public builds still block session creation", () => {
    const home = readSource("src/screens/HomeScreen.tsx");

    expect(home).toContain('selectedMode === "watch"');
    expect(home).toContain("WATCH_MODE_DISABLED_MESSAGE");
    expect(home).toContain("showWatchDisabledMessage()");
    expect(home).toContain("isWatchModeProductFlowAvailable()");
    expect(home).toContain('startWatchModeProductFlow("tlr")');
    expect(home).toContain('startWatchModeProductFlow("sleep_log")');
    expect(home).not.toContain('selectedMode === "watch") {\n      startSession("tlr")');
    expect(home).not.toContain('selectedMode === "watch") {\n      startSession("sleep_log")');
  });

  it("defensively blocks new Watch sessions in app state", () => {
    const appState = readSource("src/state/AppState.tsx");

    expect(appState).toContain('selectedMode === "watch"');
    expect(appState).toContain("throw new Error(WATCH_MODE_DISABLED_MESSAGE)");
  });

  it("renders stale Watch sessions as local placeholders only", () => {
    const activeNight = readSource("src/screens/ActiveNightSessionScreen.tsx");

    expect(activeNight).toContain("Local Watch Mode placeholder");
    expect(activeNight).toContain("End Local Session");
    expect(activeNight).not.toContain("watchRuntime");
    expect(activeNight).not.toContain("WatchConnectionCheckpoint");
    expect(activeNight).not.toContain(legacyName("beginWatch", "OwnedStartSync"));
    expect(activeNight).not.toContain(legacyName("requestWatch", "OwnedLogSync"));
    expect(activeNight).not.toContain(legacyName("acknowledgeWatch", "OwnedLogSync"));
  });

  it("keeps review, data, and settings local-only for Watch history", () => {
    const morningReview = readSource("src/screens/MorningReviewScreen.tsx");
    const data = readSource("src/screens/DataScreen.tsx");
    const settings = readSource("src/screens/SettingsScreen.tsx");

    expect(morningReview).toContain("loadWatchRuntimeEventsForSession");
    expect(morningReview).toContain("loadWatchEpochsForSession");
    expect(morningReview).not.toContain(legacyName("importWatch", "OwnedSessionLogs"));
    expect(data).toContain("Historical local Watch");
    expect(data).not.toContain(legacyName("getLatestWatch", "OwnedStatus"));
    expect(settings).toContain("WATCH_MODE_DISABLED_STATUS");
    expect(settings).not.toContain("watchRuntime");
  });

  it("removes active Watch runtime modules and resources", () => {
    expect(fileExists("src/native/watch")).toBe(false);
    expect(fileExists("src/engine/watchRem")).toBe(false);
    expect(fileExists(legacyName("assets/models/mallela", "_rf_v1.json"))).toBe(false);
    expect(fileExists(legacyName("ios/LucidTLR/LucidTLR", "WatchRuntime.swift"))).toBe(false);
    expect(fileExists(legacyName("ios/LucidTLR/LucidTLR", "WatchRuntimeBridge.m"))).toBe(false);
  });

  it("keeps the public Watch app as a placeholder target", () => {
    const watchFiles = readdirSync(path.join(repoRoot, "ios/LucidTLR Watch App"));
    const contentView = readSource("ios/LucidTLR Watch App/ContentView.swift");
    const watchApp = readSource("ios/LucidTLR Watch App/LucidTLRWatchApp.swift");

    expect(watchFiles).not.toContain(legacyName("WatchSession", "Manager.swift"));
    expect(contentView).toContain("LucidTLR Watch");
    expect(contentView).toContain("Watch Mode is being rebuilt");
    expect(contentView).toContain("#else");
    expect(contentView).toContain("placeholder");
    expect(watchApp).toContain("LucidTLRWatchApp");
    expect(contentView).not.toContain("WatchConnectivity");
    expect(contentView).not.toContain("HealthKit");
  });

  it("removes the phone-side Watch speaker path", () => {
    const runtimeClient = readSource("src/native/phoneRuntime/phoneRuntimeClient.ts");
    const phoneRuntimeSwift = readSource("ios/LucidTLR/LucidTLRPhoneRuntime.swift");

    expect(fileExists(legacyName("src/native/phoneRuntime/buildNativePhone", "WatchSpeakerPlan.ts"))).toBe(false);
    expect(runtimeClient).not.toContain(legacyName("startPhone", "WatchSpeakerSession"));
    expect(phoneRuntimeSwift).not.toContain("speakerOnly");
    expect(phoneRuntimeSwift).not.toContain("handOffPresleepTrainingToSpeakerOnly");
  });
});
