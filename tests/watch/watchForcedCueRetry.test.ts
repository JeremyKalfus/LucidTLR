import { describe, expect, it } from "vitest";

declare const require: (moduleName: string) => any;

const { readFileSync } = require("fs");
const path = require("path");
const repoRoot = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

type ForcedCueEpoch = {
  readonly shouldAttemptCue: boolean;
  readonly reason: string;
};

function runForcedCueRetryFixture(epochs: readonly ForcedCueEpoch[]) {
  let forcedCueResolved = false;

  return epochs.map((epoch) => {
    const forcedCueDue = !forcedCueResolved;

    if (forcedCueDue && epoch.shouldAttemptCue) {
      forcedCueResolved = true;
    }

    return {
      forcedCueDue,
      reason: epoch.reason,
      forcedCueResolved,
    };
  });
}

describe("Watch forced-cue retry", () => {
  it("does not consume a forced cue when movement suppression blocks the due epoch", () => {
    const retry = runForcedCueRetryFixture([
      { shouldAttemptCue: false, reason: "movement_gate_active" },
      { shouldAttemptCue: true, reason: "forced_cue_due" },
    ]);

    expect(retry).toEqual([
      {
        forcedCueDue: true,
        reason: "movement_gate_active",
        forcedCueResolved: false,
      },
      {
        forcedCueDue: true,
        reason: "forced_cue_due",
        forcedCueResolved: true,
      },
    ]);
  });

  it("marks the Swift forced cue resolved only after a cue attempt is allowed", () => {
    const coordinator = readSource(
      "ios/LucidTLR Watch App/Runtime/WatchSessionCoordinator.swift",
    );
    const attemptBranchIndex = coordinator.indexOf("if decision.shouldAttemptCue {");
    const elseBranchIndex = coordinator.indexOf("} else {", attemptBranchIndex);
    const resolvedIndex = coordinator.indexOf("forcedCueResolved = true");

    expect(attemptBranchIndex).toBeGreaterThanOrEqual(0);
    expect(elseBranchIndex).toBeGreaterThan(attemptBranchIndex);
    expect(resolvedIndex).toBeGreaterThan(attemptBranchIndex);
    expect(resolvedIndex).toBeLessThan(elseBranchIndex);
    expect(coordinator).not.toContain("if forcedCueDue {\n      forcedCueResolved = true\n    }\n\n    let epochEvent");
  });
});
