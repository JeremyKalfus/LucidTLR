import type { LocalDb } from "@/src/data/local/localDb";
import {
  loadRecentWatchSyncPackageImports,
  type WatchSyncPackageImportRecord,
} from "@/src/data/local/repositories";
import { WATCH_MODE_ENABLED } from "@/src/features/watchMode/watchModeAvailability";
import {
  loadWatchModeLabRecoverySummary,
  type WatchModeLabPackageImportSummary,
  type WatchModeLabPackageValidationSummary,
  type WatchModeLabPlanSummary,
  type WatchModeLabRecoverySummary,
} from "@/src/features/watchModeLab/watchModeLab";
import {
  WATCH_SESSION_SYNC_STATUS_PRECEDENCE,
  loadRecentWatchSessionSyncStates,
  loadUnresolvedWatchSessionSyncStates,
  type WatchSessionSyncState,
} from "@/src/features/watchSync/watchSessionSyncState";
import {
  internalLabBuildInfo,
  isWatchModeLabAvailable,
} from "@/src/features/internalBuild/internalBuildFlags";
import {
  appendWatchModeLabDebugEvent,
  loadRecentWatchModeLabDebugEvents,
  WATCH_MODE_LAB_DEBUG_EVENT_LIMIT,
  type WatchModeLabDebugEvent,
  type WatchModeLabTimelineSource,
  type WatchModeLabTransportDirection,
} from "@/src/features/watchModeLab/watchModeLabDebugEvents";
import {
  watchTransport,
  type NativeWatchTransportStatus,
} from "@/src/native/watchTransport";

export const WATCH_MODE_LAB_DEBUG_BUNDLE_SCHEMA_VERSION =
  "watch-mode-lab-debug-bundle-v1";

type InternalLabBuildInfo = ReturnType<typeof internalLabBuildInfo>;
export type WatchModeLabFinalDrillStatus = "pass" | "fail" | "incomplete";
const PACKAGE_IMPORT_RECORD_LIMIT = 20;

export interface WatchModeLabActionLogEntry {
  at: string;
  action: string;
  result: "ok" | "error";
  message: string;
  details?: Record<string, unknown>;
}

export interface WatchModeLabTimelineEvent {
  timestamp: string;
  source: WatchModeLabTimelineSource;
  eventType: string;
  action: string;
  sessionId?: string;
  planHash?: string;
  planHashPrefix?: string;
  packageId?: string;
  packageHash?: string;
  packageHashPrefix?: string;
  previousStatus?: string;
  nextStatus?: string;
  direction?: WatchModeLabTransportDirection;
  messageId?: string;
  transportMessageType?: string;
  deliveryMethod?: string;
  success: boolean;
  errorMessage?: string;
  metadata: Record<string, unknown>;
}

export interface WatchModeLabStateTransition {
  timestamp: string;
  sessionId?: string;
  packageId?: string;
  packageHash?: string;
  eventApplied: string;
  previousStatus?: string;
  nextStatus?: string;
  ignoredAsStale: boolean;
  rejected: boolean;
  rejectionReason?: string;
  planHashCheck?: string;
  packageHashCheck?: string;
}

export interface WatchModeLabTransportMessageSummary {
  messageId?: string;
  type: string;
  direction?: WatchModeLabTransportDirection;
  createdAt?: string;
  receivedAt?: string;
  sentAt?: string;
  sessionId?: string;
  planHash?: string;
  planHashPrefix?: string;
  packageId?: string;
  packageHash?: string;
  packageHashPrefix?: string;
  deliveryMethod?: string;
  success: boolean;
  errorMessage?: string;
}

export interface WatchModeLabPackageFlowRecord {
  packageId: string;
  sessionId?: string;
  planHash?: string;
  planHashPrefix?: string;
  packageHash?: string;
  packageHashPrefix?: string;
  manifestCounts?: WatchModeLabPackageDebugRecord["manifestSummary"];
  receivedAt?: string;
  importStartedAt?: string;
  importCompletedAt?: string;
  importStatus?:
    | WatchModeLabPackageDebugRecord["importStatus"]
    | "already_imported";
  ackEligibleAt?: string;
  ackSentAt?: string;
  ackRecordedAt?: string;
  retryCount: number;
  duplicateImportSeen: boolean;
  finalState?: string;
}

export interface WatchModeLabDrillAssessment {
  finalDrillStatus: WatchModeLabFinalDrillStatus;
  failureReasons: string[];
  unresolvedCount: number;
  publicWatchModeDisabled: boolean;
  labEnabled: boolean;
  transportActivated: boolean;
  planStagedSeen: boolean;
  commitReceiptSeen: boolean;
  transportCommitReceiptSeen: boolean;
  phoneReloadRecoverySeen: boolean;
  packageReceivedSeen: boolean;
  transportPackageReceivedSeen: boolean;
  packageImportedSeen: boolean;
  fixtureImportSeen: boolean;
  ackEligibleSeen: boolean;
  ackRecordedSeen: boolean;
  duplicateRetrySeen: boolean;
  recoverySimulationSeen: boolean;
  stateRegressionDetected: boolean;
  mismatchedHashDetected: boolean;
  finalUnresolvedStateBlocksStart: boolean;
}

