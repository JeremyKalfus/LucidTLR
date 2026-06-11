import type { LocalDb } from "@/src/data/local/localDb";
import { upsertLocalSession } from "@/src/data/local/repositories";
import type { NightSession, SessionType, TlrOptions } from "@/src/domain/types";
import type { CueDecisionSettings } from "@/src/engine";
import { createNightSession } from "@/src/features/sessions/sessionActions";
import { isWatchModeLabAvailable } from "@/src/features/internalBuild/internalBuildFlags";
import {
  applyWatchTransportReceiptSnapshots,
  importLatestReceivedSyntheticWatchPackage,
  sendAckForLatestImportedWatchPackage,
} from "@/src/features/watchModeLab/watchModeTransportLab";
import {
  applyUserAbandonLocalOnly,
  assertNoUnresolvedWatchSyncStateForFutureStart,
  computeWatchStartupRecoveryState,
  loadUnresolvedWatchSessionSyncStates,
  markWatchSessionPlanBuilt,
  markWatchSessionPlanStaged,
  saveWatchSessionSyncState,
  type WatchSessionSyncState,
} from "@/src/features/watchSync/watchSessionSyncState";
import {
  buildPlanAvailableTransportMessage,
  watchTransport,
  type NativeWatchTransportStatus,
} from "@/src/native/watchTransport";
import { buildWatchRuntimePlanFromSession } from "@/src/native/watchRuntime";
import { WATCH_MODE_DISABLED_MESSAGE } from "./watchModeAvailability";

export const WATCH_MODE_PRODUCT_SOURCE = "phone_watch_mode_v3";

const WATCH_MODE_PRODUCT_PLAN_ID = "watch-mode-product-plan-v3";

export type WatchModeProductLockPhase =
  | "none"
  | "running"
  | "syncing"
  | "resolved"
  | "error";

export interface WatchModeProductLockState {
  phase: WatchModeProductLockPhase;
  state: WatchSessionSyncState | null;
  status: NativeWatchTransportStatus;
  message: string;
  resolvedSessionId?: string;
}

