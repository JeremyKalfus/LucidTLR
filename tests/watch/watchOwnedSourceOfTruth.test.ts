/// <reference types="node" />

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function readSource(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("Watch-owned v2 source of truth", () => {
  it("does not use legacy phone-owned Watch start builders in normal Watch Mode screens", () => {
    const normalWatchModeScreens = [
      "src/screens/HomeScreen.tsx",
      "src/screens/PresleepTrainingScreen.tsx",
      "src/screens/ActiveNightSessionScreen.tsx",
    ];

    for (const path of normalWatchModeScreens) {
      const source = readSource(path);

      expect(source).not.toContain("buildNativeWatchSessionPlan");
      expect(source).not.toContain("startWatchSession(");
      expect(source).not.toContain("requestWatchOwnedStart");
    }
  });

  it("uses Watch-owned status before legacy status in Active Night", () => {
    const source = readSource("src/screens/ActiveNightSessionScreen.tsx");
    const ownedStatusIndex = source.indexOf("getLatestWatchOwnedStatus()");
    const legacyStatusIndex = source.indexOf("getWatchRuntimeStatus()");

    expect(ownedStatusIndex).toBeGreaterThan(-1);
    expect(legacyStatusIndex).toBeGreaterThan(-1);
    expect(ownedStatusIndex).toBeLessThan(legacyStatusIndex);
    expect(source).not.toContain('reason: "orphaned"');
  });

  it("keeps legacy v1 Watch runtime code out of Watch-owned v2 log import", () => {
    const source = readSource("src/native/watch/watchRuntimePersistence.ts");

    expect(source).toContain("importWatchOwnedRuntimeDataToLocalRecords");
    expect(source).not.toContain("startWatchSession(");
    expect(source).not.toContain("buildNativeWatchSessionPlan");
  });

  it("includes the Watch-owned model and short cue asset in the Watch target", () => {
    const project = readSource("ios/LucidCue.xcodeproj/project.pbxproj");
    const watchResourcesStart = project.indexOf(
      "4AFEF0238B754B4A9CF00001 /* Resources */ = {",
    );
    const watchResourcesPhase = project.slice(
      watchResourcesStart,
      project.indexOf("};", watchResourcesStart),
    );

    expect(watchResourcesStart).toBeGreaterThan(-1);
    expect(project).toContain("mallela_rf_v1.json");
    expect(project).toContain("clear_bell_chime.mp3");
    expect(watchResourcesPhase).toContain("mallela_rf_v1.json in Resources");
    expect(watchResourcesPhase).toContain("clear_bell_chime.mp3 in Resources");
  });
});
