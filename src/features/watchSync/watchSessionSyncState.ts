import type { LocalDb } from "@/src/data/local/localDb";

export const WATCH_SESSION_SYNC_STATUSES = [
  "draft",
  "phone_plan_built",
  "plan_staged",
  "watch_commit_pending",
  "watch_committed",
  "watch_running_last_known",
  "watch_running_unconfirmed",
  "watch_sealed_waiting_import",
  "phone_importing",
  "phone_imported_ack_eligible",
  "ack_recorded",
  "completed",
  "abandoned_local_only",
  "error",
] as const;

export type WatchSessionSyncStatus =
  (typeof WATCH_SESSION_SYNC_STATUSES)[number];

export type WatchStartupRecoveryKind =
  | "normal_placeholder"
  | "unresolved_recover_state"
  | "import_prompt_recover_package_state"
  | "pending_ack_state"
  | "recovery_error_state";

export interface WatchSessionSyncState {
  sessionId: string;
  participantId: string;
  planId: string;
  planHash: string;
  packageId?: string;
  packageHash?: string;
  status: WatchSessionSyncStatus;
  lastKnownWatchState?: string;
  lastStatusAt?: string;
  startedAt?: string;
  committedAt?: string;
  sealedAt?: string;
  importedAt?: string;
  ackEligibleAt?: string;
  ackSentAt?: string;
  unresolvedReason?: string;
  metadata: Record<string, unknown>;
  updatedAt: string;
}

export interface WatchStartupRecoveryState {
  kind: WatchStartupRecoveryKind;
  state: WatchSessionSyncState | null;
  blocksFutureWatchStart: boolean;
  message: string;
}

interface WatchSessionSyncStateRow {
  session_id: string;
  participant_id: string;
  plan_id: string;
  plan_hash: string;
  package_id: string | null;
  package_hash: string | null;
  status: WatchSessionSyncStatus;
  last_known_watch_state: string | null;
  last_status_at: string | null;
  started_at: string | null;
  committed_at: string | null;
  sealed_at: string | null;
  imported_at: string | null;
  ack_eligible_at: string | null;
  ack_sent_at: string | null;
  unresolved_reason: string | null;
  metadata_json: string;
  updated_at: string;
}

const TERMINAL_WATCH_SESSION_SYNC_STATUSES = new Set<WatchSessionSyncStatus>([
  "ack_recorded",
  "completed",
  "abandoned_local_only",
]);

function metadataWith(
  state: WatchSessionSyncState,
  patch?: Record<string, unknown>,
): Record<string, unknown> {
  return patch ? { ...state.metadata, ...patch } : state.metadata;
}

function updateState(
  state: WatchSessionSyncState,
  patch: Partial<WatchSessionSyncState>,
  updatedAt: string,
): WatchSessionSyncState {
  return {
    ...state,
    ...patch,
    metadata: metadataWith(state, patch.metadata),
    updatedAt,
    lastStatusAt: patch.lastStatusAt ?? updatedAt,
  };
}

function assertSessionAndPlanHash(
  state: WatchSessionSyncState,
  input: {
    sessionId?: string;
    planHash: string;
  },
): void {
  if (input.sessionId && input.sessionId !== state.sessionId) {
    throw new Error(
      `Watch sync state session mismatch: expected ${state.sessionId}, received ${input.sessionId}.`,
    );
  }

  if (input.planHash !== state.planHash) {
    throw new Error(
      `Watch sync state planHash mismatch: expected ${state.planHash}, received ${input.planHash}.`,
    );
  }
}

function assertPackageMatch(
  state: WatchSessionSyncState,
  input: {
    packageId: string;
    packageHash: string;
  },
): void {
  if (!state.packageId || !state.packageHash) {
    throw new Error("Watch sync state has no sealed package identity.");
  }

  if (
    input.packageId !== state.packageId ||
    input.packageHash !== state.packageHash
  ) {
    throw new Error(
      `Watch sync package mismatch for ${state.sessionId}: expected ${state.packageId}/${state.packageHash}.`,
    );
  }
}

