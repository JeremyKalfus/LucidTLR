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
import {
  appendWatchModeLabDebugEvent,
  appendWatchModeLabStateTransition,
  appendWatchModeLabTransportMessage,
  appendWatchModeLabTransportStatusSnapshot,
} from "@/src/features/watchModeLab/watchModeLabDebugEvents";

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

interface TransportLabPackageIdentity {
  sessionId: string;
  planHash: string;
  packageId: string;
  packageHash: string;
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
  const status = await watchTransport.getTransportStatus();

  await appendWatchModeLabTransportStatusSnapshot({
    db: input.db,
    status,
  });

  return applyWatchTransportReceiptSnapshotsFromStatus({
    db: input.db,
    participantId: input.participantId,
    status,
  });
}

export async function activateWatchModeLabTransport(input: {
  db: LocalDb;
  participantId: string;
}): Promise<WatchModeLabTransportSummary> {
  const status = await watchTransport.activateTransport();

  await appendWatchModeLabDebugEvent({
    db: input.db,
    source: "transport",
    eventType: "transport_activated",
    success: status.available,
    errorMessage: status.lastError,
    metadata: {
      activationState: status.activationState,
      paired: status.paired,
      watchAppInstalled: status.watchAppInstalled,
      reachable: status.reachable,
      isReachableInformationalOnly: status.isReachableInformationalOnly,
    },
  });
  await appendWatchModeLabTransportStatusSnapshot({
    db: input.db,
    status,
  });

  return applyWatchTransportReceiptSnapshotsFromStatus({
    db: input.db,
    participantId: input.participantId,
    status,
  });
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
  const message = buildPlanAvailableTransportMessage({ plan, createdAt });

  await appendWatchModeLabStateTransition({
    db: input.db,
    timestamp: createdAt,
    eventApplied: "plan_built",
    previousState: built.status === "phone_plan_built" ? built : staged,
    nextState: built,
    metadata: {
      syntheticTransportLab: true,
    },
  });
  await appendWatchModeLabStateTransition({
    db: input.db,
    timestamp: createdAt,
    eventApplied: "plan_staged",
    previousState: built,
    nextState: staged,
    metadata: {
      syntheticTransportLab: true,
    },
  });

  let status: NativeWatchTransportStatus;

  try {
    status = await watchTransport.stageSyntheticPlan(message);
    await appendWatchModeLabTransportMessage({
      db: input.db,
      message,
      direction: "outbound",
      deliveryMethod: "applicationContext+transferUserInfo",
      metadata: {
        planByteCount: message.planJson.length,
        kind: input.kind,
      },
    });
  } catch (error) {
    await appendWatchModeLabTransportMessage({
      db: input.db,
      message,
      direction: "outbound",
      deliveryMethod: "applicationContext+transferUserInfo",
      success: false,
      errorMessage:
        error instanceof Error ? error.message : "Synthetic plan staging failed.",
      metadata: {
        planByteCount: message.planJson.length,
        kind: input.kind,
      },
    });
    throw error;
  }

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
  await appendWatchModeLabDebugEvent({
    db: input.db,
    timestamp: createdAt,
    source: "phone_lab",
    eventType: "plan_staged",
    sessionId: plan.sessionId,
    planHash: plan.planHash,
    metadata: {
      kind: input.kind,
      deliveryMethod: "applicationContext+transferUserInfo",
    },
  });
  await appendWatchModeLabTransportStatusSnapshot({
    db: input.db,
    status,
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
  const message = buildPlanRequestTransportMessage({
    createdAt,
    sessionId: state?.sessionId,
    planHash: state?.planHash,
    sender: "phone",
  });

  let status: NativeWatchTransportStatus;

  try {
    status = await watchTransport.requestWatchStatus(message);
    await appendWatchModeLabTransportMessage({
      db: input.db,
      message,
      direction: "outbound",
      deliveryMethod: "transferUserInfo",
    });
  } catch (error) {
    await appendWatchModeLabTransportMessage({
      db: input.db,
      message,
      direction: "outbound",
      deliveryMethod: "transferUserInfo",
      success: false,
      errorMessage:
        error instanceof Error ? error.message : "Watch status request failed.",
    });
    throw error;
  }

  await appendWatchModeLabTransportStatusSnapshot({
    db: input.db,
    status,
  });

  return applyWatchTransportReceiptSnapshotsFromStatus({
    db: input.db,
    participantId: input.participantId,
    status,
  });
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

  await appendWatchModeLabDebugEvent({
    db: input.db,
    timestamp: importedAt,
    source: "importer",
    eventType: "package_import_started",
    sessionId: sealedPackage.manifest.sessionId,
    planHash: sealedPackage.manifest.planHash,
    packageId: sealedPackage.manifest.packageId,
    packageHash: sealedPackage.manifest.packageHash,
    metadata: {
      transportLab: true,
    },
  });

  try {
    const result = await importWatchPackage({
      db: input.db,
      sealedPackage,
      importedAt,
    });

    await appendWatchModeLabDebugEvent({
      db: input.db,
      timestamp: importedAt,
      source: "importer",
      eventType: "package_import_succeeded",
      sessionId: result.sessionId,
      planHash: sealedPackage.manifest.planHash,
      packageId: result.packageId,
      packageHash: result.packageHash,
      metadata: {
        transportLab: true,
        importStatus: result.status,
        ackEligible: result.ackEligible,
        duplicateImportSeen: result.status === "already_imported",
        counts: result.counts,
      },
    });

    if (result.ackEligible) {
      await appendWatchModeLabDebugEvent({
        db: input.db,
        timestamp: importedAt,
        source: "importer",
        eventType: "ack_became_eligible",
        sessionId: result.sessionId,
        planHash: sealedPackage.manifest.planHash,
        packageId: result.packageId,
        packageHash: result.packageHash,
        metadata: {
          transportLab: true,
        },
      });
    }

    await markTransportPackageImportedInLedger({
      db: input.db,
      participantId: input.participantId,
      result,
      planHash: sealedPackage.manifest.planHash,
      importedAt,
    });

    const status = await watchTransport.getTransportStatus();
    await appendWatchModeLabTransportStatusSnapshot({
      db: input.db,
      status,
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
      status,
      recovery: await loadRecovery(input),
    };
  } catch (error) {
    await appendWatchModeLabDebugEvent({
      db: input.db,
      timestamp: importedAt,
      source: "importer",
      eventType: "package_import_failed",
      sessionId: sealedPackage.manifest.sessionId,
      planHash: sealedPackage.manifest.planHash,
      packageId: sealedPackage.manifest.packageId,
      packageHash: sealedPackage.manifest.packageHash,
      success: false,
      errorMessage:
        error instanceof Error ? error.message : "Synthetic package import failed.",
    });

    throw error;
  }
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

  const message = buildPackageAckTransportMessage({
    sessionId: state.sessionId,
    planHash: state.planHash,
    packageId: state.packageId,
    packageHash: state.packageHash,
    ackedAt,
  });

  let status: NativeWatchTransportStatus;

  try {
    status = await watchTransport.sendAckForImportedPackage(message);
    await appendWatchModeLabTransportMessage({
      db: input.db,
      message,
      direction: "outbound",
      deliveryMethod: "transferUserInfo",
    });
  } catch (error) {
    await appendWatchModeLabTransportMessage({
      db: input.db,
      message,
      direction: "outbound",
      deliveryMethod: "transferUserInfo",
      success: false,
      errorMessage:
        error instanceof Error ? error.message : "Synthetic package ack failed.",
    });
    throw error;
  }
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
  await appendWatchModeLabStateTransition({
    db: input.db,
    timestamp: ackedAt,
    eventApplied: "ack_recorded",
    previousState: state,
    nextState: ackRecorded,
    metadata: {
      transportLab: true,
    },
  });
  await appendWatchModeLabDebugEvent({
    db: input.db,
    timestamp: ackedAt,
    source: "transport",
    eventType: "ack_sent",
    sessionId: state.sessionId,
    planHash: state.planHash,
    packageId: state.packageId,
    packageHash: state.packageHash,
    direction: "outbound",
    transportMessageType: message.messageType,
    messageId: message.messageId,
    deliveryMethod: "transferUserInfo",
    metadata: {
      ackEligibleRequired: true,
    },
  });
  await appendWatchModeLabTransportStatusSnapshot({
    db: input.db,
    status,
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

  await appendWatchModeLabDebugEvent({
    db: input.db,
    source: "transport",
    eventType: "clear_lab_transport_status",
    metadata: {
      localOnly: true,
    },
  });

  return { status, recovery };
}

function isTransportLabState(state: WatchSessionSyncState): boolean {
  return state.metadata.transportLab === true || state.metadata.syntheticLab === true;
}

function hasDifferentPackageIdentity(
  state: WatchSessionSyncState,
  incoming: TransportLabPackageIdentity,
): boolean {
  return Boolean(
    state.packageId &&
      (state.packageId !== incoming.packageId ||
        state.packageHash !== incoming.packageHash),
  );
}

function isReplaceableTransportLabPackageConflict(
  state: WatchSessionSyncState,
  incoming: TransportLabPackageIdentity,
): boolean {
  return (
    isTransportLabState(state) &&
    state.sessionId === incoming.sessionId &&
    state.planHash === incoming.planHash &&
    hasDifferentPackageIdentity(state, incoming) &&
    state.status !== "ack_recorded" &&
    state.status !== "completed" &&
    state.status !== "abandoned_local_only"
  );
}

function replaceStaleTransportLabPackageState(
  state: WatchSessionSyncState,
  incoming: TransportLabPackageIdentity & {
    replacedAt: string;
    reason: string;
  },
): WatchSessionSyncState {
  return {
    ...state,
    packageId: incoming.packageId,
    packageHash: incoming.packageHash,
    status: "watch_sealed_waiting_import",
    sealedAt: incoming.replacedAt,
    importedAt: undefined,
    ackEligibleAt: undefined,
    ackSentAt: undefined,
    lastKnownWatchState: "sealed",
    lastStatusAt: incoming.replacedAt,
    unresolvedReason: undefined,
    updatedAt: incoming.replacedAt,
    metadata: {
      ...state.metadata,
      transportLab: true,
      baselineReplacedStalePackage: true,
      replacedPackageId: state.packageId,
      replacedPackageHash: state.packageHash,
      replacementPackageId: incoming.packageId,
      replacementPackageHash: incoming.packageHash,
      replacedAt: incoming.replacedAt,
      replacementReason: incoming.reason,
    },
  };
}

async function appendIgnoredStalePackageConflict(input: {
  db: LocalDb;
  eventApplied: string;
  previousState: WatchSessionSyncState;
  incoming: TransportLabPackageIdentity;
  timestamp?: string;
  rejectionReason: string;
  source: string;
}): Promise<void> {
  await appendWatchModeLabStateTransition({
    db: input.db,
    timestamp: input.timestamp,
    eventApplied: input.eventApplied,
    previousState: input.previousState,
    nextState: input.previousState,
    rejected: true,
    rejectionReason: input.rejectionReason,
    metadata: {
      transportLab: true,
      packageHashCheck: "rejected",
      staleTransportLabPackageConflict: true,
      ignoredUntilLatestPackageImport: true,
      source: input.source,
      existingPackageId: input.previousState.packageId,
      existingPackageHash: input.previousState.packageHash,
      incomingPackageId: input.incoming.packageId,
      incomingPackageHash: input.incoming.packageHash,
    },
  });
}

export async function applyWatchTransportReceiptSnapshots(input: {
  db: LocalDb;
  participantId: string;
}): Promise<WatchModeLabTransportSummary> {
  const status = await watchTransport.getTransportStatus();
  await appendWatchModeLabTransportStatusSnapshot({
    db: input.db,
    status,
  });

  return applyWatchTransportReceiptSnapshotsFromStatus({
    db: input.db,
    participantId: input.participantId,
    status,
  });
}

async function applyWatchTransportReceiptSnapshotsFromStatus(input: {
  db: LocalDb;
  participantId: string;
  status: NativeWatchTransportStatus;
}): Promise<WatchModeLabTransportSummary> {
  const { status } = input;
  const sessionId =
    status.latestCommitReceipt?.sessionId ??
    status.latestPackageManifest?.sessionId ??
    status.latestReceivedPackage?.sessionId ??
    status.latestAck?.sessionId ??
    status.latestStatusSnapshot?.sessionId;
  let state = sessionId
    ? await loadWatchSessionSyncStateBySessionId({
        db: input.db,
        sessionId,
      })
    : null;

  if (state && status.latestCommitReceipt) {
    const previous = state;

    try {
      state = applyWatchCommitReceipt(state, {
        sessionId: status.latestCommitReceipt.sessionId,
        planHash: status.latestCommitReceipt.planHash,
        committedAt: status.latestCommitReceipt.committedAt ?? new Date().toISOString(),
        commitId: status.latestCommitReceipt.commitId,
        watchState: status.latestCommitReceipt.watchState,
      });
      await appendWatchModeLabStateTransition({
        db: input.db,
        timestamp: status.latestCommitReceipt.committedAt,
        eventApplied: "watch_commit_receipt",
        previousState: previous,
        nextState: state,
        metadata: {
          transportLab: true,
          commitId: status.latestCommitReceipt.commitId,
        },
      });
    } catch (error) {
      await appendWatchModeLabStateTransition({
        db: input.db,
        eventApplied: "watch_commit_receipt",
        previousState: previous,
        rejected: true,
        rejectionReason:
          error instanceof Error ? error.message : "Watch commit receipt rejected.",
        metadata: {
          transportLab: true,
          planHashCheck: "rejected",
        },
      });
      throw error;
    }
  }

  if (state && status.latestStatusSnapshot?.watchState) {
    const previous = state;

    try {
      state = applyWatchRunningStatus(state, {
        sessionId: state.sessionId,
        planHash: state.planHash,
        watchState: status.latestStatusSnapshot.watchState,
        reportedAt: status.latestStatusSnapshot.createdAt ?? new Date().toISOString(),
      });
      await appendWatchModeLabStateTransition({
        db: input.db,
        timestamp: status.latestStatusSnapshot.createdAt,
        eventApplied: "watch_running_status",
        previousState: previous,
        nextState: state,
        metadata: {
          transportLab: true,
          watchState: status.latestStatusSnapshot.watchState,
        },
      });
    } catch (error) {
      await appendWatchModeLabStateTransition({
        db: input.db,
        eventApplied: "watch_running_status",
        previousState: previous,
        rejected: true,
        rejectionReason:
          error instanceof Error ? error.message : "Watch running status rejected.",
        metadata: {
          transportLab: true,
          planHashCheck: "rejected",
        },
      });
      throw error;
    }
  }

  if (
    state &&
    status.latestStatusSnapshot?.packageId &&
    status.latestStatusSnapshot.packageHash &&
    !status.latestPackageManifest
  ) {
    const previous = state;
    const incoming = {
      sessionId: status.latestStatusSnapshot.sessionId ?? state.sessionId,
      planHash: status.latestStatusSnapshot.planHash ?? state.planHash,
      packageId: status.latestStatusSnapshot.packageId,
      packageHash: status.latestStatusSnapshot.packageHash,
    };

    try {
      state = applyWatchSealedManifest(state, {
        ...incoming,
        sealedAt: status.latestStatusSnapshot.createdAt ?? new Date().toISOString(),
      });
      await appendWatchModeLabStateTransition({
        db: input.db,
        timestamp: status.latestStatusSnapshot.createdAt,
        eventApplied: "watch_status_sealed_package",
        previousState: previous,
        nextState: state,
        metadata: {
          transportLab: true,
          source: "status_snapshot",
        },
      });
    } catch (error) {
      if (isReplaceableTransportLabPackageConflict(previous, incoming)) {
        await appendIgnoredStalePackageConflict({
          db: input.db,
          timestamp: status.latestStatusSnapshot.createdAt,
          eventApplied: "watch_status_sealed_package",
          previousState: previous,
          incoming,
          rejectionReason:
            error instanceof Error
              ? error.message
              : "Watch status sealed package rejected.",
          source: "status_snapshot",
        });
        state = previous;
      } else {
        await appendWatchModeLabStateTransition({
          db: input.db,
          eventApplied: "watch_status_sealed_package",
          previousState: previous,
          rejected: true,
          rejectionReason:
            error instanceof Error
              ? error.message
              : "Watch status sealed package rejected.",
          metadata: {
            transportLab: true,
            packageHashCheck: "rejected",
          },
        });
        throw error;
      }
    }
  }

  if (state && status.latestPackageManifest) {
    const previous = state;
    const incoming = {
      sessionId: status.latestPackageManifest.sessionId,
      planHash: status.latestPackageManifest.planHash,
      packageId: status.latestPackageManifest.packageId,
      packageHash: status.latestPackageManifest.packageHash,
    };

    try {
      state = applyWatchSealedManifest(state, {
        ...incoming,
        sealedAt: status.latestPackageManifest.receivedAt ?? new Date().toISOString(),
      });
      await appendWatchModeLabStateTransition({
        db: input.db,
        timestamp: status.latestPackageManifest.receivedAt,
        eventApplied: "watch_sealed_manifest",
        previousState: previous,
        nextState: state,
        metadata: {
          transportLab: true,
        },
      });
    } catch (error) {
      if (isReplaceableTransportLabPackageConflict(previous, incoming)) {
        await appendIgnoredStalePackageConflict({
          db: input.db,
          timestamp: status.latestPackageManifest.receivedAt,
          eventApplied: "watch_sealed_manifest",
          previousState: previous,
          incoming,
          rejectionReason:
            error instanceof Error ? error.message : "Watch sealed manifest rejected.",
          source: "package_manifest",
        });
        state = previous;
      } else {
        await appendWatchModeLabStateTransition({
          db: input.db,
          eventApplied: "watch_sealed_manifest",
          previousState: previous,
          rejected: true,
          rejectionReason:
            error instanceof Error ? error.message : "Watch sealed manifest rejected.",
          metadata: {
            transportLab: true,
            packageHashCheck: "rejected",
          },
        });
        throw error;
      }
    }
  }

  if (state && status.latestAck) {
    const previous = state;

    try {
      state = applyAckRecorded(state, {
        packageId: status.latestAck.packageId,
        packageHash: status.latestAck.packageHash,
        ackRecordedAt: status.latestAck.ackedAt ?? new Date().toISOString(),
      });
      await appendWatchModeLabStateTransition({
        db: input.db,
        timestamp: status.latestAck.ackedAt,
        eventApplied: "ack_recorded",
        previousState: previous,
        nextState: state,
        metadata: {
          transportLab: true,
          observedWatchAck: true,
        },
      });
    } catch (error) {
      await appendWatchModeLabStateTransition({
        db: input.db,
        eventApplied: "ack_recorded",
        previousState: previous,
        rejected: true,
        rejectionReason:
          error instanceof Error ? error.message : "Watch ack rejected.",
        metadata: {
          transportLab: true,
          packageHashCheck: "rejected",
        },
      });
      throw error;
    }
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
  const incoming = {
    sessionId: input.result.sessionId,
    planHash: input.planHash,
    packageId: input.result.packageId,
    packageHash: input.result.packageHash,
  };
  const stalePackageConflict = isReplaceableTransportLabPackageConflict(
    base,
    incoming,
  );
  const sealed = stalePackageConflict
    ? replaceStaleTransportLabPackageState(base, {
        ...incoming,
        replacedAt: input.importedAt,
        reason: "one_button_baseline_latest_received_package_imported",
      })
    : applyWatchSealedManifest(base, {
        ...incoming,
        sealedAt: input.importedAt,
      });
  const imported = applyPhoneImportSuccess(sealed, {
    packageId: input.result.packageId,
    packageHash: input.result.packageHash,
    importedAt: input.importedAt,
  });

  await saveWatchSessionSyncState({ db: input.db, state: imported });
  await appendWatchModeLabStateTransition({
    db: input.db,
    timestamp: input.importedAt,
    eventApplied: "watch_sealed_manifest",
    previousState: base,
    nextState: sealed,
    metadata: {
      transportLab: true,
      staleTransportLabPackageConflict: stalePackageConflict,
      baselineReplacedStalePackage: stalePackageConflict,
      existingPackageId: stalePackageConflict ? base.packageId : undefined,
      existingPackageHash: stalePackageConflict ? base.packageHash : undefined,
      replacementPackageId: stalePackageConflict ? input.result.packageId : undefined,
      replacementPackageHash: stalePackageConflict
        ? input.result.packageHash
        : undefined,
    },
  });
  await appendWatchModeLabStateTransition({
    db: input.db,
    timestamp: input.importedAt,
    eventApplied: "phone_import_success",
    previousState: sealed,
    nextState: imported,
    metadata: {
      transportLab: true,
    },
  });
}
