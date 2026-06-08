import { describe, expect, it } from "vitest";

import {
  applyAckRecorded,
  applyPhoneImportSuccess,
  applyPlanBuilt,
  applyPlanStaged,
  applyUserAbandonLocalOnly,
  applyWatchCommitReceipt,
  applyWatchRunningStatus,
  applyWatchSealedManifest,
  assertNoUnresolvedWatchSyncStateForFutureStart,
  computeWatchStartupRecoveryState,
  createDraftWatchSessionSyncState,
  findUnresolvedConflictingActiveWatchSyncState,
  type WatchSessionSyncState,
} from "@/src/features/watchSync/watchSessionSyncState";

const SESSION_ID = "watch-session-1";
const PLAN_HASH = "plan-hash-1";
const PACKAGE_ID = "watch-package-1";
const PACKAGE_HASH = "package-hash-1";
const NOW = "2026-06-07T12:00:00.000Z";

function baseState(overrides: Partial<WatchSessionSyncState> = {}) {
  return {
    ...createDraftWatchSessionSyncState({
      sessionId: SESSION_ID,
      participantId: "participant-1",
      planId: "plan-1",
      planHash: PLAN_HASH,
      createdAt: NOW,
      metadata: { syntheticLab: true },
    }),
    ...overrides,
  };
}

function stagedState() {
  return applyPlanStaged(
    applyPlanBuilt(baseState(), { builtAt: NOW }),
    { stagedAt: NOW },
  );
}

function sealedState() {
  return applyWatchSealedManifest(
    applyWatchRunningStatus(
      applyWatchCommitReceipt(stagedState(), {
        sessionId: SESSION_ID,
        planHash: PLAN_HASH,
        committedAt: NOW,
        commitId: "commit-1",
      }),
      {
        sessionId: SESSION_ID,
        planHash: PLAN_HASH,
        watchState: "running",
        reportedAt: NOW,
        startedAt: NOW,
      },
    ),
    {
      sessionId: SESSION_ID,
      planHash: PLAN_HASH,
      packageId: PACKAGE_ID,
      packageHash: PACKAGE_HASH,
      sealedAt: NOW,
    },
  );
}