export interface WatchModeLabDebugBundle {
  schemaVersion: typeof WATCH_MODE_LAB_DEBUG_BUNDLE_SCHEMA_VERSION;
  exportedAt: string;
  app: {
    name: "LucidTLR";
    version?: string;
    buildNumber?: string;
    runtime?: string;
    labEnabled: boolean;
    watchModeEnabled: boolean;
    buildProfile?: string;
    isInternalLabAvailable: boolean;
  };
  drill: {
    label: "synthetic-watchconnectivity-transport";
    instructionsVersion: "internal-testflight-watch-mode-lab-2026-06-08";
    userNotes?: string;
  };
  phone: {
    participantId?: string;
    selectedMode?: string;
  };
  lab: {
    latestMessage?: string;
    actionLog: WatchModeLabActionLogEntry[];
    latestPlanSummary?: WatchModeLabPlanSummary | null;
    latestImportSummary?: WatchModeLabPackageImportSummary | null;
    latestValidationSummary?: WatchModeLabPackageValidationSummary | null;
  };
  timeline: WatchModeLabTimelineEvent[];
  stateTransitions: WatchModeLabStateTransition[];
  transportMessages: WatchModeLabTransportMessageSummary[];
  packageFlow: WatchModeLabPackageFlowRecord[];
  drillAssessment: WatchModeLabDrillAssessment;
  transport: {
    available: boolean;
    status?: NativeWatchTransportStatus | null;
    latestError?: string;
    activationState?: string;
    paired?: boolean;
    watchAppInstalled?: boolean;
    reachable?: boolean;
    lastMessageType?: string;
    lastMessageAt?: string;
  };
  syncLedger: {
    unresolvedStates: WatchSessionSyncState[];
    recentStates: WatchSessionSyncState[];
    recoveryPresentation?: WatchModeLabRecoverySummary;
  };
  imports: {
    packages: WatchModeLabPackageDebugRecord[];
    latestImport?: WatchModeLabPackageDebugRecord | null;
    latestAckEligible?: boolean;
  };
  summaries: {
    passFailHints: {
      publicWatchModeDisabled: boolean;
      unresolvedStatePresent: boolean;
      importedPackagePresent: boolean;
      ackEligibleSeen: boolean;
      ackRecordedSeen: boolean;
      transportErrorSeen: boolean;
      transportCommitReceiptSeen: boolean;
      transportPackageReceivedSeen: boolean;
      fixtureImportSeen: boolean;
      recoverySimulationSeen: boolean;
      stateRegressionDetected: boolean;
    };
    unresolvedCount: number;
    ackRecordedSeen: boolean;
    finalDrillStatus: WatchModeLabFinalDrillStatus;
    failureReasons: string[];
  };
  diagnostics: {
    generatedBy: "phone-lab";
    warnings: string[];
    limitations: string[];
  };
  raw: {
    labActions: WatchModeLabTimelineEvent[];
    syncLedgerEvents: WatchModeLabStateTransition[];
    transportMessages: WatchModeLabTransportMessageSummary[];
    packageImportRecords: WatchModeLabPackageDebugRecord[];
    currentUnresolvedStates: WatchSessionSyncState[];
    currentRecentStates: WatchSessionSyncState[];
  };
}

export interface WatchModeLabDebugBundleInput {
  db: LocalDb;
  participantId?: string;
  selectedMode?: string;
  latestMessage?: string;
  latestPlanSummary?: WatchModeLabPlanSummary | null;
  latestImportSummary?: WatchModeLabPackageImportSummary | null;
  latestValidationSummary?: WatchModeLabPackageValidationSummary | null;
  transportStatus?: NativeWatchTransportStatus | null;
  actionLog?: WatchModeLabActionLogEntry[];
  exportedAt?: string;
}

export interface WatchModeLabDebugBundleParts {
  exportedAt: string;
  buildInfo: InternalLabBuildInfo;
  participantId?: string;
  selectedMode?: string;
  latestMessage?: string;
  latestPlanSummary?: WatchModeLabPlanSummary | null;
  latestImportSummary?: WatchModeLabPackageImportSummary | null;
  latestValidationSummary?: WatchModeLabPackageValidationSummary | null;
  transportStatus?: NativeWatchTransportStatus | null;
  actionLog?: WatchModeLabActionLogEntry[];
  unresolvedStates: WatchSessionSyncState[];
  recentStates: WatchSessionSyncState[];
  packages: WatchSyncPackageImportRecord[];
  recoveryPresentation: WatchModeLabRecoverySummary;
  debugEvents: WatchModeLabDebugEvent[];
}

export interface WatchModeLabPackageDebugRecord {
  packageId: string;
  sessionId: string;
  planHash: string;
  packageHash: string;
  sealedAt: string;
  importedAt?: string;
  importStatus: WatchSyncPackageImportRecord["importStatus"];
  importError?: string;
  manifestSummary?: {
    schemaVersion?: string;
    eventCount?: number;
    epochCount?: number;
    cueEventCount?: number;
    movementEventCount?: number;
  };
}

function manifestSummary(
  manifestJson: string,
): WatchModeLabPackageDebugRecord["manifestSummary"] {
  try {
    const manifest = JSON.parse(manifestJson) as {
      schemaVersion?: string;
      eventCount?: number;
      epochCount?: number;
      cueEventCount?: number;
      movementEventCount?: number;
    };

    return {
      schemaVersion: manifest.schemaVersion,
      eventCount: manifest.eventCount,
      epochCount: manifest.epochCount,
      cueEventCount: manifest.cueEventCount,
      movementEventCount: manifest.movementEventCount,
    };
  } catch {
    return undefined;
  }
}

function summarizePackage(
  record: WatchSyncPackageImportRecord,
): WatchModeLabPackageDebugRecord {
  return {
    packageId: record.packageId,
    sessionId: record.sessionId,
    planHash: record.planHash,
    packageHash: record.packageHash,
    sealedAt: record.sealedAt,
    importedAt: record.importedAt,
    importStatus: record.importStatus,
    importError: record.importError,
    manifestSummary: manifestSummary(record.manifestJson),
  };
}

function debugWarnings(input: {
  transportStatus?: NativeWatchTransportStatus | null;
  unresolvedStates: WatchSessionSyncState[];
}): string[] {
  const warnings = [
    "Synthetic/internal lab export only.",
    "Local export only; no automatic upload is performed.",
    "Public Watch Mode remains disabled.",
  ];

  if (!input.transportStatus?.latestStatusSnapshot) {
    warnings.push(
      "Watch-local status snapshot has not been received; package import and ack fields remain phone-ledger evidence.",
    );
  }

  if (input.unresolvedStates.length > 0) {
    warnings.push("Unresolved Watch sync state remains on the phone ledger.");
  }

  return warnings;
}

