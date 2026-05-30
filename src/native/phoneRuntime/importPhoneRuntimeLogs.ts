import { getLocalDb } from "@/src/data/local/expoSqliteDb";
import {
  savePhoneRuntimeCueRecords,
  savePhoneRuntimeMovementRecords,
  upsertPhoneNightCalibrationNight,
} from "@/src/data/local/repositories";

import type { NativePhoneRuntimeEvent } from "./NativePhoneSessionPlan";
import {
  buildPhoneNightCalibrationNightFromRuntimeLogs,
  mapPhoneRuntimeCueEvents,
  mapPhoneRuntimeMovementEvents,
} from "./phoneRuntimeLogMapping";

export async function importPhoneRuntimeLogsToLocalRecords(
  events: NativePhoneRuntimeEvent[],
): Promise<void> {
  if (events.length === 0) {
    return;
  }

  const db = await getLocalDb();

  await savePhoneRuntimeCueRecords({
    db,
    records: mapPhoneRuntimeCueEvents(events),
  });
  await savePhoneRuntimeMovementRecords({
    db,
    records: mapPhoneRuntimeMovementEvents(events),
  });

  const calibrationNight = buildPhoneNightCalibrationNightFromRuntimeLogs(events);

  if (calibrationNight) {
    await upsertPhoneNightCalibrationNight({
      db,
      night: calibrationNight,
      updatedAt: calibrationNight.generatedAt,
    });
  }
}