describe("Watch session sync state machine", () => {
  it("blocks future Watch start when unresolved sync state exists", () => {
    const unresolved = stagedState();

    expect(findUnresolvedConflictingActiveWatchSyncState([unresolved])).toBe(
      unresolved,
    );
    expect(() =>
      assertNoUnresolvedWatchSyncStateForFutureStart([unresolved]),
    ).toThrow("blocked by unresolved Watch sync state");
  });

  it("allows a matching active lab session but blocks conflicting active state", () => {
    const unresolved = stagedState();

    expect(
      findUnresolvedConflictingActiveWatchSyncState([unresolved], SESSION_ID),
    ).toBeNull();
    expect(
      findUnresolvedConflictingActiveWatchSyncState(
        [unresolved],
        "watch-session-2",
      )?.sessionId,
    ).toBe(SESSION_ID);
  });

  it("models phone reload recovery for running and sealed Watch states", () => {
    const running = applyWatchRunningStatus(
      applyWatchCommitReceipt(stagedState(), {
        sessionId: SESSION_ID,
        planHash: PLAN_HASH,
        committedAt: NOW,
      }),
      {
        sessionId: SESSION_ID,
        planHash: PLAN_HASH,
        watchState: "running",
        reportedAt: NOW,
      },
    );

    expect(computeWatchStartupRecoveryState([running])).toMatchObject({
      kind: "unresolved_recover_state",
      blocksFutureWatchStart: true,
    });

    expect(computeWatchStartupRecoveryState([sealedState()])).toMatchObject({
      kind: "import_prompt_recover_package_state",
      blocksFutureWatchStart: true,
    });
  });

  it("applies duplicate Watch commit receipts idempotently", () => {
    const committed = applyWatchCommitReceipt(stagedState(), {
      sessionId: SESSION_ID,
      planHash: PLAN_HASH,
      committedAt: NOW,
      commitId: "commit-1",
    });
    const duplicate = applyWatchCommitReceipt(committed, {
      sessionId: SESSION_ID,
      planHash: PLAN_HASH,
      committedAt: NOW,
      commitId: "commit-1",
    });

    expect(duplicate).toEqual(committed);
  });

  it("does not regress imported state when a duplicate commit receipt arrives later", () => {
    const imported = applyPhoneImportSuccess(sealedState(), {
      packageId: PACKAGE_ID,
      packageHash: PACKAGE_HASH,
      importedAt: "2026-06-07T12:02:00.000Z",
    });
    const afterDuplicateCommit = applyWatchCommitReceipt(imported, {
      sessionId: SESSION_ID,
      planHash: PLAN_HASH,
      committedAt: "2026-06-07T12:03:00.000Z",
      commitId: "commit-1",
    });

    expect(afterDuplicateCommit).toEqual(imported);
    expect(afterDuplicateCommit.status).toBe("phone_imported_ack_eligible");
  });

  it("does not regress ack-recorded state when a duplicate commit receipt arrives later", () => {
    const ackRecorded = applyAckRecorded(
      applyPhoneImportSuccess(sealedState(), {
        packageId: PACKAGE_ID,
        packageHash: PACKAGE_HASH,
        importedAt: "2026-06-07T12:02:00.000Z",
      }),
      {
        packageId: PACKAGE_ID,
        packageHash: PACKAGE_HASH,
        ackRecordedAt: "2026-06-07T12:03:00.000Z",
      },
    );
    const afterDuplicateCommit = applyWatchCommitReceipt(ackRecorded, {
      sessionId: SESSION_ID,
      planHash: PLAN_HASH,
      committedAt: "2026-06-07T12:04:00.000Z",
      commitId: "commit-1",
    });

    expect(afterDuplicateCommit).toEqual(ackRecorded);
    expect(afterDuplicateCommit.status).toBe("ack_recorded");
  });

  it("accepts sealed manifest before running status without losing package identity", () => {
    const sealedBeforeRunning = applyWatchSealedManifest(stagedState(), {
      sessionId: SESSION_ID,
      planHash: PLAN_HASH,
      packageId: PACKAGE_ID,
      packageHash: PACKAGE_HASH,
      sealedAt: NOW,
    });
    const runningAfterSeal = applyWatchRunningStatus(sealedBeforeRunning, {
      sessionId: SESSION_ID,
      planHash: PLAN_HASH,
      watchState: "running",
      reportedAt: "2026-06-07T12:01:00.000Z",
    });

    expect(runningAfterSeal).toMatchObject({
      status: "watch_sealed_waiting_import",
      packageId: PACKAGE_ID,
      packageHash: PACKAGE_HASH,
    });
  });

  it("does not regress imported state when a running status arrives later", () => {
    const imported = applyPhoneImportSuccess(sealedState(), {
      packageId: PACKAGE_ID,
      packageHash: PACKAGE_HASH,
      importedAt: "2026-06-07T12:02:00.000Z",
    });
    const afterRunningStatus = applyWatchRunningStatus(imported, {
      sessionId: SESSION_ID,
      planHash: PLAN_HASH,
      watchState: "running",
      reportedAt: "2026-06-07T12:03:00.000Z",
    });

    expect(afterRunningStatus).toEqual(imported);
    expect(afterRunningStatus.status).toBe("phone_imported_ack_eligible");
  });

  it("keeps sealed manifest idempotent after phone import while rejecting package mismatch", () => {
    const imported = applyPhoneImportSuccess(sealedState(), {
      packageId: PACKAGE_ID,
      packageHash: PACKAGE_HASH,
      importedAt: "2026-06-07T12:02:00.000Z",
    });
    const duplicateSeal = applyWatchSealedManifest(imported, {
      sessionId: SESSION_ID,
      planHash: PLAN_HASH,
      packageId: PACKAGE_ID,
      packageHash: PACKAGE_HASH,
      sealedAt: "2026-06-07T12:03:00.000Z",
    });

    expect(duplicateSeal).toEqual(imported);
    expect(duplicateSeal.status).toBe("phone_imported_ack_eligible");
    expect(() =>
      applyWatchSealedManifest(imported, {
        sessionId: SESSION_ID,
        planHash: PLAN_HASH,
        packageId: PACKAGE_ID,
        packageHash: "wrong-package-hash",
        sealedAt: "2026-06-07T12:03:00.000Z",
      }),
    ).toThrow("already has package");
  });

  it("rejects stale or mismatched plan hashes", () => {
    expect(() =>
      applyWatchCommitReceipt(stagedState(), {
        sessionId: SESSION_ID,
        planHash: "stale-plan-hash",
        committedAt: NOW,
      }),
    ).toThrow("planHash mismatch");
  });

  it("marks import success ack-eligible but not ack-sent", () => {
    const imported = applyPhoneImportSuccess(sealedState(), {
      packageId: PACKAGE_ID,
      packageHash: PACKAGE_HASH,
      importedAt: NOW,
    });

    expect(imported.status).toBe("phone_imported_ack_eligible");
    expect(imported.ackEligibleAt).toBe(NOW);
    expect(imported.ackSentAt).toBeUndefined();
    expect(computeWatchStartupRecoveryState([imported])).toMatchObject({
      kind: "pending_ack_state",
    });
  });

  it("records ack only when package identity matches", () => {
    const imported = applyPhoneImportSuccess(sealedState(), {
      packageId: PACKAGE_ID,
      packageHash: PACKAGE_HASH,
      importedAt: NOW,
    });

    expect(() =>
      applyAckRecorded(imported, {
        packageId: PACKAGE_ID,
        packageHash: "wrong-package-hash",
        ackRecordedAt: NOW,
      }),
    ).toThrow("Watch sync package mismatch");

    expect(
      applyAckRecorded(imported, {
        packageId: PACKAGE_ID,
        packageHash: PACKAGE_HASH,
        ackRecordedAt: NOW,
      }),
    ).toMatchObject({
      status: "ack_recorded",
      lastKnownWatchState: "ack_recorded",
      ackSentAt: NOW,
    });
  });

  it("clears unresolved recovery after final ack is recorded", () => {
    const imported = applyPhoneImportSuccess(sealedState(), {
      packageId: PACKAGE_ID,
      packageHash: PACKAGE_HASH,
      importedAt: "2026-06-07T12:02:00.000Z",
    });
    const ackRecorded = applyAckRecorded(imported, {
      packageId: PACKAGE_ID,
      packageHash: PACKAGE_HASH,
      ackRecordedAt: "2026-06-07T12:03:00.000Z",
    });

    expect(computeWatchStartupRecoveryState([ackRecorded])).toMatchObject({
      kind: "normal_placeholder",
      blocksFutureWatchStart: false,
    });
  });

  it("requires explicit local-only abandon and records metadata", () => {
    expect(() =>
      applyUserAbandonLocalOnly(stagedState(), {
        abandonedAt: NOW,
        reason: "lab_cleanup",
        explicit: false,
      }),
    ).toThrow("requires an explicit action");

    expect(
      applyUserAbandonLocalOnly(stagedState(), {
        abandonedAt: NOW,
        reason: "lab_cleanup",
        explicit: true,
      }),
    ).toMatchObject({
      status: "abandoned_local_only",
      metadata: {
        syntheticLab: true,
        abandonedLocalOnly: true,
        abandonedReason: "lab_cleanup",
      },
    });
  });
});
