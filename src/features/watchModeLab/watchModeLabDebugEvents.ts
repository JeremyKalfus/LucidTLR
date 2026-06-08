import type { LocalDb } from "@/src/data/local/localDb";
import type { WatchSessionSyncState } from "@/src/features/watchSync/watchSessionSyncState";
import type {
  NativeWatchTransportStatus,
  WatchTransportMessage,
} from "@/src/native/watchTransport";

export const WATCH_MODE_LAB_DEBUG_EVENT_LIMIT = 100;

export type WatchModeLabTimelineSource =
  | "phone_lab"
  | "watch_lab"
  | "transport"
  | "sync_ledger"
  | "importer"
  | "export";

export type WatchModeLabTransportDirection = "inbound" | "outbound";

export interface WatchModeLabDebugEvent {
  id: string;
  timestamp: string;
  source: WatchModeLabTimelineSource;
  eventType: string;
  sessionId?: string;
  planHash?: string;
  packageId?: string;
  packageHash?: string;
  previousStatus?: string;
  nextStatus?: string;
  success: boolean;
  errorMessage?: string;
  direction?: WatchModeLabTransportDirection;
  messageId?: string;
  transportMessageType?: string;
  deliveryMethod?: string;
  metadata: Record<string, unknown>;
}

export interface WatchModeLabDebugEventInput {
  db: LocalDb;
  timestamp?: string;
  source: WatchModeLabTimelineSource;
  eventType: string;
  sessionId?: string;
  planHash?: string;
  packageId?: string;
  packageHash?: string;
  previousStatus?: string;
  nextStatus?: string;
  success?: boolean;
  errorMessage?: string;
  direction?: WatchModeLabTransportDirection;
  messageId?: string;
  transportMessageType?: string;
  deliveryMethod?: string;
  metadata?: Record<string, unknown>;
}

interface WatchModeLabDebugEventRow {
  id: string;
  timestamp: string;
  source: WatchModeLabTimelineSource;
  event_type: string;
  session_id: string | null;
  plan_hash: string | null;
  package_id: string | null;
  package_hash: string | null;
  previous_status: string | null;
  next_status: string | null;
  success: number;
  error_message: string | null;
  direction: WatchModeLabTransportDirection | null;
  message_id: string | null;
  transport_message_type: string | null;
  delivery_method: string | null;
  metadata_json: string;
}

const PRIVATE_METADATA_KEY_FRAGMENTS = [
  "authorization",
  "credential",
  "password",
  "secret",
  "supabase",
  "token",
  "apiKey",
  "apikey",
  "appleId",
  "email",
  "deviceIdentifier",
  "deviceId",
] as const;

function eventId(input: {
  timestamp: string;
  source: WatchModeLabTimelineSource;
  eventType: string;
  messageId?: string;
  sessionId?: string;
}): string {
  const stablePart = [
    input.timestamp,
    input.source,
    input.eventType,
    input.messageId ?? input.sessionId ?? "no-id",
  ].join("|");

  return `watch-lab-event-${stablePart}-${Math.random().toString(36).slice(2, 10)}`;
}

function isPrivateMetadataKey(key: string): boolean {
  const normalized = key.toLowerCase();

  return PRIVATE_METADATA_KEY_FRAGMENTS.some((fragment) =>
    normalized.includes(fragment.toLowerCase()),
  );
}

function sanitizeMetadataValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.slice(0, 20).map(sanitizeMetadataValue);
  }

  if (value && typeof value === "object") {
    const sanitized: Record<string, unknown> = {};

    for (const [key, childValue] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (isPrivateMetadataKey(key)) {
        sanitized[key] = "[redacted]";
      } else {
        sanitized[key] = sanitizeMetadataValue(childValue);
      }
    }

    return sanitized;
  }

  if (typeof value === "string" && value.length > 240) {
    return `${value.slice(0, 240)}...`;
  }

  return value;
}