export interface WatchModeProductStartResult {
  session: NightSession;
  state: WatchSessionSyncState;
  status: NativeWatchTransportStatus;
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isProductWatchSyncState(state: WatchSessionSyncState): boolean {
  return state.metadata.source === WATCH_MODE_PRODUCT_SOURCE;
}

function productWatchSyncStates(
  states: WatchSessionSyncState[],
): WatchSessionSyncState[] {
  return states.filter(isProductWatchSyncState);
}

function phaseForState(
  state: WatchSessionSyncState | null,
): WatchModeProductLockPhase {
  if (!state) {
    return "none";
  }

  if (
    state.status === "watch_sealed_waiting_import" ||
    state.status === "phone_importing" ||
    state.status === "phone_imported_ack_eligible"
  ) {
    return "syncing";
  }

  if (state.status === "error") {
    return "error";
  }

  return "running";
}

function hasPackageEvidenceForState(
  state: WatchSessionSyncState,
  status: NativeWatchTransportStatus,
): boolean {
  const packageRecords = [
    status.latestReceivedPackage,
    status.latestPackageFile,
    status.latestPackageManifest,
    status.latestStatusSnapshot,
  ];

  return packageRecords.some(
    (record) =>
      record?.sessionId === state.sessionId &&
      record.planHash === state.planHash &&
      Boolean(record.packageId && record.packageHash) &&
      record.matchesStagedPlan !== false,
  );
}

async function loadProductRecoveryState(input: {
  db: LocalDb;
  participantId: string;
}): Promise<WatchSessionSyncState | null> {
  const unresolved = await loadUnresolvedWatchSessionSyncStates({
    db: input.db,
    participantId: input.participantId,
  });
  const recovery = computeWatchStartupRecoveryState(
    productWatchSyncStates(unresolved),
  );

  return recovery.state;
}

export function isWatchModeProductFlowAvailable(): boolean {
  return isWatchModeLabAvailable();
}

export async function startWatchModeProductSession(input: {
  db: LocalDb;
  participantId: string;
  sessionType: SessionType;
  selectedCueId: string;
  tlrOptions: Pick<
    TlrOptions,
    "watchAudioCueEnabled" | "skipGuidedTraining"
  >;
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
}): Promise<WatchModeProductStartResult> {
  if (!isWatchModeProductFlowAvailable()) {
    throw new Error(WATCH_MODE_DISABLED_MESSAGE);
  }

  const unresolved = await loadUnresolvedWatchSessionSyncStates({
    db: input.db,
    participantId: input.participantId,
  });
  assertNoUnresolvedWatchSyncStateForFutureStart(unresolved);

  const createdAt = input.createdAt ?? new Date().toISOString();
  const baseSession = createNightSession({
    id: createId("session"),
    participantId: input.participantId,
    sessionType: input.sessionType,
    mode: "watch",
    startedAt: createdAt,
    selectedCueId: input.selectedCueId,
  });
  // The Watch sync ledger owns the running/syncing state for Watch nights.
  // Keeping the phone session row in setup prevents the phone cue engine from arming.
  const session = baseSession;
  const plan = buildWatchRuntimePlanFromSession({
    session,
    tlrOptions: input.tlrOptions,
    engineSettings: input.engineSettings,
    allowExperimentalAudio: input.tlrOptions.watchAudioCueEnabled,
  });

  await upsertLocalSession({
    db: input.db,
    session,
  });

  const built = await markWatchSessionPlanBuilt({
    db: input.db,
    sessionId: session.id,
    participantId: input.participantId,
    planId: WATCH_MODE_PRODUCT_PLAN_ID,
    planHash: plan.planHash,
    builtAt: createdAt,
    metadata: {
      source: WATCH_MODE_PRODUCT_SOURCE,
    },
  });
  const staged = await markWatchSessionPlanStaged({
    db: input.db,
    state: built,
    stagedAt: createdAt,
  });
  const message = buildPlanAvailableTransportMessage({
    plan,
    createdAt,
  });
  const status = await watchTransport.stageSyntheticPlan(message);

  return {
    session,
    state: staged,
    status,
  };
}

export async function loadWatchModeProductLockState(input: {
  db: LocalDb;
  participantId: string;
  refreshTransport?: boolean;
}): Promise<WatchModeProductLockState> {
  const summary =
    input.refreshTransport === false
      ? {
          status: await watchTransport.getTransportStatus(),
        }
      : await applyWatchTransportReceiptSnapshots({
          db: input.db,
          participantId: input.participantId,
        });
  const state = await loadProductRecoveryState(input);
  const phase = phaseForState(state);

  return {
    phase,
    state,
    status: summary.status,
    message: state
      ? `Watch session ${state.sessionId} is ${state.status}.`
      : "No active Watch Mode product session.",
  };
}

export async function resolveWatchModeProductSync(input: {
  db: LocalDb;
  participantId: string;
}): Promise<WatchModeProductLockState> {
  const current = await loadWatchModeProductLockState({
    ...input,
    refreshTransport: true,
  });
  const state = current.state;

  if (!state) {
    return current;
  }

  const shouldImport =
    state.status === "watch_sealed_waiting_import" ||
    state.status === "phone_importing" ||
    hasPackageEvidenceForState(state, current.status);

  if (shouldImport) {
    try {
      await importLatestReceivedSyntheticWatchPackage(input);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (!message.includes("No received synthetic Watch package file")) {
        throw error;
      }
    }
  }

  const afterImport = await loadWatchModeProductLockState({
    ...input,
    refreshTransport: true,
  });
  const ackState = afterImport.state;

  if (ackState?.status === "phone_imported_ack_eligible") {
    await sendAckForLatestImportedWatchPackage(input);
  }

  const afterAck = await loadWatchModeProductLockState({
    ...input,
    refreshTransport: true,
  });

  if (!afterAck.state && ackState) {
    return {
      ...afterAck,
      phase: "resolved",
      resolvedSessionId: ackState.sessionId,
      message: `Watch session ${ackState.sessionId} imported and acked.`,
    };
  }

  return afterAck;
}

export async function abandonWatchModeProductSessionLocalOnly(input: {
  db: LocalDb;
  participantId: string;
  abandonedAt?: string;
}): Promise<void> {
  const state = await loadProductRecoveryState(input);

  if (!state) {
    return;
  }

  await saveWatchSessionSyncState({
    db: input.db,
    state: applyUserAbandonLocalOnly(state, {
      abandonedAt: input.abandonedAt ?? new Date().toISOString(),
      reason: "phone_local_end_active_watch_session",
      explicit: true,
    }),
  });
}
