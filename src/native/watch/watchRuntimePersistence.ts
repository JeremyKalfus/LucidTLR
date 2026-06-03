import type { LocalDb } from "@/src/data/local/localDb";
import {
  saveWatchCueRecords,
  saveWatchEpochs,
  saveWatchRuntimeEvents,
} from "@/src/data/local/repositories";

import type {
  WatchEpochRecordDraft,
  WatchRuntimeEvent,
  WatchRuntimeStatus,
} from "./WatchModeTypes";
import type { WatchOwnedImportPayloadV2 } from "./WatchOwnedTypes";
import {
  mapWatchOwnedCueDeliveryToRecord,
  mapWatchOwnedEpochLogToRecord,
  mapWatchOwnedImportToRuntimeEvents,
} from "./watchOwnedLogMapping";
import {
  latestWatchRuntimeStopTimestamp,
  summarizeWatchRuntime,
} from "./watchRuntimeLogMapping";

export interface WatchRuntimeDataSource {
  getWatchEpochs(sessionId: string): Promise<WatchEpochRecordDraft[]>;
  getWatchRuntimeLogs(sessionId: string): Promise<WatchRuntimeEvent[]>;
}

export interface WatchRuntimeStatusSource extends WatchRuntimeDataSource {
  getWatchRuntimeStatus(): Promise<WatchRuntimeStatus>;
}

export async function importWatchRuntimeDataToLocalRecords(input: {
  db: LocalDb;
  sessionId: string;
  runtime: WatchRuntimeDataSource;
}): Promise<{
  epochs: WatchEpochRecordDraft[];
  logs: WatchRuntimeEvent[];
  summary: ReturnType<typeof summarizeWatchRuntime>;
}> {
  const [epochs, logs] = await Promise.all([
    input.runtime.getWatchEpochs(input.sessionId),
    input.runtime.getWatchRuntimeLogs(input.sessionId),
  ]);

  if (epochs.length > 0) {
    await saveWatchEpochs({ db: input.db, records: epochs });
  }

  if (logs.length > 0) {
    await saveWatchRuntimeEvents({ db: input.db, events: logs });
  }

  return {
    epochs,
    logs,
    summary: summarizeWatchRuntime(logs, epochs),
  };
}

export async function importWatchOwnedRuntimeDataToLocalRecords(input: {
  db: LocalDb;
  payload: WatchOwnedImportPayloadV2;
}): Promise<{
  epochs: WatchEpochRecordDraft[];
  logs: WatchRuntimeEvent[];
}> {
  const epochs = input.payload.epochs.map(mapWatchOwnedEpochLogToRecord);
  const cueRecords = input.payload.cueDeliveries.map(
    mapWatchOwnedCueDeliveryToRecord,
  );
  const logs = mapWatchOwnedImportToRuntimeEvents(input.payload);

  if (epochs.length > 0) {
    await saveWatchEpochs({ db: input.db, records: epochs });
  }

  if (cueRecords.length > 0) {
    await saveWatchCueRecords({ db: input.db, records: cueRecords });
  }

  if (logs.length > 0) {
    await saveWatchRuntimeEvents({ db: input.db, events: logs });
  }

  return { epochs, logs };
}

export function isTerminalWatchRuntimeSummary(
  summary: ReturnType<typeof summarizeWatchRuntime>,
): boolean {
  return summary.stopped || summary.completed || summary.errored;
}

export async function reconcileStoppedWatchRuntime(input: {
  db: LocalDb;
  sessionId: string;
  runtime: WatchRuntimeStatusSource;
  status?: WatchRuntimeStatus;
}): Promise<{
  shouldEndSession: boolean;
  stopTimestamp: string | null;
  status: WatchRuntimeStatus;
}> {
  const status = input.status ?? (await input.runtime.getWatchRuntimeStatus());

  if (!status.available || status.running) {
    return {
      shouldEndSession: false,
      stopTimestamp: null,
      status,
    };
  }

  const imported = await importWatchRuntimeDataToLocalRecords({
    db: input.db,
    sessionId: input.sessionId,
    runtime: input.runtime,
  });

  return {
    shouldEndSession: isTerminalWatchRuntimeSummary(imported.summary),
    stopTimestamp: latestWatchRuntimeStopTimestamp(imported.logs),
    status,
  };
}

export async function collectWatchRuntimeDataForLocalSessions(input: {
  db: LocalDb;
  runtime: WatchRuntimeDataSource;
}): Promise<{
  attemptedSessionCount: number;
  importedSessionCount: number;
  failedSessionCount: number;
}> {
  const sessions = await input.db.query<{ id: string }>(
    `select id from sessions
where mode = 'watch'
order by started_at desc`,
  );
  let importedSessionCount = 0;
  let failedSessionCount = 0;

  for (const session of sessions) {
    try {
      const imported = await importWatchRuntimeDataToLocalRecords({
        db: input.db,
        sessionId: session.id,
        runtime: input.runtime,
      });

      if (imported.epochs.length > 0 || imported.logs.length > 0) {
        importedSessionCount += 1;
      }
    } catch {
      failedSessionCount += 1;
    }
  }

  return {
    attemptedSessionCount: sessions.length,
    importedSessionCount,
    failedSessionCount,
  };
}
