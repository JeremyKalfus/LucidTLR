import type { LocalDb } from "@/src/data/local/localDb";
import type { SessionType } from "@/src/domain/types";
import type { CueDecisionSettings } from "@/src/engine";
import type { TlrOptions } from "@/src/domain/types";
import { importWatchPackage } from "@/src/features/watchHistory/importWatchPackage";
import {
  WATCH_PACKAGE_FIXTURE_IMPORTED_AT,
  buildSyntheticSleepLogWatchPackageFixture,
  buildSyntheticTlrWatchPackageFixture,
} from "@/src/features/watchHistory/watchPackageFixtures";
import {
  validateWatchPackageForImport,
} from "@/src/features/watchHistory/validateWatchPackageManifest";
import type {
  WatchPackageImportResult,
  WatchSealedPackageV3,
} from "@/src/features/watchHistory/watchPackageImportTypes";
import {
  applyAckRecorded,
  applyPhoneImportSuccess,
  applyPlanBuilt,
  applyPlanStaged,
  applyWatchCommitReceipt,
  applyWatchRunningStatus,
  applyWatchSealedManifest,
  applyUserAbandonLocalOnly,
  computeWatchStartupRecoveryState,
  createDraftWatchSessionSyncState,
  loadUnresolvedWatchSessionSyncStates,
  saveWatchSessionSyncState,
  type WatchSessionSyncState,
  type WatchStartupRecoveryKind,
} from "@/src/features/watchSync/watchSessionSyncState";
import {
  buildWatchRuntimePlan,
  withWatchPackageManifestHash,
  type WatchRuntimePlanV3,
} from "@/src/native/watchRuntime";

export type WatchModeLabKind = "tlr" | "sleep_log";
export type WatchModeLabRecoveryAction =
  | "watch_committed"
  | "watch_running_last_known"
  | "watch_sealed_waiting_import"
  | "phone_import_success_ack_eligible"
  | "ack_recorded"
  | "abandon_local_only"
  | "reload";

const WATCH_MODE_LAB_SYNC_PLAN_ID = "watch-mode-lab-sync-plan-v3";

export interface WatchModeLabPlanSummary {
  sessionId: string;
  planHash: string;
  schemaVersion: string;
  selectedCueId: string;
  cueOutputMode: string;
  epochSeconds: number;
  cueingEnabled: boolean;
}

export interface WatchModeLabPackageImportSummary {
  status: WatchPackageImportResult["status"];
  ackEligible: boolean;
  packageId: string;
  packageHash: string;
  sessionId: string;
  counts: WatchPackageImportResult["counts"];
}

export interface WatchModeLabPackageValidationSummary {
  packageId: string;
  validationErrors: string[];
}

export interface WatchModeLabRecoveryStateSummary {
  sessionId: string;
  planHash: string;
  packageId?: string;
  packageHash?: string;
  status: WatchSessionSyncState["status"];
  lastKnownWatchState?: string;
  updatedAt: string;
  unresolvedReason?: string;
  metadataJson: string;
}

export interface WatchModeLabRecoverySummary {
  startupRecovery: WatchStartupRecoveryKind;
  blocksFutureWatchStart: boolean;
  unresolvedCount: number;
  message: string;
  states: WatchModeLabRecoveryStateSummary[];
}

export interface WatchModeLabRecoveryActionSummary {
  message: string;
  recovery: WatchModeLabRecoverySummary;
}

export function buildSyntheticWatchModeLabPlan(input: {
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
}): WatchRuntimePlanV3 {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const sessionType: Extract<SessionType, "tlr" | "sleep_log"> = input.kind;

  return buildWatchRuntimePlan({
    sessionId: `watch-mode-lab-${input.kind}-${Date.parse(createdAt)}`,
    participantId: input.participantId,
    sessionType,
    createdAt,
    selectedCueId: input.selectedCueId,
    tlrOptions: input.tlrOptions,
    engineSettings: input.engineSettings,
    allowExperimentalAudio: false,
  });
}

export function summarizeWatchModeLabPlan(
  plan: WatchRuntimePlanV3,
): WatchModeLabPlanSummary {
  const cueChannels = [
    plan.cueOutput.hapticEnabled ? "haptic" : null,
    plan.cueOutput.audioEnabled ? "audio" : null,
  ].filter((channel): channel is string => Boolean(channel));

  return {
    sessionId: plan.sessionId,
    planHash: plan.planHash,
    schemaVersion: plan.schemaVersion,
    selectedCueId: plan.selectedCueId,
    cueOutputMode: cueChannels.length > 0 ? cueChannels.join(" + ") : "disabled",
    epochSeconds: plan.epoching.epochSeconds,
    cueingEnabled: plan.tlrInterval.enabled,
  };
}

