import type { ConsentState, EntityType } from "../../domain/types";
import { canUploadEntity, getRequiredConsentForEntity } from "./uploadPolicy";

export interface UploadQueueItem {
  id: string;
  entityType: EntityType;
  entityId: string;
  payload: Record<string, unknown>;
  consentTypeRequired: "structured_research_upload" | "dream_journal_upload";
  status: "pending" | "uploaded" | "canceled" | "failed";
  attemptCount: number;
  createdAt: string;
}

export interface SyncQueueStore {
  enqueue(item: UploadQueueItem): Promise<void>;
  cancelWhereConsentRequired(
    consentType: "structured_research_upload" | "dream_journal_upload",
  ): Promise<void>;
}

export async function enqueueIfAllowed(input: {
  queue: SyncQueueStore;
  consents: ConsentState;
  item: Omit<UploadQueueItem, "status" | "attemptCount">;
}): Promise<boolean> {
  if (!canUploadEntity(input.item.entityType, input.consents)) {
    return false;
  }

  await input.queue.enqueue({
    ...input.item,
    consentTypeRequired: getRequiredConsentForEntity(input.item.entityType),
    status: "pending",
    attemptCount: 0,
  });

  return true;
}

export async function cancelUploadsAfterWithdrawal(input: {
  queue: SyncQueueStore;
  entityType: EntityType;
}): Promise<void> {
  await input.queue.cancelWhereConsentRequired(
    getRequiredConsentForEntity(input.entityType),
  );
}
