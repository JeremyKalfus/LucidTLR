import type { LocalDb } from "@/src/data/local/localDb";
import type { CueDecisionSettings } from "@/src/engine";
import type { TlrOptions } from "@/src/domain/types";
import { importWatchPackage } from "@/src/features/watchHistory/importWatchPackage";
import type { WatchPackageImportResult } from "@/src/features/watchHistory/watchPackageImportTypes";
import {
  computeWatchStartupRecoveryState,
  createDraftWatchSessionSyncState,
  findUnresolvedConflictingActiveWatchSyncState,
  loadUnresolvedWatchSessionSyncStates,
  loadWatchSessionSyncStateBySessionId,
  markWatchSessionPlanBuilt,
  markWatchSessionPlanStaged,
  saveWatchSessionSyncState,
  applyAckRecorded,
  applyPhoneImportSuccess,
  applyWatchCommitReceipt,
  applyWatchRunningStatus,
  applyWatchSealedManifest,
  type WatchSessionSyncState,
} from "@/src/features/watchSync/watchSessionSyncState";
import {
  buildSyntheticWatchModeLabPlan,
  summarizeWatchModeLabPlan,
  type WatchModeLabKind,
  type WatchModeLabPackageImportSummary,
  type WatchModeLabPlanSummary,
  type WatchModeLabRecoverySummary,
} from "@/src/features/watchModeLab/watchModeLab";
import {
  buildPackageAckTransportMessage,
  buildPlanAvailableTransportMessage,
  buildPlanRequestTransportMessage,
  watchTransport,
  type NativeWatchTransportStatus,
} from "@/src/native/watchTransport";

export interface WatchModeLabTransportSummary {
  status: NativeWatchTransportStatus;
  recovery: WatchModeLabRecoverySummary;
}

export interface WatchModeLabTransportPlanStageSummary {
  plan: WatchModeLabPlanSummary;
  status: NativeWatchTransportStatus;
  recovery: WatchModeLabRecoverySummary;
}

export interface WatchModeLabTransportImportSummary {
  importSummary: WatchModeLabPackageImportSummary;
  status: NativeWatchTransportStatus;
  recovery: WatchModeLabRecoverySummary;
}

export interface WatchModeLabTransportAckSummary {
  message: string;
  status: NativeWatchTransportStatus;
  recovery: WatchModeLabRecoverySummary;
}

function summarizeRecovery(
  states: WatchSessionSyncState[],
): WatchModeLabRecoverySummary {
  const recovery = computeWatchStartupRecoveryState(states);

  return {
    startupRecovery: recovery.kind,
    blocksFutureWatchStart: recovery.blocksFutureWatchStart,
    unresolvedCount: states.length,
    message: recovery.message,
    states: states.map((state) => ({
      sessionId: state.sessionId,
      planHash: state.planHash,
      packageId: state.packageId,
      packageHash: state.packageHash,
      status: state.status,
      lastKnownWatchState: state.lastKnownWatchState,
      updatedAt: state.updatedAt,
      unresolvedReason: state.unresolvedReason,
      metadataJson: JSON.stringify(state.metadata),
    })),
  };
}

async function loadRecovery(input: {
  db: LocalDb;
  participantId: string;
}): Promise<WatchModeLabRecoverySummary> {
  return summarizeRecovery(
    await loadUnresolvedWatchSessionSyncStates({
      db: input.db,
      participantId: input.participantId,
    }),
  );
}

export async function loadWatchModeLabTransportSummary(input: {
  db: LocalDb;
  participantId: string;
}): Promise<WatchModeLabTransportSummary> {
  const [status, recovery] = await Promise.all([
    watchTransport.getTransportStatus(),
    loadRecovery(input),
  ]);

  return { status, recovery };
}

export async function activateWatchModeLabTransport(input: {
  db: LocalDb;
  participantId: string;
}): Promise<WatchModeLabTransportSummary> {
  const status = await watchTransport.activateTransport();
  const recovery = await loadRecovery(input);

  return { status, recovery };
}

