import type { LocalDb } from "./localDb";
import type { SyncQueueStore, UploadQueueItem } from "@/src/data/supabase/syncEngine";

export function createLocalUploadQueueStore(db: LocalDb): SyncQueueStore {
  return {
    async enqueue(item: UploadQueueItem): Promise<void> {
      await db.execute(
        `insert into upload_queue (
  id,
  entity_type,
  entity_id,
  payload_json,
  consent_type_required,
  status,
  attempt_count,
  created_at
) values (?, ?, ?, ?, ?, ?, ?, ?)
on conflict(id) do update set
  payload_json = excluded.payload_json,
  consent_type_required = excluded.consent_type_required,
  status = excluded.status,
  attempt_count = excluded.attempt_count`,
        [
          item.id,
          item.entityType,
          item.entityId,
          JSON.stringify(item.payload),
          item.consentTypeRequired,
          item.status,
          item.attemptCount,
          item.createdAt,
        ],
      );
    },
    async cancelWhereConsentRequired(consentType): Promise<void> {
      await db.execute(
        "update upload_queue set status = 'canceled' where consent_type_required = ? and status = 'pending'",
        [consentType],
      );
    },
  };
}
