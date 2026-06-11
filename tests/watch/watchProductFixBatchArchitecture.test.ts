import { describe, expect, it } from "vitest";

declare const require: (moduleName: string) => any;

const { readFileSync } = require("fs");
const path = require("path");
const repoRoot = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function sliceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);

  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);

  return source.slice(startIndex, endIndex);
}

describe("Build 23 product Watch Mode fix batch guardrails", () => {
  it("rolls back a product start index commit when the real runtime never starts", () => {
    const controller = readSource(
      "ios/LucidTLR Watch App/WatchNightSessionController.swift",
    );
    const index = readSource(
      "ios/LucidTLR Watch App/Storage/WatchCurrentSessionIndex.swift",
    );
    const startPath = sliceBetween(
      controller,
      "private func startDeviceRealProviderSession",
      "private func makeRealCoordinator",
    );

    expect(startPath).toContain("var didCommitIndexEntry = false");
    expect(startPath).toContain("var runtimeStarted = false");
    expect(startPath).toContain("didCommitIndexEntry = true");
    expect(startPath).toContain("runtimeStarted = true");
    expect(startPath).toContain("if didCommitIndexEntry && !runtimeStarted");
    expect(startPath).toContain("discardUnstartedSession");
    expect(index).toContain("func discardUnstartedSession");
    expect(index).toContain("sealedPackageId == nil");
  });

  it("keeps refreshProductSurface out of the interrupted branch while a start is in flight", () => {
    const controller = readSource(
      "ios/LucidTLR Watch App/WatchNightSessionController.swift",
    );
    const refreshPath = sliceBetween(
      controller,
      "func refreshProductSurface()",
      "func startProductSession",
    );

    expect(controller).toContain("@Published private(set) var isStartingSession");
    expect(refreshPath.indexOf("if isStartingSession")).toBeLessThan(
      refreshPath.indexOf("entry.isActiveUnacked"),
    );
  });

  it("publishes and renders the last product start failure reason", () => {
    const controller = readSource(
      "ios/LucidTLR Watch App/WatchNightSessionController.swift",
    );
    const productView = readSource(
      "ios/LucidTLR Watch App/WatchModeProductView.swift",
    );

    expect(controller).toContain("WatchNightSessionStartFailure");
    expect(controller).toContain("@Published private(set) var lastStartFailure");
    expect(controller).toContain("startFailureReason");
    expect(controller).toContain("Preflight blocked:");
    expect(productView).toContain("controller.lastStartFailure");
    expect(productView).toContain("Last start failure");
  });

  it("bundle-checks only Watch-owned assets during real preflight", () => {
    const preflight = readSource(
      "ios/LucidTLR Watch App/Runtime/RealWatchRuntimePreflightProvider.swift",
    );
    const planMirror = readSource(
      "ios/LucidTLR Watch App/Runtime/WatchRuntimePlanV3.swift",
    );

    expect(preflight).toContain('plan.assets.filter { $0.owner == "watch" }');
    expect(preflight.indexOf('owner == "watch"')).toBeLessThan(
      preflight.indexOf("bundle.url("),
    );
    expect(planMirror).toContain("let owner: String");
    expect(planMirror).toContain('owner == "phone"');
  });

  it("records product acks against the product root before falling back to the lab root", () => {
    const coordinator = readSource(
      "ios/LucidTLR Watch App/Connectivity/WatchTransportCoordinator.swift",
    );
    const ackPath = sliceBetween(
      coordinator,
      "private func handleIncomingAck",
      "// MARK: - Staged plan",
    );

    expect(ackPath).toContain("ackRecordingRootDirectories");
    expect(ackPath.indexOf("productRootDirectory()")).toBeLessThan(
      ackPath.indexOf("labRootDirectory()"),
    );
    expect(ackPath).toContain("recordLatestAckIfMatches(rootDirectory: rootDirectory)");
    expect(coordinator).toContain("WatchModeNightSessions");
    expect(coordinator).toContain("WatchModeLabSynthetic");
  });

  it("keeps watch product starts out of the phone cue engine state", () => {
    const productFlow = readSource("src/features/watchMode/watchModeProductFlow.ts");

    expect(productFlow).toContain("prevents the phone cue engine from arming");
    expect(productFlow).not.toContain("applySessionEvent(baseSession");
    expect(productFlow).not.toContain("\"start_watch_night\"");
  });

  it("keeps the low-battery warning branch reachable above the hard start minimum", () => {
    const planBuilder = readSource("src/native/watchRuntime/buildWatchRuntimePlan.ts");
    const swiftPlanFixtures = [
      "ios/LucidTLR Watch App/Runtime/WatchSyntheticRuntimeFixtures.swift",
      "ios/LucidTLR Watch App/WatchNightSessionController.swift",
      "ios/LucidTLR Watch App/WatchModeLabViewModel.swift",
    ].map(readSource).join("\n");
    const preflight = readSource(
      "ios/LucidTLR Watch App/Runtime/WatchRuntimePreflight.swift",
    );

    expect(planBuilder).toContain("minimumStartBatteryLevel: 0.35");
    expect(planBuilder).toContain("lowBatteryWarningLevel: 0.5");
    expect(swiftPlanFixtures).toContain("minimumStartBatteryLevel: 0.35");
    expect(swiftPlanFixtures).toContain("lowBatteryWarningLevel: 0.5");
    expect(preflight).toContain("batteryLevel < plan.safety.minimumStartBatteryLevel");
    expect(preflight).toContain("batteryLevel <= plan.safety.lowBatteryWarningLevel");
  });
});