export async function stageSyntheticWatchModeTransportPlan(input: {
  db: LocalDb;
  kind: WatchModeLabKind;
  participantId: string;
  selectedCueId: string;
  tlrOptions: Pick<TlrOptions, "watchAudioCueEnabled" | "skipGuidedTraining">;
  engineSettings: Pick<
    CueDecisionSettings,
    | "cueStartDelayHoursAfterTraining"
    | "minimumSecondsSinceLastCue"
    | "userInteractionSuppressionSeconds"
    | "stableLowMovementRequiredSeconds"
    | "cueAssociatedMovementWindowSeconds"
    | "cueAssociatedMovementPauseSeconds"
    | "remThreshold"
    | "minimumWatchSleepProbability"
    | "maxCuesPerNight"
    | "typicalSleepDurationHours"
  >;
  createdAt?: string;
}): Promise<WatchModeLabTransportPlanStageSummary> {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const plan = buildSyntheticWatchModeLabPlan({
    kind: input.kind,
    participantId: input.participantId,
    selectedCueId: input.selectedCueId,
    tlrOptions: input.tlrOptions,
    engineSettings: input.engineSettings,
    createdAt,
  });
  const unresolved = await loadUnresolvedWatchSessionSyncStates({
    db: input.db,
    participantId: input.participantId,
  });
  const blocker = findUnresolvedConflictingActiveWatchSyncState(
    unresolved,
    plan.sessionId,
  );

  if (blocker) {
    throw new Error(
      `Synthetic transport plan staging is blocked by unresolved Watch sync state ${blocker.sessionId} (${blocker.status}). Use the explicit local-only abandon/discard lab action before staging a different session.`,
    );
  }

  const built = await markWatchSessionPlanBuilt({
    db: input.db,
    sessionId: plan.sessionId,
    participantId: input.participantId,
    planId: "watch-mode-transport-lab-plan-v3",
    planHash: plan.planHash,
    builtAt: createdAt,
    metadata: {
      syntheticLab: true,
      transportLab: true,
      source: "phone_watch_transport_lab",
    },
  });
  const staged = await markWatchSessionPlanStaged({
    db: input.db,
    state: built,
    stagedAt: createdAt,
  });
  const status = await watchTransport.stageSyntheticPlan(
    buildPlanAvailableTransportMessage({ plan, createdAt }),
  );

  await saveWatchSessionSyncState({
    db: input.db,
    state: {
      ...staged,
      metadata: {
        ...staged.metadata,
        transportMessageQueuedAt: createdAt,
      },
    },
  });

  return {
    plan: summarizeWatchModeLabPlan(plan),
    status,
    recovery: await loadRecovery(input),
  };
}

export async function requestWatchModeLabTransportStatus(input: {
  db: LocalDb;
  participantId: string;
}): Promise<WatchModeLabTransportSummary> {
  const unresolved = await loadUnresolvedWatchSessionSyncStates({
    db: input.db,
    participantId: input.participantId,
  });
  const state = unresolved[0] ?? null;
  const createdAt = new Date().toISOString();
  const status = await watchTransport.requestWatchStatus(
    buildPlanRequestTransportMessage({
      createdAt,
      sessionId: state?.sessionId,
      planHash: state?.planHash,
      sender: "phone",
    }),
  );

  return {
    status,
    recovery: summarizeRecovery(unresolved),
  };
}

export async function importLatestReceivedSyntheticWatchPackage(input: {
  db: LocalDb;
  participantId: string;
  importedAt?: string;
}): Promise<WatchModeLabTransportImportSummary> {
  const importedAt = input.importedAt ?? new Date().toISOString();
  const sealedPackage = await watchTransport.getLatestReceivedSyntheticPackage();

  if (!sealedPackage) {
    throw new Error("No received synthetic Watch package file is available.");
  }

  const result = await importWatchPackage({
    db: input.db,
    sealedPackage,
    importedAt,
  });

  await markTransportPackageImportedInLedger({
    db: input.db,
    participantId: input.participantId,
    result,
    planHash: sealedPackage.manifest.planHash,
    importedAt,
  });

  return {
    importSummary: {
      status: result.status,
      ackEligible: result.ackEligible,
      packageId: result.packageId,
      packageHash: result.packageHash,
      sessionId: result.sessionId,
      counts: result.counts,
    },
    status: await watchTransport.getTransportStatus(),
    recovery: await loadRecovery(input),
  };
}