export function buildSyntheticWatchModeLabPackage(
  kind: WatchModeLabKind,
): WatchSealedPackageV3 {
  return kind === "tlr"
    ? buildSyntheticTlrWatchPackageFixture()
    : buildSyntheticSleepLogWatchPackageFixture();
}

export async function importSyntheticWatchModeLabPackage(input: {
  db: LocalDb;
  kind: WatchModeLabKind;
  participantId?: string;
  importedAt?: string;
}): Promise<WatchModeLabPackageImportSummary> {
  const sealedPackage = buildSyntheticWatchModeLabPackage(input.kind);
  const importedAt = input.importedAt ?? WATCH_PACKAGE_FIXTURE_IMPORTED_AT;
  const result = await importWatchPackage({
    db: input.db,
    sealedPackage,
    importedAt,
  });

  if (input.participantId) {
    await markSyntheticImportInRecoveryLedger({
      db: input.db,
      participantId: input.participantId,
      sealedPackage,
      importedAt,
    });
  }

  return {
    status: result.status,
    ackEligible: result.ackEligible,
    packageId: result.packageId,
    packageHash: result.packageHash,
    sessionId: result.sessionId,
    counts: result.counts,
  };
}

export function validateCorruptSyntheticWatchModeLabPackage(
  kind: WatchModeLabKind,
): WatchModeLabPackageValidationSummary {
  const sealedPackage = buildSyntheticWatchModeLabPackage(kind);
  const corruptPackage: WatchSealedPackageV3 = {
    ...sealedPackage,
    manifest: withWatchPackageManifestHash({
      ...sealedPackage.manifest,
      packageHash: "",
      files: sealedPackage.manifest.files.map((file, index) =>
        index === 0
          ? {
              ...file,
              sha256: "0".repeat(64),
            }
          : file,
      ),
    }),
  };

  return {
    packageId: corruptPackage.manifest.packageId,
    validationErrors: validateWatchPackageForImport(corruptPackage),
  };
}

export async function loadWatchModeLabRecoverySummary(input: {
  db: LocalDb;
  participantId: string;
}): Promise<WatchModeLabRecoverySummary> {
  const states = await loadUnresolvedWatchSessionSyncStates({
    db: input.db,
    participantId: input.participantId,
  });

  return summarizeRecovery(states);
}