function parseMetadata(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);

    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function toWatchSessionSyncState(
  row: WatchSessionSyncStateRow,
): WatchSessionSyncState {
  return {
    sessionId: row.session_id,
    participantId: row.participant_id,
    planId: row.plan_id,
    planHash: row.plan_hash,
    packageId: row.package_id ?? undefined,
    packageHash: row.package_hash ?? undefined,
    status: row.status,
    lastKnownWatchState: row.last_known_watch_state ?? undefined,
    lastStatusAt: row.last_status_at ?? undefined,
    startedAt: row.started_at ?? undefined,
    committedAt: row.committed_at ?? undefined,
    sealedAt: row.sealed_at ?? undefined,
    importedAt: row.imported_at ?? undefined,
    ackEligibleAt: row.ack_eligible_at ?? undefined,
    ackSentAt: row.ack_sent_at ?? undefined,
    unresolvedReason: row.unresolved_reason ?? undefined,
    metadata: parseMetadata(row.metadata_json),
    updatedAt: row.updated_at,
  };
}

export function createDraftWatchSessionSyncState(input: {
  sessionId: string;
  participantId: string;
  planId: string;
  planHash: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}): WatchSessionSyncState {
  return {
    sessionId: input.sessionId,
    participantId: input.participantId,
    planId: input.planId,
    planHash: input.planHash,
    status: "draft",
    lastStatusAt: input.createdAt,
    metadata: input.metadata ?? {},
    updatedAt: input.createdAt,
  };
}

export function isResolvedWatchSessionSyncState(
  state: WatchSessionSyncState,
): boolean {
  return TERMINAL_WATCH_SESSION_SYNC_STATUSES.has(state.status);
}

export function unresolvedWatchSessionSyncStates(
  states: WatchSessionSyncState[],
): WatchSessionSyncState[] {
  return states.filter((state) => !isResolvedWatchSessionSyncState(state));
}

export function findUnresolvedConflictingActiveWatchSyncState(
  states: WatchSessionSyncState[],
  nextSessionId?: string,
): WatchSessionSyncState | null {
  return (
    unresolvedWatchSessionSyncStates(states).find(
      (state) => !nextSessionId || state.sessionId !== nextSessionId,
    ) ?? null
  );
}

export function detectUnresolvedConflictingActiveWatchSyncStates(
  states: WatchSessionSyncState[],
  nextSessionId?: string,
): WatchSessionSyncState[] {
  return unresolvedWatchSessionSyncStates(states).filter(
    (state) => !nextSessionId || state.sessionId !== nextSessionId,
  );
}

export function assertNoUnresolvedWatchSyncStateForFutureStart(
  states: WatchSessionSyncState[],
): void {
  const blocker = findUnresolvedConflictingActiveWatchSyncState(states);

  if (blocker) {
    throw new Error(
      `Watch Mode start is blocked by unresolved Watch sync state ${blocker.sessionId} (${blocker.status}).`,
    );
  }
}

export function applyPlanBuilt(
  state: WatchSessionSyncState,
  input: { builtAt: string },
): WatchSessionSyncState {
  return updateState(
    state,
    {
      status: "phone_plan_built",
      unresolvedReason: undefined,
    },
    input.builtAt,
  );
}

export function applyPlanStaged(
  state: WatchSessionSyncState,
  input: { stagedAt: string },
): WatchSessionSyncState {
  return updateState(
    state,
    {
      status: "plan_staged",
      unresolvedReason: undefined,
    },
    input.stagedAt,
  );
}

export function applyWatchCommitReceipt(
  state: WatchSessionSyncState,
  input: {
    sessionId: string;
    planHash: string;
    committedAt: string;
    watchState?: string;
    commitId?: string;
  },
): WatchSessionSyncState {
  assertSessionAndPlanHash(state, input);

  return updateState(
    state,
    {
      status: "watch_committed",
      committedAt: state.committedAt ?? input.committedAt,
      lastKnownWatchState: input.watchState ?? "committed",
      unresolvedReason: undefined,
      metadata: input.commitId ? { commitId: input.commitId } : undefined,
    },
    input.committedAt,
  );
}

export function applyWatchRunningStatus(
  state: WatchSessionSyncState,
  input: {
    sessionId: string;
    planHash: string;
    watchState: string;
    reportedAt: string;
    startedAt?: string;
  },
): WatchSessionSyncState {
  assertSessionAndPlanHash(state, input);

  const status: WatchSessionSyncStatus =
    state.packageId || state.status === "phone_imported_ack_eligible"
      ? state.status
      : "watch_running_last_known";

  return updateState(
    state,
    {
      status,
      lastKnownWatchState: input.watchState,
      startedAt: state.startedAt ?? input.startedAt,
      unresolvedReason: undefined,
    },
    input.reportedAt,
  );
}

