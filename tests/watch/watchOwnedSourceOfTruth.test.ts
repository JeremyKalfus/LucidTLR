/// <reference types="node" />

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const legacyNativeWatchPlanBuilder = "buildNative" + "WatchSessionPlan";
const legacyWatchCommandV1 = "watch-command" + "-v1";
const legacyWatchStartSession = "start" + "WatchSession";

function readSource(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("Watch-owned v2 source of truth", () => {
  it("documents the LLM orientation entrypoints and conditional handoff policy", () => {
    const agents = readSource("AGENTS.md");
    const gitignore = readSource(".gitignore");
    const handoff = readSource(".agent_work/current.md.example");

    expect(agents).toContain("docs/llm-orientation.md");
    expect(agents).toContain("docs/decisions/001-watch-mode-is-watch-owned.md");
    expect(agents).toContain("docs/decisions/002-phone-mode-is-phone-owned.md");
    expect(agents).toContain("Ask Jeremy whenever you are uncertain");
    expect(agents).toContain("npm run typecheck");
    expect(agents).toContain("git diff --check");
    expect(gitignore).toContain(".agent_work/*");
    expect(gitignore).toContain("!.agent_work/current.md.example");
    expect(handoff).toContain("Latest User Instruction");
    expect(handoff).toContain("Recent Actions");
    expect(handoff).toContain("Verification Evidence");
    expect(handoff).toContain("Handoff Status");
  });

  it("documents the current Watch workflow and LucidCue fundamentals for future workers", () => {
    const orientation = readSource("docs/llm-orientation.md");
    const watchAdr = readSource("docs/decisions/001-watch-mode-is-watch-owned.md");
    const phoneAdr = readSource("docs/decisions/002-phone-mode-is-phone-owned.md");
    const combined = `${orientation}\n${watchAdr}\n${phoneAdr}`;

    expect(combined).toContain("Phone Mode is phone-owned");
    expect(combined).toContain("Watch Mode is watch-owned");
    expect(combined).toContain("Waiting for Watch Sync");
    expect(combined).toContain("Sync Phone");
    expect(combined).toContain("Watch Mode training audio and cue audio are Watch-delivered");
    expect(combined).toContain("Background sleep audio is Phone Mode only");
    expect(combined).toContain("Runtime Owner");
    expect(combined).toContain("Avoid saying");
    expect(orientation).not.toContain("REM-Informed:");
    expect(combined).toContain("Push Back 30m");
    expect(combined).toContain("Pause/Play TLR");
    expect(combined).toContain("Sync Watch");
    expect(combined).toContain("v2 Watch logs are the source of truth");
    expect(combined).toContain("Android Phone Mode is later only");
    expect(combined).toContain("research-compatible data structures");
    expect(combined).toContain("local and consent-gated by default");
    expect(combined).toContain("engineering beta");
    expect(combined).toContain("Do not claim validated");
    expect(combined).toContain("REM staging");
    expect(combined).toContain("Ask Jeremy");
  });

  it("keeps stale deleted Watch runtime docs out of worker-facing documentation", () => {
    const docs = [
      "README.md",
      "TLR_App_Plan.md",
      "docs/watch-mode-implementation.md",
      "docs/dev-build.md",
      "docs/llm-orientation.md",
      "docs/decisions/001-watch-mode-is-watch-owned.md",
      "docs/decisions/002-phone-mode-is-phone-owned.md",
    ].map(readSource).join("\n");

    expect(docs).not.toContain("--lucidcue-watch-runtime-self-test");
    expect(docs).not.toContain(legacyNativeWatchPlanBuilder);
    expect(docs).not.toContain(legacyWatchStartSession);
    expect(docs).not.toContain("current phone-dependent Watch runtime is legacy");
    expect(docs).not.toContain("Watch-owned Watch Mode v2 is the target");
  });

  it("does not use legacy phone-owned Watch start builders in normal Watch Mode screens", () => {
    const normalWatchModeScreens = [
      "src/screens/HomeScreen.tsx",
      "src/screens/PresleepTrainingScreen.tsx",
      "src/screens/ActiveNightSessionScreen.tsx",
    ];

    for (const path of normalWatchModeScreens) {
      const source = readSource(path);

      expect(source).not.toContain(legacyNativeWatchPlanBuilder);
      expect(source).not.toContain(`${legacyWatchStartSession}(`);
      expect(source).not.toContain("requestWatchOwnedStart");
    }
  });

  it("uses only Watch-owned v2 status in Active Night", () => {
    const source = readSource("src/screens/ActiveNightSessionScreen.tsx");
    const ownedStatusIndex = source.indexOf("getLatestWatchOwnedStatus()");

    expect(ownedStatusIndex).toBeGreaterThan(-1);
    expect(source).not.toContain("getWatchRuntimeStatus");
    expect(source).not.toContain('reason: "orphaned"');
  });

  it("routes Watch Mode directly to Active Night instead of presleep training", () => {
    const home = readSource("src/screens/HomeScreen.tsx");
    const presleep = readSource("src/screens/PresleepTrainingScreen.tsx");

    expect(home).toContain('if (selectedMode === "watch")');
    expect(home).toContain('router.push("/active-night-session")');
    expect(home).not.toContain("prepareWatchOwnedSession");
    expect(presleep).toContain('activeSession?.mode === "watch"');
    expect(presleep).toContain('router.replace("/active-night-session")');
    expect(presleep).not.toContain("prepareWatchOwnedSession");
    expect(presleep).not.toContain("requiresWatchPlanBeforeTraining");
  });

  it("builds the normal Watch start around the user-led Active Night sync gate", () => {
    const source = readSource("src/screens/ActiveNightSessionScreen.tsx");

    expect(source).toContain("buildWatchOwnedSessionPlan");
    expect(source).toContain("projectedWatchTrainingCompletedAt");
    expect(source).toContain("beginWatchOwnedStartSync(plan)");
    expect(source).toContain('title="Waiting for Watch Sync"');
    expect(source).toContain('sendSessionEvent("start_watch_night"');
    expect(source).toContain("Sleep session controlled by watch");
    expect(source).not.toContain("buildNativePhoneWatchSpeakerPlan");
    expect(source).not.toContain("startPhoneWatchSpeakerSession");
    expect(source).not.toContain("prepareWatchOwnedSession");
    expect(source).not.toContain("requestWatchOwnedStop");
  });

  it("locks Watch end behind Sync Watch and lets Morning Review reuse imported local Watch records", () => {
    const activeNight = readSource("src/screens/ActiveNightSessionScreen.tsx");
    const morningReview = readSource("src/screens/MorningReviewScreen.tsx");

    expect(activeNight).toContain('title="Waiting for Phone Sync"');
    expect(activeNight).toContain('label={isStopping ? "Syncing..." : "Sync Watch"}');
    expect(activeNight).toContain("requestWatchOwnedLogSync({ sessionId })");
    expect(activeNight).toContain("acknowledgeWatchOwnedLogSync({ sessionId })");
    expect(activeNight).toContain("isCompleteWatchOwnedImportPayload(payload)");
    expect(activeNight).toContain("WatchConnectionCheckpoint");
    expect(activeNight).toContain("waitForCompleteWatchOwnedLogs");
    expect(morningReview).toContain("loadImportedWatchOwnedRuntimeSummary");
    expect(morningReview).toContain("isCompleteWatchOwnedImportPayload(payload)");
    expect(morningReview).toContain("WatchConnectionCheckpoint");
    expect(morningReview).not.toContain("getWatchEpochs(activeSession.id)");
    expect(morningReview).not.toContain("getWatchRuntimeLogs(activeSession.id)");
  });

  it("exposes the matching Watch-side sync screens and overnight controls", () => {
    const contentView = readSource("ios/LucidCue Watch App/ContentView.swift");
    const manager = readSource("ios/LucidCue Watch App/WatchSessionManager.swift");

    expect(contentView).toContain('Text("Waiting for iPhone Sync")');
    expect(contentView).toContain('Button("Sync Phone")');
    expect(contentView).toContain("Text(manager.syncPhoneScreenDetail)");
    expect(manager).toContain("hasPendingPhoneStartSync || shouldShowIdleSyncPhoneScreen");
    expect(manager).toContain("hasPendingPhoneStartSync && WCSession.default.activationState");
    expect(manager).toContain("private var shouldShowIdleSyncPhoneScreen");
    expect(manager).toContain("failedReason == nil");
    expect(contentView).toContain('Text("Waiting for Phone Sync")');
    expect(contentView).toContain('Button("Push Back 30m")');
    expect(contentView).toContain("manager.tlrPauseButtonTitle");
    expect(contentView).toContain('Button("Wake")');
    expect(manager).toContain("startWatchTraining");
    expect(manager).toContain('"watch_training_started"');
    expect(manager).toContain('"watch_training_cue_marker_reached"');
    expect(manager).toContain('"watch_training_cue_played"');
    expect(manager).toContain('"watch_training_completed"');
    expect(manager).toContain('"watch_tlr_interval_started"');
    expect(manager).toContain('"schemaVersion": "watch-owned-sync-request-v2"');
    expect(manager).toContain('"watch-owned-sync-state-v2"');
    expect(manager).toContain('"sync_logs"');
    expect(manager).toContain('"ack_logs_imported"');
  });

  it("prevents Watch battery-stop shutdown from re-entering final epoch emission", () => {
    const manager = readSource("ios/LucidCue Watch App/WatchSessionManager.swift");

    expect(manager).toContain("private var isStopping = false");
    expect(manager).toContain("guard (isRunning || isStarting) && !isStopping else");
    expect(manager).toContain("defer {\n      isStopping = false\n    }");
    expect(manager).toContain(
      "emitEpoch(connectivityState: connectivityState(), enforceTerminalChecks: false)",
    );
    expect(manager).toContain(
      "private func emitEpoch(connectivityState: String, enforceTerminalChecks: Bool = true)",
    );
    expect(manager).toContain("if enforceTerminalChecks, let plannedStopAt");
    expect(manager).toContain("if enforceTerminalChecks, let reason = batteryStopReason");
  });

  it("only treats a Watch-owned import as complete when the summary counts are present", () => {
    const source = readSource("src/native/watch/watchRuntimePersistence.ts");

    expect(source).toContain("isCompleteWatchOwnedImportPayload");
    expect(source).toContain("payload.summary.epochCount");
    expect(source).toContain("payload.summary.cueCount");
  });

  it("does not report Watch-owned plan sync success before WatchConnectivity can queue it", () => {
    const source = readSource("ios/LucidCue/LucidCueWatchRuntime.swift");
    const notReadyIndex = source.indexOf("watch_connectivity_not_ready");
    const transferIndex = source.indexOf("session.transferUserInfo(message)");
    const resolveIndex = source.indexOf("resolve(nil)", transferIndex);

    expect(source).toContain("watch_connectivity_unavailable");
    expect(notReadyIndex).toBeGreaterThan(-1);
    expect(transferIndex).toBeGreaterThan(-1);
    expect(resolveIndex).toBeGreaterThan(-1);
    expect(notReadyIndex).toBeLessThan(transferIndex);
    expect(transferIndex).toBeLessThan(resolveIndex);
  });

  it("keeps legacy v1 Watch runtime code out of Watch-owned v2 log import", () => {
    const source = readSource("src/native/watch/watchRuntimePersistence.ts");

    expect(source).toContain("importWatchOwnedRuntimeDataToLocalRecords");
    expect(source).not.toContain(`${legacyWatchStartSession}(`);
    expect(source).not.toContain(legacyNativeWatchPlanBuilder);
  });

  it("does not keep the legacy phone-owned Watch native protocol in the v2 runtime path", () => {
    const nativeSources = [
      "ios/LucidCue/LucidCueWatchRuntime.swift",
      "ios/LucidCue/LucidCueWatchRuntimeBridge.m",
      "ios/LucidCue Watch App/WatchSessionManager.swift",
    ].map(readSource).join("\n");

    expect(nativeSources).not.toContain(legacyWatchCommandV1);
    expect(nativeSources).not.toContain("watch-status-v1");
    expect(nativeSources).not.toContain("watch-status-ack-v1");
    expect(nativeSources).not.toContain("watch-epoch-v1");
    expect(nativeSources).not.toContain(legacyWatchStartSession);
    expect(nativeSources).not.toContain("getWatchRuntimeStatus");
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
    expect(project).toContain("final_lucid_training.mp3");
    expect(watchResourcesPhase).toContain("mallela_rf_v1.json in Resources");
    expect(watchResourcesPhase).toContain("clear_bell_chime.mp3 in Resources");
    expect(watchResourcesPhase).toContain("final_lucid_training.mp3 in Resources");
  });
});