const DEBUG_EXPORT_LIMITATIONS = [
  "Synthetic lab only.",
  "No real HR, motion, or REM validation.",
  "No real haptics or audio validation.",
  "No overnight validation.",
  "No automatic upload.",
  "Dream journal content is excluded.",
  "Raw high-rate motion is excluded.",
  "Supabase tokens, Apple credentials, API keys, and raw device identifiers are excluded.",
  "Public Watch Mode remains disabled.",
] as const;

const PRIVATE_EXPORT_METADATA_KEY_FRAGMENTS = [
  "authorization",
  "credential",
  "password",
  "secret",
  "token",
  "apikey",
  "appleid",
  "deviceidentifier",
  "deviceid",
] as const;

function hashPrefix(value?: string): string | undefined {
  return value ? value.slice(0, 12) : undefined;
}

function bounded<T>(items: T[], limit: number): T[] {
  return items.slice(Math.max(0, items.length - limit));
}

function sanitizeExportMetadata(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.slice(0, 20).map(sanitizeExportMetadata);
  }

  if (value && typeof value === "object") {
    const sanitized: Record<string, unknown> = {};

    for (const [key, childValue] of Object.entries(
      value as Record<string, unknown>,
    )) {
      const normalized = key.toLowerCase();
      const privateKey = PRIVATE_EXPORT_METADATA_KEY_FRAGMENTS.some((fragment) =>
        normalized.includes(fragment),
      );

      sanitized[key] = privateKey
        ? "[redacted]"
        : sanitizeExportMetadata(childValue);
    }

    return sanitized;
  }

  if (typeof value === "string" && value.length > 240) {
    return `${value.slice(0, 240)}...`;
  }

  return value;
}

function sanitizedRecord(
  metadata?: Record<string, unknown>,
): Record<string, unknown> {
  return sanitizeExportMetadata(metadata ?? {}) as Record<string, unknown>;
}

function actionLogEvent(entry: WatchModeLabActionLogEntry): WatchModeLabTimelineEvent {
  const details = sanitizedRecord(entry.details);
  const sessionId =
    typeof details.sessionId === "string" ? details.sessionId : undefined;
  const planHash =
    typeof details.planHash === "string" ? details.planHash : undefined;
  const packageId =
    typeof details.packageId === "string" ? details.packageId : undefined;
  const packageHash =
    typeof details.packageHash === "string" ? details.packageHash : undefined;

  return {
    timestamp: entry.at,
    source: "phone_lab",
    eventType: entry.action,
    action: entry.action,
    sessionId,
    planHash,
    planHashPrefix: hashPrefix(planHash),
    packageId,
    packageHash,
    packageHashPrefix: hashPrefix(packageHash),
    success: entry.result === "ok",
    errorMessage: entry.result === "error" ? entry.message : undefined,
    metadata: {
      message: entry.message,
      ...details,
    },
  };
}

function debugEventToTimelineEvent(
  event: WatchModeLabDebugEvent,
): WatchModeLabTimelineEvent {
  return {
    timestamp: event.timestamp,
    source: event.source,
    eventType: event.eventType,
    action: event.eventType,
    sessionId: event.sessionId,
    planHash: event.planHash,
    planHashPrefix: hashPrefix(event.planHash),
    packageId: event.packageId,
    packageHash: event.packageHash,
    packageHashPrefix: hashPrefix(event.packageHash),
    previousStatus: event.previousStatus,
    nextStatus: event.nextStatus,
    direction: event.direction,
    messageId: event.messageId,
    transportMessageType: event.transportMessageType,
    deliveryMethod: event.deliveryMethod,
    success: event.success,
    errorMessage: event.errorMessage,
    metadata: sanitizedRecord({
      ...event.metadata,
      messageId: event.messageId,
      direction: event.direction,
      transportMessageType: event.transportMessageType,
      deliveryMethod: event.deliveryMethod,
    }),
  };
}

function buildTimeline(input: {
  debugEvents: WatchModeLabDebugEvent[];
  actionLog?: WatchModeLabActionLogEntry[];
}): WatchModeLabTimelineEvent[] {
  const events = [
    ...input.debugEvents.map(debugEventToTimelineEvent),
    ...(input.actionLog ?? []).map(actionLogEvent),
  ].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const uniqueEvents = new Map<string, WatchModeLabTimelineEvent>();

  for (const event of events) {
    const key = [
      event.timestamp,
      event.source,
      event.eventType,
      event.sessionId ?? "",
      event.packageId ?? "",
      event.previousStatus ?? "",
      event.nextStatus ?? "",
      event.success ? "ok" : "error",
    ].join("|");

    if (!uniqueEvents.has(key)) {
      uniqueEvents.set(key, event);
    }
  }

  return bounded(Array.from(uniqueEvents.values()), WATCH_MODE_LAB_DEBUG_EVENT_LIMIT);
}

function metadataString(
  metadata: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = metadata[key];

  return typeof value === "string" ? value : undefined;
}

function metadataBoolean(
  metadata: Record<string, unknown>,
  key: string,
): boolean {
  return metadata[key] === true;
}

function buildStateTransitions(
  timeline: WatchModeLabTimelineEvent[],
): WatchModeLabStateTransition[] {
  return bounded(
    timeline
      .filter(
        (event) =>
          event.source === "sync_ledger" &&
          event.eventType === "state_transition",
      )
      .map((event) => ({
        timestamp: event.timestamp,
        sessionId: event.sessionId,
        packageId: event.packageId,
        packageHash: event.packageHash,
        eventApplied:
          metadataString(event.metadata, "eventApplied") ?? event.eventType,
        previousStatus: event.previousStatus,
        nextStatus: event.nextStatus,
        ignoredAsStale: metadataBoolean(event.metadata, "ignoredAsStale"),
        rejected: metadataBoolean(event.metadata, "rejected") || !event.success,
        rejectionReason:
          event.errorMessage ?? metadataString(event.metadata, "rejectionReason"),
        planHashCheck: metadataString(event.metadata, "planHashCheck"),
        packageHashCheck: metadataString(event.metadata, "packageHashCheck"),
      })),
    WATCH_MODE_LAB_DEBUG_EVENT_LIMIT,
  );
}

