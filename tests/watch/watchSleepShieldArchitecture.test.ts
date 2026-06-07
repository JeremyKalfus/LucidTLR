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

const sleepShieldSwiftFiles = [
  "ios/LucidTLR Watch App/SleepShieldView.swift",
  "ios/LucidTLR Watch App/SleepShieldViewModel.swift",
  "ios/LucidTLR Watch App/DimRuntimeControlsView.swift",
  "ios/LucidTLR Watch App/WatchModeBedtimeInstructionsView.swift",
];

describe("Watch Mode v3 sleep shield architecture", () => {
  it("adds Sleep Shield Swift files to the Watch target", () => {
    const project = readSource("ios/LucidTLR.xcodeproj/project.pbxproj");

    for (const file of sleepShieldSwiftFiles) {
      const fileName = path.basename(file);

      expect(fileExists(file)).toBe(true);
      expect(project).toContain(`${fileName} in Sources`);
    }
  });

  it("keeps the sleep shield free of real runtime provider frameworks", () => {
    const forbidden = [
      "import HealthKit",
      "import CoreMotion",
      "import WatchConnectivity",
      "import AVFoundation",
      "HKWorkoutSession",
      "WKInterfaceDevice.play",
    ];
    const combined = sleepShieldSwiftFiles.map(readSource).join("\n");

    for (const token of forbidden) {
      expect(combined).not.toContain(token);
    }
  });

  it("keeps the hidden overnight state black and tap-revealed", () => {
    const shield = readSource("ios/LucidTLR Watch App/SleepShieldView.swift");
    const controls = readSource("ios/LucidTLR Watch App/DimRuntimeControlsView.swift");

    expect(shield).toContain("Color.black.ignoresSafeArea()");
    expect(shield).toContain("onTapGesture");
    expect(shield).toContain("revealControls()");
    expect(shield).toContain("controlsVisible");
    expect(shield).not.toContain("TimelineView");
    expect(shield).not.toContain("ProgressView");
    expect(controls).not.toContain("ProgressView");
  });

  it("auto-hides controls after a short reveal window", () => {
    const viewModel = readSource("ios/LucidTLR Watch App/SleepShieldViewModel.swift");

    expect(viewModel).toContain("autoHideSeconds");
    expect(viewModel).toContain("scheduleAutoHide()");
    expect(viewModel).toContain("DispatchWorkItem");
    expect(viewModel).toContain("controlsVisible = false");
  });

  it("requires two-step wake confirmation", () => {
    const viewModel = readSource("ios/LucidTLR Watch App/SleepShieldViewModel.swift");
    const controls = readSource("ios/LucidTLR Watch App/DimRuntimeControlsView.swift");

    expect(viewModel).toContain("requestWake()");
    expect(viewModel).toContain("confirmWake()");
    expect(viewModel).toContain("wakeConfirmationVisible");
    expect(controls).toContain("Wake");
    expect(controls).toContain("Confirm Wake");
    expect(controls).toContain("requires confirmation");
  });

  it("logs user interactions into the synthetic coordinator path", () => {
    const viewModel = readSource("ios/LucidTLR Watch App/SleepShieldViewModel.swift");
    const coordinator = readSource(
      "ios/LucidTLR Watch App/Runtime/WatchSessionCoordinator.swift",
    );

    expect(viewModel).toContain("coordinator.recordUserInteraction(kind: $0)");
    expect(viewModel).toContain("watch_user_interaction");
    expect(viewModel).toContain("watch_push_back_30m");
    expect(viewModel).toContain("watch_wake_confirmed");
    expect(coordinator).toContain("func recordUserInteraction");
    expect(coordinator).toContain(".userInteractionLogged");
  });

  it("includes local-only synthetic push-back and pause/resume controls", () => {
    const viewModel = readSource("ios/LucidTLR Watch App/SleepShieldViewModel.swift");
    const coordinator = readSource(
      "ios/LucidTLR Watch App/Runtime/WatchSessionCoordinator.swift",
    );

    expect(viewModel).toContain("coordinator.deferTlrInterval(by: 30 * 60)");
    expect(viewModel).toContain("coordinator.pauseTlr()");
    expect(viewModel).toContain("coordinator.resumeTlr()");
    expect(coordinator).toContain("func deferTlrInterval");
    expect(coordinator).toContain("func pauseTlr");
    expect(coordinator).toContain("func resumeTlr");
  });

  it("keeps bedtime instructions honest about Theater Mode and Low Power Mode", () => {
    const instructions = readSource(
      "ios/LucidTLR Watch App/WatchModeBedtimeInstructionsView.swift",
    );
    const future = readSource("docs/future/watch-mode-implementation-watch-owned-v3.md");

    expect(instructions).toContain("Turn on Theater Mode.");
    expect(instructions).toContain("Keep Low Power Mode off.");
    expect(instructions).toContain("Start with Watch charged.");
    expect(instructions).toContain("The screen will stay black during the night.");
    expect(instructions).toContain("Tap the screen to reveal controls.");
    expect(instructions).toContain("Haptic cueing is the default.");
    expect(future).toContain("must not attempt to programmatically toggle Theater Mode");
  });

  it("keeps public Watch Mode disabled and public phone screens disconnected", () => {
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
    expect(phoneScreens).not.toContain("SleepShieldView");
  });
});
