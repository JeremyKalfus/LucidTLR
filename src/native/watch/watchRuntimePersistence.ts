import type { LocalDb } from "@/src/data/local/localDb";
import {
  loadWatchEpochsForSession,
  loadWatchRuntimeEventsForSession,
  saveWatchCueRecords,
  saveWatchEpochs,
  saveWatchRuntimeEvents,
} from "@/src/data/local/repositories";
import type { WatchEpoch } from "@/src/domain/types";

import type {
  WatchEpochRecordDraft,
  WatchRuntimeEvent,
} from "./WatchModeTypes";
import type { WatchOwnedImportPayloadV2 } from "./WatchOwnedTypes";
import {
  mapWatchOwnedCueDeliveryToRecord,
  mapWatchOwnedEpochLogToRecord,
  mapWatchOwnedImportToRuntimeEvents,
} from "./watchOwnedLogMapping";
import {
  summarizeWatchRuntime,
} from "./watchRuntimeLogMapping";

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

export async function loadImportedWatchOwnedRuntimeSummary(input: {
  db: LocalDb;
  sessionId: string;
}): Promise<{
  epochs: WatchEpoch[];
  logs: WatchRuntimeEvent[];
  summary: ReturnType<typeof summarizeWatchRuntime>;
} | null> {
  const [epochs, logs] = await Promise.all([
    loadWatchEpochsForSession(input),
    loadWatchRuntimeEventsForSession(input),
  ]);
  const summary = summarizeWatchRuntime(logs, epochs);

  if (!isTerminalWatchRuntimeSummary(summary)) {
    return null;
  }

  return { epochs, logs, summary };
}

export function isCompleteWatchOwnedImportPayload(
  payload: WatchOwnedImportPayloadV2,
): boolean {
  if (!payload.summary) {
    return false;
  }

  return (
    payload.epochs.length >= payload.summary.epochCount &&
    payload.cueDeliveries.length >= payload.summary.cueCount
  );
}

export function isTerminalWatchRuntimeSummary(
  summary: ReturnType<typeof summarizeWatchRuntime>,
): boolean {
  return summary.stopped || summary.completed || summary.errored;
}