function buildTransportMessages(
  timeline: WatchModeLabTimelineEvent[],
): WatchModeLabTransportMessageSummary[] {
  return bounded(
    timeline
      .filter(
        (event) => typeof event.transportMessageType !== "undefined",
      )
      .map((event) => ({
        messageId: event.messageId,
        type: event.transportMessageType ?? event.eventType,
        direction: event.direction,
        createdAt: metadataString(event.metadata, "createdAt") ?? event.timestamp,
        receivedAt: event.direction === "inbound" ? event.timestamp : undefined,
        sentAt: event.direction === "outbound" ? event.timestamp : undefined,
        sessionId: event.sessionId,
        planHash: event.planHash,
        planHashPrefix: event.planHashPrefix,
        packageId: event.packageId,
        packageHash: event.packageHash,
        packageHashPrefix: event.packageHashPrefix,
        deliveryMethod:
          event.deliveryMethod ?? metadataString(event.metadata, "method"),
        success: event.success,
        errorMessage: event.errorMessage,
      })),
    WATCH_MODE_LAB_DEBUG_EVENT_LIMIT,
  );
}

function packageKey(input: {
  packageId?: string;
  sessionId?: string;
  packageHash?: string;
}): string {
  return input.packageId ?? input.packageHash ?? input.sessionId ?? "unknown";
}

function ensurePackageFlow(
  records: Map<string, WatchModeLabPackageFlowRecord>,
  input: {
    packageId?: string;
    sessionId?: string;
    planHash?: string;
    packageHash?: string;
  },
): WatchModeLabPackageFlowRecord {
  const key = packageKey(input);
  const existing = records.get(key);

  if (existing) {
    existing.sessionId = existing.sessionId ?? input.sessionId;
    existing.planHash = existing.planHash ?? input.planHash;
    existing.planHashPrefix = existing.planHashPrefix ?? hashPrefix(input.planHash);
    existing.packageHash = existing.packageHash ?? input.packageHash;
    existing.packageHashPrefix =
      existing.packageHashPrefix ?? hashPrefix(input.packageHash);
    return existing;
  }

  const next: WatchModeLabPackageFlowRecord = {
    packageId: input.packageId ?? key,
    sessionId: input.sessionId,
    planHash: input.planHash,
    planHashPrefix: hashPrefix(input.planHash),
    packageHash: input.packageHash,
    packageHashPrefix: hashPrefix(input.packageHash),
    retryCount: 0,
    duplicateImportSeen: false,
  };

  records.set(key, next);
  return next;
}

function buildPackageFlow(input: {
  packages: WatchModeLabPackageDebugRecord[];
  timeline: WatchModeLabTimelineEvent[];
  recentStates: WatchSessionSyncState[];
}): WatchModeLabPackageFlowRecord[] {
  const records = new Map<string, WatchModeLabPackageFlowRecord>();

  for (const state of input.recentStates) {
    if (!state.packageId && !state.packageHash) {
      continue;
    }

    const record = ensurePackageFlow(records, {
      packageId: state.packageId,
      sessionId: state.sessionId,
      planHash: state.planHash,
      packageHash: state.packageHash,
    });

    record.receivedAt = record.receivedAt ?? state.sealedAt;
    record.importCompletedAt = record.importCompletedAt ?? state.importedAt;
    record.ackEligibleAt = record.ackEligibleAt ?? state.ackEligibleAt;
    record.ackSentAt = record.ackSentAt ?? state.ackSentAt;
    record.ackRecordedAt =
      record.ackRecordedAt ??
      (state.status === "ack_recorded" ? state.ackSentAt : undefined);
    record.finalState = state.status;
  }

  for (const pkg of input.packages) {
    const record = ensurePackageFlow(records, {
      packageId: pkg.packageId,
      sessionId: pkg.sessionId,
      planHash: pkg.planHash,
      packageHash: pkg.packageHash,
    });

    record.manifestCounts = record.manifestCounts ?? pkg.manifestSummary;
    record.receivedAt = record.receivedAt ?? pkg.sealedAt;
    record.importCompletedAt = record.importCompletedAt ?? pkg.importedAt;
    record.importStatus = pkg.importStatus;
  }

  for (const event of input.timeline) {
    if (!event.packageId && !event.packageHash) {
      continue;
    }

    const record = ensurePackageFlow(records, {
      packageId: event.packageId,
      sessionId: event.sessionId,
      planHash: event.planHash,
      packageHash: event.packageHash,
    });

    if (
      event.eventType === "sealed_manifest_received" ||
      event.eventType === "package_file_received"
    ) {
      record.receivedAt = record.receivedAt ?? event.timestamp;
    }

    if (event.eventType === "package_import_started") {
      record.importStartedAt = record.importStartedAt ?? event.timestamp;
      record.retryCount += record.importStartedAt === event.timestamp ? 0 : 1;
    }

    if (
      event.eventType === "package_import_succeeded" ||
      event.eventType === "package_import_failed"
    ) {
      record.importCompletedAt = event.timestamp;
      record.importStatus =
        (metadataString(event.metadata, "importStatus") as
          | WatchModeLabPackageFlowRecord["importStatus"]
          | undefined) ?? (event.success ? "imported" : "import_failed");
      record.duplicateImportSeen =
        record.duplicateImportSeen ||
        metadataBoolean(event.metadata, "duplicateImportSeen") ||
        record.importStatus === "already_imported";
    }

    if (event.eventType === "ack_became_eligible") {
      record.ackEligibleAt = record.ackEligibleAt ?? event.timestamp;
    }

    if (event.eventType === "ack_sent") {
      record.ackSentAt = record.ackSentAt ?? event.timestamp;
    }

    if (event.eventType === "ack_recorded") {
      record.ackRecordedAt = record.ackRecordedAt ?? event.timestamp;
    }
  }

  return bounded(
    Array.from(records.values()).sort((a, b) =>
      (a.receivedAt ?? a.importCompletedAt ?? "").localeCompare(
        b.receivedAt ?? b.importCompletedAt ?? "",
      ),
    ),
    PACKAGE_IMPORT_RECORD_LIMIT,
  );
}