export function applyWatchSealedManifest(
  state: WatchSessionSyncState,
  input: {
    sessionId: string;
    planHash: string;
    packageId: string;
    packageHash: string;
    sealedAt: string;
  },
): WatchSessionSyncState {
  assertSessionAndPlanHash(state, input);

  if (
    state.packageId &&
    (state.packageId !== input.packageId ||
      state.packageHash !== input.packageHash)
  ) {
    throw new Error(
      `Watch sync state already has package ${state.packageId} for ${state.sessionId}.`,
    );
  }

  return updateState(
    state,
    {
      packageId: input.packageId,
      packageHash: input.packageHash,
      status: "watch_sealed_waiting_import",
      sealedAt: state.sealedAt ?? input.sealedAt,
      lastKnownWatchState: "sealed",
      unresolvedReason: undefined,
    },
    input.sealedAt,
  );
}

export function applyPhoneImportSuccess(
  state: WatchSessionSyncState,
  input: {
    packageId: string;
    packageHash: string;
    importedAt: string;
  },
): WatchSessionSyncState {
  assertPackageMatch(state, input);

  return updateState(
    state,
    {
      status: "phone_imported_ack_eligible",
      importedAt: state.importedAt ?? input.importedAt,
      ackEligibleAt: state.ackEligibleAt ?? input.importedAt,
      unresolvedReason: undefined,
    },
    input.importedAt,
  );
}

export function applyAckRecorded(
  state: WatchSessionSyncState,
  input: {
    packageId: string;
    packageHash: string;
    ackRecordedAt: string;
  },
): WatchSessionSyncState {
  assertPackageMatch(state, input);

  return updateState(
    state,
    {
      status: "ack_recorded",
      ackSentAt: state.ackSentAt ?? input.ackRecordedAt,
      lastKnownWatchState: "ack_recorded",
      unresolvedReason: undefined,
    },
    input.ackRecordedAt,
  );
}

export function applyTransportTimeout(
  state: WatchSessionSyncState,
  input: {
    timedOutAt: string;
    reason: string;
  },
): WatchSessionSyncState {
  if (isResolvedWatchSessionSyncState(state) || state.packageId) {
    return updateState(
      state,
      { unresolvedReason: state.unresolvedReason ?? input.reason },
      input.timedOutAt,
    );
  }

  return updateState(
    state,
    {
      status: "watch_running_unconfirmed",
      unresolvedReason: input.reason,
    },
    input.timedOutAt,
  );
}

export function applyUserReopenedApp(
  state: WatchSessionSyncState,
  input: { reopenedAt: string },
): WatchSessionSyncState {
  if (isResolvedWatchSessionSyncState(state) || state.packageId) {
    return updateState(state, {}, input.reopenedAt);
  }

  if (state.status === "watch_running_last_known") {
    return updateState(
      state,
      {
        status: "watch_running_unconfirmed",
        unresolvedReason: "phone_reopened_after_watch_running",
      },
      input.reopenedAt,
    );
  }

  return updateState(state, {}, input.reopenedAt);
}

export function applyUserAbandonLocalOnly(
  state: WatchSessionSyncState,
  input: {
    abandonedAt: string;
    reason: string;
    explicit: boolean;
  },
): WatchSessionSyncState {
  if (!input.explicit) {
    throw new Error("Abandoning Watch sync state requires an explicit action.");
  }

  return updateState(
    state,
    {
      status: "abandoned_local_only",
      unresolvedReason: undefined,
      metadata: {
        abandonedLocalOnly: true,
        abandonedReason: input.reason,
      },
    },
    input.abandonedAt,
  );
}

