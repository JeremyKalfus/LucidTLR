import type { LocalDb } from "@/src/data/local/localDb";
import {
  countExternalSleepSessions,
  getAppSetting,
  loadExternalSleepHistory,
  loadLatestSleepPriorProfile,
  saveExternalSleepHistory,
  saveSleepPriorProfile,
  setAppSetting,
  SLEEP_HISTORY_ENABLED_SETTING,
  SLEEP_HISTORY_LAST_IMPORTED_AT_SETTING,
  SLEEP_HISTORY_NIGHTS_IMPORTED_SETTING,
  SLEEP_HISTORY_PERMISSION_STATUS_SETTING,
  SLEEP_HISTORY_SOURCE_SETTING,
} from "@/src/data/local/repositories";
import type {
  ExternalSleepSession,
  ExternalSleepSource,
  ExternalSleepStageSegment,
  HistoricalSleepPrior,
} from "@/src/domain/types";
import { buildHistoricalSleepPrior } from "@/src/engine/sleepHistory/HistoricalSleepPriorBuilder";
import {
  defaultHealthHistoryAdapter,
  getDefaultExternalSleepSource,
  type HealthHistoryAdapter,
  type HealthHistoryPermissionStatus,
} from "@/src/native/health/HealthHistoryAdapter";

export const SLEEP_HISTORY_LOOKBACK_DAYS = 30;

export interface SleepHistoryCalibrationState {
  enabled: boolean;
  source: ExternalSleepSource | null;
  permissionStatus: HealthHistoryPermissionStatus;
  lastImportedAt?: string;
  nightsImported: number;
  prior: HistoricalSleepPrior | null;
  lastSyncError?: string;
}

export interface SleepHistoryImportResult extends SleepHistoryCalibrationState {
  importedSessionCount: number;
  importedStageSegmentCount: number;
}

function stableId(prefix: string, value: string): string {
  return `${prefix}-${value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 96)}`;
}

function normalizeImportedHistory(input: {
  participantId: string;
  importedAt: string;
  sessions: ExternalSleepSession[];
  stageSegments: ExternalSleepStageSegment[];
}): {
  sessions: ExternalSleepSession[];
  stageSegments: ExternalSleepStageSegment[];
} {
  const sessionIdByAdapterId = new Map<string, string>();
  const sessionsBySourceRecord = new Map<string, ExternalSleepSession>();

  for (const session of input.sessions) {
    const hash = session.sourceRecordIdHash.trim();

    if (!hash || Date.parse(session.endAt) <= Date.parse(session.startAt)) {
      continue;
    }

    const id = stableId(`${session.sourcePlatform}-sleep-session`, hash);
    sessionIdByAdapterId.set(session.id, id);
    sessionsBySourceRecord.set(`${session.sourcePlatform}:${hash}`, {
      ...session,
      id,
      participantId: input.participantId,
      sourceRecordIdHash: hash,
      importedAt: input.importedAt,
      uploadStatus: "local_only",
    });
  }

  const sessions = [...sessionsBySourceRecord.values()];
  const stageSegments = input.stageSegments.flatMap((segment) => {
    const externalSleepSessionId = sessionIdByAdapterId.get(
      segment.externalSleepSessionId,
    );

    if (
      !externalSleepSessionId ||
      Date.parse(segment.endAt) <= Date.parse(segment.startAt)
    ) {
      return [];
    }

    return [
      {
        ...segment,
        id: stableId(
          `${externalSleepSessionId}-${segment.stage}`,
          `${segment.startAt}-${segment.endAt}`,
        ),
        externalSleepSessionId,
        durationSeconds: Math.max(
          0,
          Math.round((Date.parse(segment.endAt) - Date.parse(segment.startAt)) / 1000),
        ),
      },
    ];
  });

  return { sessions, stageSegments };
}

async function writeSleepHistorySettings(input: {
  db: LocalDb;
  now: string;
  enabled: boolean;
  source: ExternalSleepSource | null;
  permissionStatus: HealthHistoryPermissionStatus;
  lastImportedAt?: string;
  nightsImported: number;
}): Promise<void> {
  await setAppSetting(input.db, SLEEP_HISTORY_ENABLED_SETTING, input.enabled, input.now);
  await setAppSetting(input.db, SLEEP_HISTORY_SOURCE_SETTING, input.source, input.now);
  await setAppSetting(
    input.db,
    SLEEP_HISTORY_PERMISSION_STATUS_SETTING,
    input.permissionStatus,
    input.now,
  );
  await setAppSetting(
    input.db,
    SLEEP_HISTORY_NIGHTS_IMPORTED_SETTING,
    input.nightsImported,
    input.now,
  );

  if (input.lastImportedAt) {
    await setAppSetting(
      input.db,
      SLEEP_HISTORY_LAST_IMPORTED_AT_SETTING,
      input.lastImportedAt,
      input.now,
    );
  }
}