function knownStatus(
  status?: string,
): status is WatchSessionSyncState["status"] {
  return Boolean(
    status &&
      Object.prototype.hasOwnProperty.call(
        WATCH_SESSION_SYNC_STATUS_PRECEDENCE,
        status,
      ),
  );
}

function transitionRegressed(
  transition: WatchModeLabStateTransition,
): boolean {
  if (
    !knownStatus(transition.previousStatus) ||
    !knownStatus(transition.nextStatus)
  ) {
    return false;
  }

  return (
    WATCH_SESSION_SYNC_STATUS_PRECEDENCE[transition.nextStatus] <
    WATCH_SESSION_SYNC_STATUS_PRECEDENCE[transition.previousStatus]
  );
}

function hashMismatchSeen(input: {
  timeline: WatchModeLabTimelineEvent[];
  stateTransitions: WatchModeLabStateTransition[];
}): boolean {
  const rejectedHashTransition = input.stateTransitions.some((transition) => {
    const reason = transition.rejectionReason?.toLowerCase() ?? "";

    return (
      transition.rejected &&
      (reason.includes("hash mismatch") ||
        reason.includes("package mismatch") ||
        transition.planHashCheck === "rejected" ||
        transition.packageHashCheck === "rejected")
    );
  });
  const timelineHashError = input.timeline.some((event) => {
    const message = event.errorMessage?.toLowerCase() ?? "";

    return (
      !event.success &&
      (message.includes("hash mismatch") ||
        message.includes("sha256") ||
        message.includes("package mismatch"))
    );
  });

  return rejectedHashTransition || timelineHashError;
}

function hasRegressedImportedState(state: WatchSessionSyncState): boolean {
  const importedEvidence = Boolean(state.importedAt || state.ackEligibleAt);

  return (
    importedEvidence &&
    WATCH_SESSION_SYNC_STATUS_PRECEDENCE[state.status] <
      WATCH_SESSION_SYNC_STATUS_PRECEDENCE.phone_imported_ack_eligible
  );
}

function hasRegressedAckState(state: WatchSessionSyncState): boolean {
  const ackEvidence = Boolean(state.ackSentAt);

  return (
    ackEvidence &&
    WATCH_SESSION_SYNC_STATUS_PRECEDENCE[state.status] <
      WATCH_SESSION_SYNC_STATUS_PRECEDENCE.ack_recorded
  );
}

function isTerminalExportStatus(status?: string): boolean {
  return (
    status === "ack_recorded" ||
    status === "completed" ||
    status === "abandoned_local_only"
  );
}

function isUnresolvedExportStatus(status?: string): boolean {
  return Boolean(
    knownStatus(status) &&
      status !== "ack_recorded" &&
      status !== "completed" &&
      status !== "abandoned_local_only",
  );
}

function transitionPackageKey(input: {
  sessionId?: string;
  packageId?: string;
  packageHash?: string;
}): string | null {
  if (!input.sessionId) {
    return null;
  }

  return [
    input.sessionId,
    input.packageId ?? input.packageHash ?? "no-package",
  ].join("|");
}

function statePackageKey(state: WatchSessionSyncState): string {
  return [
    state.sessionId,
    state.packageId ?? state.packageHash ?? "no-package",
  ].join("|");
}

function terminalThenUnresolvedStateSeen(input: {
  stateTransitions: WatchModeLabStateTransition[];
  unresolvedStates: WatchSessionSyncState[];
}): boolean {
  const terminalKeys = new Set<string>();
  const transitions = [...input.stateTransitions].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );

  for (const transition of transitions) {
    const key = transitionPackageKey(transition);

    if (!key || transition.rejected) {
      continue;
    }

    if (isTerminalExportStatus(transition.nextStatus)) {
      terminalKeys.add(key);
      continue;
    }

    if (
      terminalKeys.has(key) &&
      isUnresolvedExportStatus(transition.nextStatus)
    ) {
      return true;
    }
  }

  return input.unresolvedStates.some((state) =>
    terminalKeys.has(statePackageKey(state)),
  );
}

function isTransportCommitReceiptEvent(
  event: WatchModeLabTimelineEvent,
): boolean {
  return (
    event.source === "transport" &&
    event.direction === "inbound" &&
    (event.eventType === "watch_commit_receipt_received" ||
      event.transportMessageType === "lucidtlr.watch.plan.commit.receipt")
  );
}

function isTransportPackageReceivedEvent(
  event: WatchModeLabTimelineEvent,
): boolean {
  return (
    event.source === "transport" &&
    event.direction === "inbound" &&
    (event.eventType === "sealed_manifest_received" ||
      event.eventType === "package_file_received" ||
      event.transportMessageType === "lucidtlr.watch.package.manifest" ||
      event.transportMessageType === "lucidtlr.watch.package.file")
  );
}

function isFixtureImportEvent(event: WatchModeLabTimelineEvent): boolean {
  return (
    metadataBoolean(event.metadata, "syntheticFixture") ||
    event.eventType.startsWith("import_fixture:") ||
    event.eventType.startsWith("reimport_fixture:")
  );
}

function isRecoverySimulationEvent(event: WatchModeLabTimelineEvent): boolean {
  return (
    event.eventType.startsWith("recovery:") ||
    event.eventType === "phone_reload_recovery_simulated" ||
    metadataBoolean(event.metadata, "syntheticRecoveryAction")
  );
}