export async function applyWatchModeLabRecoveryAction(input: {
  db: LocalDb;
  participantId: string;
  action: WatchModeLabRecoveryAction;
  now?: string;
}): Promise<WatchModeLabRecoveryActionSummary> {
  const now = input.now ?? new Date().toISOString();
  const existingStates = await loadUnresolvedWatchSessionSyncStates({
    db: input.db,
    participantId: input.participantId,
  });
  const existing = existingStates[0] ?? null;

  if (input.action === "reload") {
    return {
      message: "Reloaded local recovery state from the phone database.",
      recovery: summarizeRecovery(existingStates),
    };
  }

  if (input.action === "abandon_local_only") {
    if (!existing) {
      return {
        message: "No unresolved synthetic Watch sync state exists to abandon.",
        recovery: summarizeRecovery(existingStates),
      };
    }

    const abandoned = applyUserAbandonLocalOnly(existing, {
      abandonedAt: now,
      reason: "watch_mode_lab_explicit_local_only_abandon",
      explicit: true,
    });

    await saveWatchSessionSyncState({ db: input.db, state: abandoned });

    return {
      message: "Marked unresolved Watch lab state abandoned_local_only. This does not delete user session data or Watch packages.",
      recovery: await loadWatchModeLabRecoverySummary({
        db: input.db,
        participantId: input.participantId,
      }),
    };
  }

  const base = existing ?? syntheticBaseSyncState(input.participantId, now);
  const next = reduceSyntheticRecoveryAction(base, input.action, now);

  await saveWatchSessionSyncState({ db: input.db, state: next });

  return {
    message: recoveryActionMessage(input.action, next),
    recovery: await loadWatchModeLabRecoverySummary({
      db: input.db,
      participantId: input.participantId,
    }),
  };
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

function syntheticBaseSyncState(
  participantId: string,
  createdAt: string,
): WatchSessionSyncState {
  const sealedPackage = buildSyntheticTlrWatchPackageFixture();
  const draft = createDraftWatchSessionSyncState({
    sessionId: sealedPackage.manifest.sessionId,
    participantId,
    planId: WATCH_MODE_LAB_SYNC_PLAN_ID,
    planHash: sealedPackage.manifest.planHash,
    createdAt,
    metadata: {
      syntheticLab: true,
      source: "phone_watch_mode_lab",
    },
  });

  return applyPlanStaged(applyPlanBuilt(draft, { builtAt: createdAt }), {
    stagedAt: createdAt,
  });
}

function reduceSyntheticRecoveryAction(
  state: WatchSessionSyncState,
  action: Exclude<WatchModeLabRecoveryAction, "abandon_local_only" | "reload">,
  at: string,
): WatchSessionSyncState {
  const sealedPackage = buildSyntheticTlrWatchPackageFixture();
  const committed = applyWatchCommitReceipt(state, {
    sessionId: state.sessionId,
    planHash: state.planHash,
    committedAt: state.committedAt ?? at,
    commitId: "watch-mode-lab-synthetic-commit",
  });

  if (action === "watch_committed") {
    return committed;
  }

  const running = applyWatchRunningStatus(committed, {
    sessionId: state.sessionId,
    planHash: state.planHash,
    watchState: "running",
    reportedAt: at,
    startedAt: state.startedAt ?? at,
  });

  if (action === "watch_running_last_known") {
    return running;
  }

  const sealed = applyWatchSealedManifest(running, {
    sessionId: state.sessionId,
    planHash: state.planHash,
    packageId: sealedPackage.manifest.packageId,
    packageHash: sealedPackage.manifest.packageHash,
    sealedAt: sealedPackage.manifest.sealedAt,
  });

  if (action === "watch_sealed_waiting_import") {
    return sealed;
  }

  const imported = applyPhoneImportSuccess(sealed, {
    packageId: sealedPackage.manifest.packageId,
    packageHash: sealedPackage.manifest.packageHash,
    importedAt: at,
  });

  if (action === "phone_import_success_ack_eligible") {
    return imported;
  }

  return applyAckRecorded(imported, {
    packageId: sealedPackage.manifest.packageId,
    packageHash: sealedPackage.manifest.packageHash,
    ackRecordedAt: at,
  });
}

async function markSyntheticImportInRecoveryLedger(input: {
  db: LocalDb;
  participantId: string;
  sealedPackage: WatchSealedPackageV3;
  importedAt: string;
}): Promise<void> {
  const unresolved = await loadUnresolvedWatchSessionSyncStates({
    db: input.db,
    participantId: input.participantId,
  });
  const matching =
    unresolved.find(
      (state) => state.sessionId === input.sealedPackage.manifest.sessionId,
    ) ?? null;
  const base =
    matching ?? syntheticBaseSyncState(input.participantId, input.importedAt);
  const sealed = applyWatchSealedManifest(base, {
    sessionId: base.sessionId,
    planHash: base.planHash,
    packageId: input.sealedPackage.manifest.packageId,
    packageHash: input.sealedPackage.manifest.packageHash,
    sealedAt: input.sealedPackage.manifest.sealedAt,
  });
  const imported = applyPhoneImportSuccess(sealed, {
    packageId: input.sealedPackage.manifest.packageId,
    packageHash: input.sealedPackage.manifest.packageHash,
    importedAt: input.importedAt,
  });

  await saveWatchSessionSyncState({ db: input.db, state: imported });
}

function recoveryActionMessage(
  action: WatchModeLabRecoveryAction,
  state: WatchSessionSyncState,
): string {
  if (action === "watch_committed") {
    return "Simulated an idempotent Watch commit receipt.";
  }

  if (action === "watch_running_last_known") {
    return "Simulated last-known Watch running status.";
  }

  if (action === "watch_sealed_waiting_import") {
    return "Simulated a sealed Watch package waiting for import.";
  }

  if (action === "phone_import_success_ack_eligible") {
    return "Simulated committed phone import with ack eligibility.";
  }

  if (action === "ack_recorded") {
    return "Simulated matching ack recorded for the synthetic package.";
  }

  return `Updated recovery state ${state.sessionId} to ${state.status}.`;
}
