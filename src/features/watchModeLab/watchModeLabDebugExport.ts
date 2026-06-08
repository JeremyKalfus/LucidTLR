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
  loadRecentWatchSessionSyncStates,
  loadUnresolvedWatchSessionSyncStates,
  type WatchSessionSyncState,
} from "@/src/features/watchSync/watchSessionSyncState";
import {
  internalLabBuildInfo,
  isWatchModeLabAvailable,
} from "@/src/features/internalBuild/internalBuildFlags";
import {
  watchTransport,
  type NativeWatchTransportStatus,
} from "@/src/native/watchTransport";

export const WATCH_MODE_LAB_DEBUG_BUNDLE_SCHEMA_VERSION =
  "watch-mode-lab-debug-bundle-v1";

type InternalLabBuildInfo = ReturnType<typeof internalLabBuildInfo>;

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
    latestPlanSummary?: WatchModeLabPlanSummary | null;
    latestImportSummary?: WatchModeLabPackageImportSummary | null;
    latestValidationSummary?: WatchModeLabPackageValidationSummary | null;
  };
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
    };
  };
  diagnostics: {
    generatedBy: "phone-lab";
    warnings: string[];
    limitations: string[];
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
  unresolvedStates: WatchSessionSyncState[];
  recentStates: WatchSessionSyncState[];
  packages: WatchSyncPackageImportRecord[];
  recoveryPresentation: WatchModeLabRecoverySummary;
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
      "Watch-local state may require a Watch screenshot because no status snapshot has been received.",
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
  "Public Watch Mode remains disabled.",
] as const;

export function buildWatchModeLabDebugBundle(
  input: WatchModeLabDebugBundleParts,
): WatchModeLabDebugBundle {
  const packages = input.packages.map(summarizePackage);
  const importedPackagePresent = packages.some(
    (record) => record.importStatus === "imported",
  );
  const ackEligibleSeen =
    input.latestImportSummary?.ackEligible === true ||
    input.recentStates.some(
      (state) => state.status === "phone_imported_ack_eligible",
    );
  const ackRecordedSeen =
    input.recentStates.some((state) => state.status === "ack_recorded") ||
    Boolean(input.transportStatus?.latestAck);
  const transportErrorSeen = Boolean(input.transportStatus?.lastError);

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
      latestPlanSummary: input.latestPlanSummary ?? null,
      latestImportSummary: input.latestImportSummary ?? null,
      latestValidationSummary: input.latestValidationSummary ?? null,
    },
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
        publicWatchModeDisabled: WATCH_MODE_ENABLED === false,
        unresolvedStatePresent: input.unresolvedStates.length > 0,
        importedPackagePresent,
        ackEligibleSeen,
        ackRecordedSeen,
        transportErrorSeen,
      },
    },
    diagnostics: {
      generatedBy: "phone-lab",
      warnings: debugWarnings({
        transportStatus: input.transportStatus,
        unresolvedStates: input.unresolvedStates,
      }),
      limitations: [...DEBUG_EXPORT_LIMITATIONS],
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
    limit: 20,
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
    unresolvedStates,
    recentStates,
    packages,
    recoveryPresentation,
  });
}