function failureReasons(input: {
  publicWatchModeDisabled: boolean;
  unresolvedStates: WatchSessionSyncState[];
  importedPackagePresent: boolean;
  ackEligibleSeen: boolean;
  ackRecordedSeen: boolean;
  transportErrorSeen: boolean;
  transportCommitReceiptSeen: boolean;
  transportPackageReceivedSeen: boolean;
  fixtureImportSeen: boolean;
  recoverySimulationSeen: boolean;
  stateRegressionDetected: boolean;
}): string[] {
  const reasons: string[] = [];

  if (!input.publicWatchModeDisabled) {
    reasons.push("Public Watch Mode is unexpectedly enabled.");
  }

  if (input.transportErrorSeen) {
    reasons.push("Transport error was reported.");
  }

  if (input.stateRegressionDetected) {
    reasons.push(
      "A terminal ack/completed state was followed by an unresolved state for the same Watch package/session.",
    );
  }

  if (!input.transportCommitReceiptSeen) {
    reasons.push("No real WatchConnectivity commit receipt was observed.");
  }

  if (!input.transportPackageReceivedSeen) {
    reasons.push("No real WatchConnectivity package manifest/file receipt was observed.");
  }

  if (!input.importedPackagePresent) {
    reasons.push("No imported Watch package record is present.");
  }

  if (!input.ackEligibleSeen) {
    reasons.push("Ack eligibility was not observed after import.");
  }

  if (!input.ackRecordedSeen) {
    reasons.push("Matching ack was not recorded.");
  }

  if (input.unresolvedStates.length > 0) {
    reasons.push("Unresolved Watch sync state remains on the phone ledger.");
  }

  if (
    input.fixtureImportSeen &&
    (!input.transportCommitReceiptSeen || !input.transportPackageReceivedSeen)
  ) {
    reasons.push(
      "Fixture import tests were observed, but they do not prove the real WatchConnectivity loop.",
    );
  }

  if (
    input.recoverySimulationSeen &&
    (!input.transportCommitReceiptSeen || !input.transportPackageReceivedSeen)
  ) {
    reasons.push(
      "Recovery simulation controls were used, but they do not prove real WatchConnectivity transport.",
    );
  }

  for (const state of input.unresolvedStates) {
    if (hasRegressedImportedState(state)) {
      reasons.push(
        `State ${state.sessionId} has import/ack eligibility timestamps but regressed status ${state.status}.`,
      );
    }

    if (hasRegressedAckState(state)) {
      reasons.push(
        `State ${state.sessionId} has ack timestamp evidence but regressed status ${state.status}.`,
      );
    }
  }

  return Array.from(new Set(reasons));
}

function finalDrillStatus(input: {
  publicWatchModeDisabled: boolean;
  unresolvedStates: WatchSessionSyncState[];
  importedPackagePresent: boolean;
  ackEligibleSeen: boolean;
  ackRecordedSeen: boolean;
  transportErrorSeen: boolean;
  transportCommitReceiptSeen: boolean;
  transportPackageReceivedSeen: boolean;
  stateRegressionDetected: boolean;
}): WatchModeLabFinalDrillStatus {
  const regressedStateSeen = input.unresolvedStates.some(
    (state) => hasRegressedImportedState(state) || hasRegressedAckState(state),
  );
  const hardFailureSeen =
    !input.publicWatchModeDisabled ||
    input.transportErrorSeen ||
    input.stateRegressionDetected ||
    regressedStateSeen ||
    (input.ackRecordedSeen && input.unresolvedStates.length > 0);

  if (hardFailureSeen) {
    return "fail";
  }

  if (
    input.publicWatchModeDisabled &&
    input.unresolvedStates.length === 0 &&
    input.importedPackagePresent &&
    input.ackEligibleSeen &&
    input.ackRecordedSeen &&
    input.transportCommitReceiptSeen &&
    input.transportPackageReceivedSeen
  ) {
    return "pass";
  }

  return "incomplete";
}

function buildDrillAssessment(input: {
  buildInfo: InternalLabBuildInfo;
  timeline: WatchModeLabTimelineEvent[];
  stateTransitions: WatchModeLabStateTransition[];
  recoveryPresentation: WatchModeLabRecoverySummary;
  publicWatchModeDisabled: boolean;
  unresolvedStates: WatchSessionSyncState[];
  importedPackagePresent: boolean;
  ackEligibleSeen: boolean;
  ackRecordedSeen: boolean;
  transportErrorSeen: boolean;
  transportCommitReceiptSeen: boolean;
  transportPackageReceivedSeen: boolean;
  fixtureImportSeen: boolean;
  recoverySimulationSeen: boolean;
  stateRegressionDetected: boolean;
  transportStatus?: NativeWatchTransportStatus | null;
  drillFailureReasons: string[];
  drillStatus: WatchModeLabFinalDrillStatus;
}): WatchModeLabDrillAssessment {
  const eventTypes = new Set(input.timeline.map((event) => event.eventType));
  const transitionEvents = new Set(
    input.stateTransitions.map((transition) => transition.eventApplied),
  );
  const duplicateRetrySeen = input.timeline.some(
    (event) =>
      event.eventType.toLowerCase().includes("duplicate") ||
      event.eventType.toLowerCase().includes("reimport") ||
      metadataBoolean(event.metadata, "duplicateImportSeen") ||
      metadataString(event.metadata, "importStatus") === "already_imported",
  );

  return {
    finalDrillStatus: input.drillStatus,
    failureReasons: input.drillFailureReasons,
    unresolvedCount: input.unresolvedStates.length,
    publicWatchModeDisabled: input.publicWatchModeDisabled,
    labEnabled: input.buildInfo.labAvailable,
    transportActivated:
      eventTypes.has("transport_activated") ||
      input.transportStatus?.activationState === "activated",
    planStagedSeen:
      eventTypes.has("plan_staged") ||
      transitionEvents.has("plan_staged") ||
      input.recoveryPresentation.states.some(
        (state) =>
          WATCH_SESSION_SYNC_STATUS_PRECEDENCE[state.status] >=
          WATCH_SESSION_SYNC_STATUS_PRECEDENCE.plan_staged,
      ),
    commitReceiptSeen: input.transportCommitReceiptSeen,
    transportCommitReceiptSeen: input.transportCommitReceiptSeen,
    phoneReloadRecoverySeen:
      eventTypes.has("phone_reload_recovery_tested") ||
      eventTypes.has("phone_reload_recovery_simulated") ||
      eventTypes.has("recovery:reload") ||
      input.timeline.some((event) =>
        event.eventType.toLowerCase().includes("reload"),
      ),
    packageReceivedSeen: input.transportPackageReceivedSeen,
    transportPackageReceivedSeen: input.transportPackageReceivedSeen,
    packageImportedSeen: input.importedPackagePresent,
    fixtureImportSeen: input.fixtureImportSeen,
    ackEligibleSeen: input.ackEligibleSeen,
    ackRecordedSeen: input.ackRecordedSeen,
    duplicateRetrySeen,
    recoverySimulationSeen: input.recoverySimulationSeen,
    stateRegressionDetected: input.stateRegressionDetected,
    mismatchedHashDetected: hashMismatchSeen({
      timeline: input.timeline,
      stateTransitions: input.stateTransitions,
    }),
    finalUnresolvedStateBlocksStart:
      input.recoveryPresentation.blocksFutureWatchStart,
  };
}