export async function sendAckForLatestImportedWatchPackage(input: {
  db: LocalDb;
  participantId: string;
  ackedAt?: string;
}): Promise<WatchModeLabTransportAckSummary> {
  const ackedAt = input.ackedAt ?? new Date().toISOString();
  const unresolved = await loadUnresolvedWatchSessionSyncStates({
    db: input.db,
    participantId: input.participantId,
  });
  const state = unresolved.find(
    (candidate) => candidate.status === "phone_imported_ack_eligible",
  );

  if (!state?.packageId || !state.packageHash) {
    throw new Error(
      "No ack-eligible imported Watch package exists. Import must commit transactionally before ack can be sent.",
    );
  }

  const status = await watchTransport.sendAckForImportedPackage(
    buildPackageAckTransportMessage({
      sessionId: state.sessionId,
      planHash: state.planHash,
      packageId: state.packageId,
      packageHash: state.packageHash,
      ackedAt,
    }),
  );
  const ackRecorded = applyAckRecorded(state, {
    packageId: state.packageId,
    packageHash: state.packageHash,
    ackRecordedAt: ackedAt,
  });

  await saveWatchSessionSyncState({
    db: input.db,
    state: {
      ...ackRecorded,
      metadata: {
        ...ackRecorded.metadata,
        transportAckQueuedAt: ackedAt,
      },
    },
  });

  return {
    message: "Queued matching synthetic package ack after transactional import success.",
    status,
    recovery: await loadRecovery(input),
  };
}

export async function clearWatchModeLabTransportStatus(input: {
  db: LocalDb;
  participantId: string;
}): Promise<WatchModeLabTransportSummary> {
  const status = await watchTransport.clearLabTransportStatus();
  const recovery = await loadRecovery(input);

  return { status, recovery };
}

export async function applyWatchTransportReceiptSnapshots(input: {
  db: LocalDb;
  participantId: string;
}): Promise<WatchModeLabTransportSummary> {
  const status = await watchTransport.getTransportStatus();
  let state = status.latestCommitReceipt?.sessionId
    ? await loadWatchSessionSyncStateBySessionId({
        db: input.db,
        sessionId: status.latestCommitReceipt.sessionId,
      })
    : null;

  if (state && status.latestCommitReceipt) {
    state = applyWatchCommitReceipt(state, {
      sessionId: status.latestCommitReceipt.sessionId,
      planHash: status.latestCommitReceipt.planHash,
      committedAt: status.latestCommitReceipt.committedAt ?? new Date().toISOString(),
      commitId: status.latestCommitReceipt.commitId,
      watchState: status.latestCommitReceipt.watchState,
    });
  }

  if (state && status.latestStatusSnapshot?.watchState) {
    state = applyWatchRunningStatus(state, {
      sessionId: state.sessionId,
      planHash: state.planHash,
      watchState: status.latestStatusSnapshot.watchState,
      reportedAt: status.latestStatusSnapshot.createdAt ?? new Date().toISOString(),
    });
  }

  if (state && status.latestPackageManifest) {
    state = applyWatchSealedManifest(state, {
      sessionId: status.latestPackageManifest.sessionId,
      planHash: status.latestPackageManifest.planHash,
      packageId: status.latestPackageManifest.packageId,
      packageHash: status.latestPackageManifest.packageHash,
      sealedAt: status.latestPackageManifest.receivedAt ?? new Date().toISOString(),
    });
  }

  if (state) {
    await saveWatchSessionSyncState({ db: input.db, state });
  }

  return {
    status,
    recovery: await loadRecovery(input),
  };
}

async function markTransportPackageImportedInLedger(input: {
  db: LocalDb;
  participantId: string;
  result: WatchPackageImportResult;
  planHash: string;
  importedAt: string;
}): Promise<void> {
  const existing = await loadWatchSessionSyncStateBySessionId({
    db: input.db,
    sessionId: input.result.sessionId,
  });
  const base =
    existing ??
    createDraftWatchSessionSyncState({
      sessionId: input.result.sessionId,
      participantId: input.participantId,
      planId: "watch-mode-transport-lab-plan-v3",
      planHash: input.planHash,
      createdAt: input.importedAt,
      metadata: {
        syntheticLab: true,
        transportLab: true,
        source: "phone_watch_transport_lab_import",
      },
    });
  const sealed = applyWatchSealedManifest(base, {
    sessionId: input.result.sessionId,
    planHash: input.planHash,
    packageId: input.result.packageId,
    packageHash: input.result.packageHash,
    sealedAt: input.importedAt,
  });
  const imported = applyPhoneImportSuccess(sealed, {
    packageId: input.result.packageId,
    packageHash: input.result.packageHash,
    importedAt: input.importedAt,
  });

  await saveWatchSessionSyncState({ db: input.db, state: imported });
}
