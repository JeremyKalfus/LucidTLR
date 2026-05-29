import { getLocalDb } from "@/src/data/local/expoSqliteDb";
import {
  savePhoneRuntimeCueRecords,
  savePhoneRuntimeMovementRecords,
} from "@/src/data/local/repositories";

import type { NativePhoneRuntimeEvent } from "./NativePhoneSessionPlan";
import {
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
}