export function buildWatchModeLabDebugBundle(
  input: WatchModeLabDebugBundleParts,
): WatchModeLabDebugBundle {
  const packages = input.packages.map(summarizePackage);
  const timeline = buildTimeline({
    debugEvents: input.debugEvents,
    actionLog: input.actionLog,
  });
  const stateTransitions = buildStateTransitions(timeline);
  const transportMessages = buildTransportMessages(timeline);
  const packageFlow = buildPackageFlow({
    packages,
    timeline,
    recentStates: input.recentStates,
  });
  const importedPackagePresent = packages.some(
    (record) => record.importStatus === "imported",
  ) || packageFlow.some(
    (record) =>
      record.importStatus === "imported" ||
      record.importStatus === "already_imported",
  );
  const transportCommitReceiptSeen =
    timeline.some(isTransportCommitReceiptEvent) ||
    Boolean(input.transportStatus?.latestCommitReceipt);
  const transportPackageReceivedSeen =
    timeline.some(isTransportPackageReceivedEvent) ||
    Boolean(input.transportStatus?.latestReceivedPackage) ||
    Boolean(input.transportStatus?.latestPackageManifest);
  const fixtureImportSeen = timeline.some(isFixtureImportEvent);
  const recoverySimulationSeen = timeline.some(isRecoverySimulationEvent);
  const ackEligibleSeen =
    input.latestImportSummary?.ackEligible === true ||
    input.recentStates.some(
      (state) =>
        state.status === "phone_imported_ack_eligible" ||
        state.status === "ack_recorded",
    ) ||
    packageFlow.some((record) => Boolean(record.ackEligibleAt)) ||
    timeline.some((event) => event.eventType === "ack_became_eligible");
  const ackRecordedSeen =
    input.recentStates.some((state) => state.status === "ack_recorded") ||
    Boolean(input.transportStatus?.latestAck) ||
    packageFlow.some((record) => Boolean(record.ackRecordedAt)) ||
    timeline.some((event) => event.eventType === "ack_recorded");
  const transportErrorSeen = Boolean(input.transportStatus?.lastError);
  const publicWatchModeDisabled = WATCH_MODE_ENABLED === false;
  const stateRegressionDetected =
    stateTransitions.some(transitionRegressed) ||
    terminalThenUnresolvedStateSeen({
      stateTransitions,
      unresolvedStates: input.unresolvedStates,
    }) ||
    input.unresolvedStates.some(
      (state) => hasRegressedImportedState(state) || hasRegressedAckState(state),
    );
  const drillFailureReasons = failureReasons({
    publicWatchModeDisabled,
    unresolvedStates: input.unresolvedStates,
    importedPackagePresent,
    ackEligibleSeen,
    ackRecordedSeen,
    transportErrorSeen,
    transportCommitReceiptSeen,
    transportPackageReceivedSeen,
    fixtureImportSeen,
    recoverySimulationSeen,
    stateRegressionDetected,
  });
  const drillStatus = finalDrillStatus({
    publicWatchModeDisabled,
    unresolvedStates: input.unresolvedStates,
    importedPackagePresent,
    ackEligibleSeen,
    ackRecordedSeen,
    transportErrorSeen,
    transportCommitReceiptSeen,
    transportPackageReceivedSeen,
    stateRegressionDetected,
  });
  const drillAssessment = buildDrillAssessment({
    buildInfo: input.buildInfo,
    timeline,
    stateTransitions,
    recoveryPresentation: input.recoveryPresentation,
    publicWatchModeDisabled,
    unresolvedStates: input.unresolvedStates,
    importedPackagePresent,
    ackEligibleSeen,
    ackRecordedSeen,
    transportErrorSeen,
    transportCommitReceiptSeen,
    transportPackageReceivedSeen,
    fixtureImportSeen,
    recoverySimulationSeen,
    stateRegressionDetected,
    transportStatus: input.transportStatus,
    drillFailureReasons,
    drillStatus,
  });

  return {
    schemaVersion: WATCH_MODE_LAB_DEBUG_BUNDLE_SCHEMA_VERSION,
    exportedAt: input.exportedAt,
    app: {
      name: "LucidTLR",
      version: input.buildInfo.version,
      buildNumber: input.buildInfo.build,
      runtime: "react-native",
      labEnabled: input.buildInfo.labAvailable,
      watchModeEnabled: WATCH_MODE_ENABLED,
      buildProfile: input.buildInfo.lane,
      isInternalLabAvailable: isWatchModeLabAvailable(),
    },
    drill: {
      label: "synthetic-watchconnectivity-transport",
      instructionsVersion: "internal-testflight-watch-mode-lab-2026-06-08",
    },
    phone: {
      participantId: input.participantId,
      selectedMode: input.selectedMode,
    },
    lab: {
      latestMessage: input.latestMessage,
      actionLog: input.actionLog ?? [],
      latestPlanSummary: input.latestPlanSummary ?? null,
      latestImportSummary: input.latestImportSummary ?? null,
      latestValidationSummary: input.latestValidationSummary ?? null,
    },
    timeline,
    stateTransitions,
    transportMessages,
    packageFlow,
    drillAssessment,
    transport: {
      available: input.transportStatus?.available ?? watchTransport.isAvailable(),
      status: input.transportStatus ?? null,
      latestError: input.transportStatus?.lastError,
      activationState: input.transportStatus?.activationState,
      paired: input.transportStatus?.paired,
      watchAppInstalled: input.transportStatus?.watchAppInstalled,
      reachable: input.transportStatus?.reachable,
      lastMessageType: input.transportStatus?.lastMessageType,
      lastMessageAt: input.transportStatus?.lastMessageAt,
    },
    syncLedger: {
      unresolvedStates: input.unresolvedStates,
      recentStates: input.recentStates,
      recoveryPresentation: input.recoveryPresentation,
    },
    imports: {
      packages,
      latestImport: packages[0] ?? null,
      latestAckEligible: input.latestImportSummary?.ackEligible ?? ackEligibleSeen,
    },
    summaries: {
      passFailHints: {
        publicWatchModeDisabled,
        unresolvedStatePresent: input.unresolvedStates.length > 0,
        importedPackagePresent,
        ackEligibleSeen,
        ackRecordedSeen,
        transportErrorSeen,
        transportCommitReceiptSeen,
        transportPackageReceivedSeen,
        fixtureImportSeen,
        recoverySimulationSeen,
        stateRegressionDetected,
      },
      unresolvedCount: input.unresolvedStates.length,
      ackRecordedSeen,
      finalDrillStatus: drillStatus,
      failureReasons: drillFailureReasons,
    },
    diagnostics: {
      generatedBy: "phone-lab",
      warnings: debugWarnings({
        transportStatus: input.transportStatus,
        unresolvedStates: input.unresolvedStates,
      }),
      limitations: [...DEBUG_EXPORT_LIMITATIONS],
    },
    raw: {
      labActions: bounded(
        timeline.filter((event) =>
          ["phone_lab", "watch_lab", "importer", "export"].includes(
            event.source,
          ),
        ),
        WATCH_MODE_LAB_DEBUG_EVENT_LIMIT,
      ),
      syncLedgerEvents: bounded(
        stateTransitions,
        WATCH_MODE_LAB_DEBUG_EVENT_LIMIT,
      ),
      transportMessages: bounded(
        transportMessages,
        WATCH_MODE_LAB_DEBUG_EVENT_LIMIT,
      ),
      packageImportRecords: bounded(packages, PACKAGE_IMPORT_RECORD_LIMIT),
      currentUnresolvedStates: input.unresolvedStates,
      currentRecentStates: input.recentStates,
    },
  };
}