export function computeWatchStartupRecoveryState(
  states: WatchSessionSyncState[],
): WatchStartupRecoveryState {
  const unresolved = unresolvedWatchSessionSyncStates(states).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
  const state = unresolved[0] ?? null;

  if (!state) {
    return {
      kind: "normal_placeholder",
      state: null,
      blocksFutureWatchStart: false,
      message: "No unresolved Watch session sync state.",
    };
  }

  if (state.status === "watch_sealed_waiting_import") {
    return {
      kind: "import_prompt_recover_package_state",
      state,
      blocksFutureWatchStart: true,
      message: "A sealed Watch package is waiting for phone import.",
    };
  }

  if (state.status === "phone_imported_ack_eligible") {
    return {
      kind: "pending_ack_state",
      state,
      blocksFutureWatchStart: true,
      message: "Phone import is committed and waiting for Watch ack.",
    };
  }

  if (state.status === "error") {
    return {
      kind: "recovery_error_state",
      state,
      blocksFutureWatchStart: true,
      message: state.unresolvedReason ?? "Watch sync state requires recovery.",
    };
  }

  return {
    kind: "unresolved_recover_state",
    state,
    blocksFutureWatchStart: true,
    message: `Unresolved Watch sync state: ${state.status}.`,
  };
}

export async function saveWatchSessionSyncState(input: {
  db: LocalDb;
  state: WatchSessionSyncState;
}): Promise<void> {
  const state = input.state;

  await input.db.execute(
    `insert into watch_session_sync_states (
  session_id,
  participant_id,
  plan_id,
  plan_hash,
  package_id,
  package_hash,
  status,
  last_known_watch_state,
  last_status_at,
  started_at,
  committed_at,
  sealed_at,
  imported_at,
  ack_eligible_at,
  ack_sent_at,
  unresolved_reason,
  metadata_json,
  updated_at
) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
on conflict(session_id) do update set
  participant_id = excluded.participant_id,
  plan_id = excluded.plan_id,
  plan_hash = excluded.plan_hash,
  package_id = excluded.package_id,
  package_hash = excluded.package_hash,
  status = excluded.status,
  last_known_watch_state = excluded.last_known_watch_state,
  last_status_at = excluded.last_status_at,
  started_at = excluded.started_at,
  committed_at = excluded.committed_at,
  sealed_at = excluded.sealed_at,
  imported_at = excluded.imported_at,
  ack_eligible_at = excluded.ack_eligible_at,
  ack_sent_at = excluded.ack_sent_at,
  unresolved_reason = excluded.unresolved_reason,
  metadata_json = excluded.metadata_json,
  updated_at = excluded.updated_at`,
    [
      state.sessionId,
      state.participantId,
      state.planId,
      state.planHash,
      state.packageId ?? null,
      state.packageHash ?? null,
      state.status,
      state.lastKnownWatchState ?? null,
      state.lastStatusAt ?? null,
      state.startedAt ?? null,
      state.committedAt ?? null,
      state.sealedAt ?? null,
      state.importedAt ?? null,
      state.ackEligibleAt ?? null,
      state.ackSentAt ?? null,
      state.unresolvedReason ?? null,
      JSON.stringify(state.metadata),
      state.updatedAt,
    ],
  );
}

export async function createOrUpdateWatchSessionSyncState(input: {
  db: LocalDb;
  state: WatchSessionSyncState;
}): Promise<void> {
  await saveWatchSessionSyncState(input);
}

export async function loadWatchSessionSyncStateBySessionId(input: {
  db: LocalDb;
  sessionId: string;
}): Promise<WatchSessionSyncState | null> {
  const row = await input.db.queryOne<WatchSessionSyncStateRow>(
    `select *
from watch_session_sync_states
where session_id = ?
limit 1`,
    [input.sessionId],
  );

  return row ? toWatchSessionSyncState(row) : null;
}

export async function loadUnresolvedWatchSessionSyncStates(input: {
  db: LocalDb;
  participantId?: string;
}): Promise<WatchSessionSyncState[]> {
  const terminalStatuses = [...TERMINAL_WATCH_SESSION_SYNC_STATUSES];
  const placeholders = terminalStatuses.map(() => "?").join(", ");
  const params: unknown[] = terminalStatuses;
  const participantClause = input.participantId ? "and participant_id = ?" : "";

  if (input.participantId) {
    params.push(input.participantId);
  }

  const rows = await input.db.query<WatchSessionSyncStateRow>(
    `select *
from watch_session_sync_states
where status not in (${placeholders})
${participantClause}
order by updated_at desc`,
    params,
  );

  return rows.map(toWatchSessionSyncState);
}

