import { describe, expect, it } from "vitest";

import { builtInCues } from "@/src/audio/cueCatalog";
import { createDefaultEngineSettings } from "@/src/engine";
import { createDefaultTlrOptions } from "@/src/features/tlrOptions/tlrOptions";
import {
  WATCH_RUNTIME_PLAN_SCHEMA_VERSION,
  buildWatchRuntimePlan,
  buildWatchRuntimePlanFromSession,
} from "@/src/native/watchRuntime";

declare const require: (moduleName: string) => any;

const { readFileSync } = require("fs");
const path = require("path");
const repoRoot = process.cwd();

function watchResourcesBuildPhase(): string {
  const project = readFileSync(
    path.join(repoRoot, "ios/LucidTLR.xcodeproj/project.pbxproj"),
    "utf8",
  );
  const targetMatch = project.match(
    /[A-F0-9]{24} \/\* LucidTLR Watch App \*\/ = \{\s+isa = PBXNativeTarget;[\s\S]*?buildPhases = \([\s\S]*?([A-F0-9]{24}) \/\* Resources \*\//,
  );
  const resourcesBuildPhaseId = targetMatch?.[1];

  if (!resourcesBuildPhaseId) {
    throw new Error("Could not find LucidTLR Watch App resources build phase.");
  }

  const phaseMatch = project.match(
    new RegExp(
      `${resourcesBuildPhaseId} /\\* Resources \\*/ = \\{[\\s\\S]*?files = \\([\\s\\S]*?\\);`,
    ),
  );

  if (!phaseMatch) {
    throw new Error("Could not read LucidTLR Watch App resources build phase.");
  }

  return phaseMatch[0];
}

describe("buildWatchRuntimePlan", () => {
  it("builds a v3 Watch-owned TLR plan from current app state inputs", () => {
    const plan = buildWatchRuntimePlan({
      sessionId: "session-1",
      participantId: "participant-1",
      sessionType: "tlr",
      createdAt: "2026-06-07T04:00:00.000Z",
      selectedCueId: "dx-harp-c5",
      tlrOptions: createDefaultTlrOptions(),
      engineSettings: createDefaultEngineSettings("standard"),
    });

    expect(plan.schemaVersion).toBe(WATCH_RUNTIME_PLAN_SCHEMA_VERSION);
    expect(plan.mode).toBe("watch");
    expect(plan.selectedCueId).toBe("dx-harp-c5");
    expect(plan.cueOutput).toMatchObject({
      hapticEnabled: true,
      audioEnabled: false,
      audioRequiresPreflight: true,
      defaultOutput: "haptic",
    });
    expect(plan.epoching).toMatchObject({
      epochSeconds: 30,
      rawMotionPersistence: false,
    });
    expect(plan.safety).toMatchObject({
      requireWorkoutSession: true,
      requireHealthKitAuthorization: true,
      requireMotion: true,
      requireLowPowerModeOff: true,
    });
    expect(plan.assets.map((asset) => asset.kind)).toEqual(["cue", "training"]);
    expect(plan.assets.map((asset) => asset.owner)).toEqual(["watch", "phone"]);
    expect(plan.safety.lowBatteryWarningLevel).toBeGreaterThan(
      plan.safety.minimumStartBatteryLevel,
    );
    expect(plan.privacy.noGps).toBe(true);
    expect(plan.privacy.noLiveAppleSleepStages).toBe(true);
  });

  it("keeps product-required Watch-owned cue assets complete in the Watch target", () => {
    const resources = watchResourcesBuildPhase();
    const watchOwnedResourceNames = new Set<string>();
    const phoneOwnedResourceNames = new Set<string>();

    for (const cue of builtInCues) {
      const plan = buildWatchRuntimePlan({
        sessionId: `session-${cue.id}`,
        participantId: "participant-1",
        sessionType: "tlr",
        createdAt: "2026-06-07T04:00:00.000Z",
        selectedCueId: cue.id,
        tlrOptions: createDefaultTlrOptions(),
        engineSettings: createDefaultEngineSettings("standard"),
      });

      for (const asset of plan.assets) {
        const resourceName = `${asset.resourceName}.${asset.resourceExtension}`;

        if (asset.owner === "watch") {
          watchOwnedResourceNames.add(resourceName);
        } else {
          phoneOwnedResourceNames.add(resourceName);
        }
      }
    }

    expect([...watchOwnedResourceNames].sort()).toEqual(
      [
        "clear_bell_chime.mp3",
        "dx_harp_c5.mp3",
        "harp_flourish.mp3",
        "sci_fi_confirmation.wav",
        "ui_success_chime.mp3",
      ].sort(),
    );

    for (const resourceName of watchOwnedResourceNames) {
      expect(resources).toContain(`${resourceName} in Resources`);
    }

    expect(phoneOwnedResourceNames).toContain("final_lucid_training.mp3");
    expect(resources).not.toContain("final_lucid_training.mp3 in Resources");
  });

  it("requires an explicit lab opt-in before enabling experimental audio", () => {
    const common = {
      sessionId: "session-1",
      participantId: "participant-1",
      sessionType: "tlr" as const,
      createdAt: "2026-06-07T04:00:00.000Z",
      selectedCueId: "harp-flourish",
      tlrOptions: {
        ...createDefaultTlrOptions(),
        watchAudioCueEnabled: true,
      },
      engineSettings: createDefaultEngineSettings(),
    };

    expect(buildWatchRuntimePlan(common).cueOutput.audioEnabled).toBe(false);
    expect(
      buildWatchRuntimePlan({
        ...common,
        allowExperimentalAudio: true,
      }).cueOutput,
    ).toMatchObject({
      hapticEnabled: true,
      audioEnabled: true,
      audioRequiresPreflight: true,
    });
  });

  it("can build from a NightSession-shaped object without starting Watch Mode", () => {
    const plan = buildWatchRuntimePlanFromSession({
      session: {
        id: "session-1",
        participantId: "participant-1",
        sessionType: "sleep_log",
        startedAt: "2026-06-07T04:00:00.000Z",
        selectedCueId: "harp-flourish",
      },
      tlrOptions: createDefaultTlrOptions(),
      engineSettings: createDefaultEngineSettings(),
    });

    expect(plan.sessionType).toBe("sleep_log");
    expect(plan.tlrInterval.enabled).toBe(false);
    expect(plan.training.enabled).toBe(false);
    expect(plan.assets.map((asset) => asset.kind)).toEqual(["cue"]);
    expect(plan.assets.map((asset) => asset.owner)).toEqual(["watch"]);
  });
});