export function watchModeLabDebugBundleFileName(exportedAt: string): string {
  const stamp = exportedAt
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z")
    .replace("T", "-")
    .replace("Z", "");

  return `lucidtlr-watch-lab-debug-${stamp}.json`;
}

export async function createWatchModeLabDebugBundle(
  input: WatchModeLabDebugBundleInput,
): Promise<WatchModeLabDebugBundle> {
  const exportedAt = input.exportedAt ?? new Date().toISOString();
  const [transportStatus, unresolvedStates, recentStates, recoveryPresentation] =
    await Promise.all([
      input.transportStatus !== undefined
        ? Promise.resolve(input.transportStatus)
        : watchTransport.getTransportStatus().catch(() => null),
      loadUnresolvedWatchSessionSyncStates({
        db: input.db,
        participantId: input.participantId,
      }),
      loadRecentWatchSessionSyncStates({
        db: input.db,
        participantId: input.participantId,
        limit: 20,
      }),
      loadWatchModeLabRecoverySummary({
        db: input.db,
        participantId: input.participantId ?? "",
      }),
    ]);
  const packageSessionIds = Array.from(
    new Set(
      [
        ...recentStates.map((state) => state.sessionId),
        input.latestImportSummary?.sessionId,
        transportStatus?.latestReceivedPackage?.sessionId,
        transportStatus?.latestPackageManifest?.sessionId,
      ].filter((sessionId): sessionId is string => Boolean(sessionId)),
    ),
  );
  const packages = await loadRecentWatchSyncPackageImports({
    db: input.db,
    sessionIds: packageSessionIds.length > 0 ? packageSessionIds : undefined,
    limit: PACKAGE_IMPORT_RECORD_LIMIT,
  });
  await appendWatchModeLabDebugEvent({
    db: input.db,
    timestamp: exportedAt,
    source: "export",
    eventType: "export_generated",
    success: true,
    metadata: {
      syntheticInternalLabOnly: true,
      localOnly: true,
    },
  });
  const debugEvents = await loadRecentWatchModeLabDebugEvents({
    db: input.db,
    sessionIds: packageSessionIds.length > 0 ? packageSessionIds : undefined,
    limit: WATCH_MODE_LAB_DEBUG_EVENT_LIMIT,
  });

  return buildWatchModeLabDebugBundle({
    exportedAt,
    buildInfo: internalLabBuildInfo(),
    participantId: input.participantId,
    selectedMode: input.selectedMode,
    latestMessage: input.latestMessage,
    latestPlanSummary: input.latestPlanSummary,
    latestImportSummary: input.latestImportSummary,
    latestValidationSummary: input.latestValidationSummary,
    transportStatus,
    actionLog: input.actionLog,
    unresolvedStates,
    recentStates,
    packages,
    recoveryPresentation,
    debugEvents,
  });
}