export async function markWatchSessionPlanBuilt(input: {
  db: LocalDb;
  sessionId: string;
  participantId: string;
  planId: string;
  planHash: string;
  builtAt: string;
  metadata?: Record<string, unknown>;
}): Promise<WatchSessionSyncState> {
  const existing = await loadWatchSessionSyncStateBySessionId({
    db: input.db,
    sessionId: input.sessionId,
  });
  const base =
    existing ??
    createDraftWatchSessionSyncState({
      sessionId: input.sessionId,
      participantId: input.participantId,
      planId: input.planId,
      planHash: input.planHash,
      createdAt: input.builtAt,
      metadata: input.metadata,
    });
  const next = applyPlanBuilt(base, { builtAt: input.builtAt });

  await saveWatchSessionSyncState({ db: input.db, state: next });

  return next;
}

export async function markWatchSessionPlanStaged(input: {
  db: LocalDb;
  state: WatchSessionSyncState;
  stagedAt: string;
}): Promise<WatchSessionSyncState> {
  const next = applyPlanStaged(input.state, { stagedAt: input.stagedAt });

  await saveWatchSessionSyncState({ db: input.db, state: next });

  return next;
}

export async function markWatchSessionCommitted(input: {
  db: LocalDb;
  state: WatchSessionSyncState;
  committedAt: string;
  commitId?: string;
}): Promise<WatchSessionSyncState> {
  const next = applyWatchCommitReceipt(input.state, {
    sessionId: input.state.sessionId,
    planHash: input.state.planHash,
    committedAt: input.committedAt,
    commitId: input.commitId,
  });

  await saveWatchSessionSyncState({ db: input.db, state: next });

  return next;
}

export async function markWatchSessionRunningLastKnown(input: {
  db: LocalDb;
  state: WatchSessionSyncState;
  watchState: string;
  reportedAt: string;
}): Promise<WatchSessionSyncState> {
  const next = applyWatchRunningStatus(input.state, {
    sessionId: input.state.sessionId,
    planHash: input.state.planHash,
    watchState: input.watchState,
    reportedAt: input.reportedAt,
  });

  await saveWatchSessionSyncState({ db: input.db, state: next });

  return next;
}

export async function markWatchSessionSealedWaitingImport(input: {
  db: LocalDb;
  state: WatchSessionSyncState;
  packageId: string;
  packageHash: string;
  sealedAt: string;
}): Promise<WatchSessionSyncState> {
  const next = applyWatchSealedManifest(input.state, {
    sessionId: input.state.sessionId,
    planHash: input.state.planHash,
    packageId: input.packageId,
    packageHash: input.packageHash,
    sealedAt: input.sealedAt,
  });

  await saveWatchSessionSyncState({ db: input.db, state: next });

  return next;
}

export async function markWatchSessionImportedAckEligible(input: {
  db: LocalDb;
  state: WatchSessionSyncState;
  importedAt: string;
}): Promise<WatchSessionSyncState> {
  if (!input.state.packageId || !input.state.packageHash) {
    throw new Error("Cannot mark Watch session import success without package identity.");
  }

  const next = applyPhoneImportSuccess(input.state, {
    packageId: input.state.packageId,
    packageHash: input.state.packageHash,
    importedAt: input.importedAt,
  });

  await saveWatchSessionSyncState({ db: input.db, state: next });

  return next;
}

export async function markWatchSessionAckRecorded(input: {
  db: LocalDb;
  state: WatchSessionSyncState;
  ackRecordedAt: string;
}): Promise<WatchSessionSyncState> {
  if (!input.state.packageId || !input.state.packageHash) {
    throw new Error("Cannot record Watch ack without package identity.");
  }

  const next = applyAckRecorded(input.state, {
    packageId: input.state.packageId,
    packageHash: input.state.packageHash,
    ackRecordedAt: input.ackRecordedAt,
  });

  await saveWatchSessionSyncState({ db: input.db, state: next });

  return next;
}

export async function markWatchSessionAbandonedLocalOnly(input: {
  db: LocalDb;
  state: WatchSessionSyncState;
  abandonedAt: string;
  reason: string;
  explicit: boolean;
}): Promise<WatchSessionSyncState> {
  const next = applyUserAbandonLocalOnly(input.state, {
    abandonedAt: input.abandonedAt,
    reason: input.reason,
    explicit: input.explicit,
  });

  await saveWatchSessionSyncState({ db: input.db, state: next });

  return next;
}