function sanitizeMetadata(
  metadata?: Record<string, unknown>,
): Record<string, unknown> {
  return sanitizeMetadataValue(metadata ?? {}) as Record<string, unknown>;
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

function toDebugEvent(row: WatchModeLabDebugEventRow): WatchModeLabDebugEvent {
  return {
    id: row.id,
    timestamp: row.timestamp,
    source: row.source,
    eventType: row.event_type,
    sessionId: row.session_id ?? undefined,
    planHash: row.plan_hash ?? undefined,
    packageId: row.package_id ?? undefined,
    packageHash: row.package_hash ?? undefined,
    previousStatus: row.previous_status ?? undefined,
    nextStatus: row.next_status ?? undefined,
    success: row.success === 1,
    errorMessage: row.error_message ?? undefined,
    direction: row.direction ?? undefined,
    messageId: row.message_id ?? undefined,
    transportMessageType: row.transport_message_type ?? undefined,
    deliveryMethod: row.delivery_method ?? undefined,
    metadata: parseMetadata(row.metadata_json),
  };
}

export async function appendWatchModeLabDebugEvent(
  input: WatchModeLabDebugEventInput,
): Promise<WatchModeLabDebugEvent> {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const event: WatchModeLabDebugEvent = {
    id: eventId({
      timestamp,
      source: input.source,
      eventType: input.eventType,
      messageId: input.messageId,
      sessionId: input.sessionId,
    }),
    timestamp,
    source: input.source,
    eventType: input.eventType,
    sessionId: input.sessionId,
    planHash: input.planHash,
    packageId: input.packageId,
    packageHash: input.packageHash,
    previousStatus: input.previousStatus,
    nextStatus: input.nextStatus,
    success: input.success ?? true,
    errorMessage: input.errorMessage,
    direction: input.direction,
    messageId: input.messageId,
    transportMessageType: input.transportMessageType,
    deliveryMethod: input.deliveryMethod,
    metadata: sanitizeMetadata(input.metadata),
  };

  await input.db.execute(
    `insert into watch_lab_debug_events (
  id,
  timestamp,
  source,
  event_type,
  session_id,
  plan_hash,
  package_id,
  package_hash,
  previous_status,
  next_status,
  success,
  error_message,
  direction,
  message_id,
  transport_message_type,
  delivery_method,
  metadata_json
) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      event.id,
      event.timestamp,
      event.source,
      event.eventType,
      event.sessionId ?? null,
      event.planHash ?? null,
      event.packageId ?? null,
      event.packageHash ?? null,
      event.previousStatus ?? null,
      event.nextStatus ?? null,
      event.success ? 1 : 0,
      event.errorMessage ?? null,
      event.direction ?? null,
      event.messageId ?? null,
      event.transportMessageType ?? null,
      event.deliveryMethod ?? null,
      JSON.stringify(event.metadata),
    ],
  );

  return event;
}

export async function loadRecentWatchModeLabDebugEvents(input: {
  db: LocalDb;
  limit?: number;
  sessionIds?: string[];
}): Promise<WatchModeLabDebugEvent[]> {
  const limit = Math.max(
    1,
    Math.min(input.limit ?? WATCH_MODE_LAB_DEBUG_EVENT_LIMIT, 100),
  );
  const sessionIds = input.sessionIds?.filter((sessionId) => sessionId.length > 0);
  const params: unknown[] = [];
  const sessionClause =
    sessionIds && sessionIds.length > 0
      ? `where (session_id is null or session_id in (${sessionIds.map(() => "?").join(", ")}))`
      : "";

  if (sessionIds && sessionIds.length > 0) {
    params.push(...sessionIds);
  }

  params.push(limit);

  const rows = await input.db.query<WatchModeLabDebugEventRow>(
    `select *
from watch_lab_debug_events
${sessionClause}
order by timestamp desc
limit ?`,
    params,
  );

  return rows.map(toDebugEvent).sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );
}

export async function appendWatchModeLabStateTransition(input: {
  db: LocalDb;
  timestamp?: string;
  eventApplied: string;
  previousState: WatchSessionSyncState;
  nextState?: WatchSessionSyncState;
  rejected?: boolean;
  rejectionReason?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const nextState = input.nextState ?? input.previousState;

  await appendWatchModeLabDebugEvent({
    db: input.db,
    timestamp: input.timestamp,
    source: "sync_ledger",
    eventType: "state_transition",
    sessionId: input.previousState.sessionId,
    planHash: input.previousState.planHash,
    packageId: nextState.packageId ?? input.previousState.packageId,
    packageHash: nextState.packageHash ?? input.previousState.packageHash,
    previousStatus: input.previousState.status,
    nextStatus: nextState.status,
    success: !input.rejected,
    errorMessage: input.rejectionReason,
    metadata: {
      eventApplied: input.eventApplied,
      ignoredAsStale:
        !input.rejected &&
        input.previousState.status === nextState.status &&
        input.previousState.updatedAt === nextState.updatedAt,
      rejected: input.rejected === true,
      rejectionReason: input.rejectionReason,
      planHashCheck: "matched",
      packageHashCheck:
        (nextState.packageHash ?? input.previousState.packageHash)
          ? "matched"
          : "not_applicable",
      ...input.metadata,
    },
  });
}

export async function appendWatchModeLabTransportMessage(input: {
  db: LocalDb;
  message: Pick<
    WatchTransportMessage,
    | "messageId"
    | "messageType"
    | "createdAt"
    | "sessionId"
    | "planHash"
    | "packageId"
    | "packageHash"
  >;
  direction: WatchModeLabTransportDirection;
  deliveryMethod: string;
  success?: boolean;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await appendWatchModeLabDebugEvent({
    db: input.db,
    timestamp: input.message.createdAt,
    source: "transport",
    eventType: input.message.messageType,
    sessionId: input.message.sessionId,
    planHash: input.message.planHash,
    packageId: input.message.packageId,
    packageHash: input.message.packageHash,
    direction: input.direction,
    messageId: input.message.messageId,
    transportMessageType: input.message.messageType,
    deliveryMethod: input.deliveryMethod,
    success: input.success,
    errorMessage: input.errorMessage,
    metadata: input.metadata,
  });
}

export async function appendWatchModeLabTransportStatusSnapshot(input: {
  db: LocalDb;
  status: NativeWatchTransportStatus;
  timestamp?: string;
}): Promise<void> {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const status = input.status;

  if (status.latestCommitReceipt) {
    await appendWatchModeLabDebugEvent({
      db: input.db,
      timestamp: status.latestCommitReceipt.committedAt ?? timestamp,
      source: "transport",
      eventType: "watch_commit_receipt_received",
      sessionId: status.latestCommitReceipt.sessionId,
      planHash: status.latestCommitReceipt.planHash,
      success: true,
      direction: "inbound",
      transportMessageType: "lucidtlr.watch.plan.commit.receipt",
      deliveryMethod: "transferUserInfo",
      metadata: {
        commitId: status.latestCommitReceipt.commitId,
        watchState: status.latestCommitReceipt.watchState,
      },
    });
  }

  if (status.latestStatusSnapshot) {
    await appendWatchModeLabDebugEvent({
      db: input.db,
      timestamp: status.latestStatusSnapshot.createdAt ?? timestamp,
      source: "watch_lab",
      eventType: "watch_status_snapshot_received",
      sessionId: status.latestStatusSnapshot.sessionId,
      planHash: status.latestStatusSnapshot.planHash,
      packageId: status.latestStatusSnapshot.packageId,
      packageHash: status.latestStatusSnapshot.packageHash,
      success: true,
      direction: "inbound",
      transportMessageType: "lucidtlr.watch.status.snapshot",
      deliveryMethod: "transferUserInfo",
      metadata: {
        watchState: status.latestStatusSnapshot.watchState,
      },
    });
  }

  if (status.latestPackageManifest) {
    await appendWatchModeLabDebugEvent({
      db: input.db,
      timestamp: status.latestPackageManifest.receivedAt ?? timestamp,
      source: "transport",
      eventType: "sealed_manifest_received",
      sessionId: status.latestPackageManifest.sessionId,
      planHash: status.latestPackageManifest.planHash,
      packageId: status.latestPackageManifest.packageId,
      packageHash: status.latestPackageManifest.packageHash,
      success: true,
      direction: "inbound",
      transportMessageType: "lucidtlr.watch.package.manifest",
      deliveryMethod: "transferUserInfo",
    });
  }

  if (status.latestReceivedPackage) {
    await appendWatchModeLabDebugEvent({
      db: input.db,
      timestamp: status.latestReceivedPackage.receivedAt ?? timestamp,
      source: "transport",
      eventType: "package_file_received",
      sessionId: status.latestReceivedPackage.sessionId,
      planHash: status.latestReceivedPackage.planHash,
      packageId: status.latestReceivedPackage.packageId,
      packageHash: status.latestReceivedPackage.packageHash,
      success: true,
      direction: "inbound",
      transportMessageType: "lucidtlr.watch.package.file",
      deliveryMethod: "transferFile",
    });
  }

  if (status.latestAck) {
    await appendWatchModeLabDebugEvent({
      db: input.db,
      timestamp: status.latestAck.ackedAt ?? timestamp,
      source: "transport",
      eventType: "ack_recorded",
      sessionId: status.latestAck.sessionId,
      planHash: status.latestAck.planHash,
      packageId: status.latestAck.packageId,
      packageHash: status.latestAck.packageHash,
      success: true,
      direction: "inbound",
      transportMessageType: "lucidtlr.watch.package.ack",
      deliveryMethod: "transferUserInfo",
    });
  }

  if (status.lastError) {
    await appendWatchModeLabDebugEvent({
      db: input.db,
      timestamp,
      source: "transport",
      eventType: "transport_error",
      success: false,
      errorMessage: status.lastError,
    });
  }
}
