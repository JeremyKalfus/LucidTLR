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

    expect(home).toContain('selectedMode === "watch"');
    expect(home).toContain("WATCH_MODE_DISABLED_MESSAGE");
    expect(home).toContain("showWatchDisabledMessage()");
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
});