export async function loadSleepHistoryCalibrationState(input: {
  db: LocalDb;
  participantId: string;
}): Promise<SleepHistoryCalibrationState> {
  const [
    enabled,
    source,
    permissionStatus,
    lastImportedAt,
    nightsImportedSetting,
    prior,
  ] = await Promise.all([
    getAppSetting<boolean>(input.db, SLEEP_HISTORY_ENABLED_SETTING),
    getAppSetting<ExternalSleepSource | null>(
      input.db,
      SLEEP_HISTORY_SOURCE_SETTING,
    ),
    getAppSetting<HealthHistoryPermissionStatus>(
      input.db,
      SLEEP_HISTORY_PERMISSION_STATUS_SETTING,
    ),
    getAppSetting<string>(input.db, SLEEP_HISTORY_LAST_IMPORTED_AT_SETTING),
    getAppSetting<number>(input.db, SLEEP_HISTORY_NIGHTS_IMPORTED_SETTING),
    loadLatestSleepPriorProfile({
      db: input.db,
      participantId: input.participantId,
    }),
  ]);

  return {
    enabled: enabled ?? false,
    source: source ?? null,
    permissionStatus: permissionStatus ?? "unknown",
    lastImportedAt: lastImportedAt ?? undefined,
    nightsImported:
      nightsImportedSetting ??
      (await countExternalSleepSessions({
        db: input.db,
        participantId: input.participantId,
      })),
    prior,
  };
}

export async function disableSleepHistoryCalibration(input: {
  db: LocalDb;
  participantId: string;
  now: string;
}): Promise<SleepHistoryCalibrationState> {
  const state = await loadSleepHistoryCalibrationState(input);

  await setAppSetting(input.db, SLEEP_HISTORY_ENABLED_SETTING, false, input.now);

  return {
    ...state,
    enabled: false,
  };
}

export async function importSleepHistory(input: {
  db: LocalDb;
  participantId: string;
  adapter?: HealthHistoryAdapter;
  lookbackDays?: number;
  now?: string;
  source?: ExternalSleepSource | null;
}): Promise<SleepHistoryImportResult> {
  const adapter = input.adapter ?? defaultHealthHistoryAdapter;
  const now = input.now ?? new Date().toISOString();
  const source = input.source ?? getDefaultExternalSleepSource();
  const previousState = await loadSleepHistoryCalibrationState({
    db: input.db,
    participantId: input.participantId,
  });
  const available = source ? await adapter.isAvailable() : false;

  if (!available || !source) {
    await writeSleepHistorySettings({
      db: input.db,
      now,
      enabled: false,
      source,
      permissionStatus: "unavailable",
      lastImportedAt: previousState.lastImportedAt,
      nightsImported: previousState.nightsImported,
    });

    return {
      ...previousState,
      enabled: false,
      source,
      permissionStatus: "unavailable",
      importedSessionCount: 0,
      importedStageSegmentCount: 0,
    };
  }

  const permissionStatus = await adapter.requestPermission();

  if (permissionStatus !== "granted") {
    await writeSleepHistorySettings({
      db: input.db,
      now,
      enabled: false,
      source,
      permissionStatus,
      lastImportedAt: previousState.lastImportedAt,
      nightsImported: previousState.nightsImported,
    });

    return {
      ...previousState,
      enabled: false,
      source,
      permissionStatus,
      importedSessionCount: 0,
      importedStageSegmentCount: 0,
    };
  }

  const imported = await adapter.importSleepHistory({
    participantId: input.participantId,
    lookbackDays: input.lookbackDays ?? SLEEP_HISTORY_LOOKBACK_DAYS,
  });
  const normalized = normalizeImportedHistory({
    participantId: input.participantId,
    importedAt: now,
    sessions: imported.sessions,
    stageSegments: imported.stageSegments,
  });

  await saveExternalSleepHistory({
    db: input.db,
    sessions: normalized.sessions,
    stageSegments: normalized.stageSegments,
  });

  const stored = await loadExternalSleepHistory({
    db: input.db,
    participantId: input.participantId,
  });
  const prior = buildHistoricalSleepPrior({
    ...stored,
    participantId: input.participantId,
    source,
    now,
  });
  const nightsImported = stored.sessions.length;

  await saveSleepPriorProfile({
    db: input.db,
    id: stableId("sleep-prior", `${input.participantId}-${now}`),
    participantId: input.participantId,
    prior,
  });
  await writeSleepHistorySettings({
    db: input.db,
    now,
    enabled: true,
    source,
    permissionStatus,
    lastImportedAt: now,
    nightsImported,
  });

  return {
    enabled: true,
    source,
    permissionStatus,
    lastImportedAt: now,
    nightsImported,
    prior,
    importedSessionCount: normalized.sessions.length,
    importedStageSegmentCount: normalized.stageSegments.length,
  };
}
