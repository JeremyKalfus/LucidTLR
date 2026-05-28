import type { ConsentState, EntityType } from "../../domain/types";

const structuredUploadEntityTypes = new Set<string>([
  "participant",
  "consent",
  "questionnaire_response",
  "session",
  "cue_event",
  "movement_event",
  "watch_epoch",
  "morning_report",
]);

export function canUploadStructuredData(consents: ConsentState): boolean {
  return (
    consents.structuredResearchUploadAccepted &&
    !consents.structuredResearchUploadWithdrawn
  );
}

export function canUploadDreamJournal(consents: ConsentState): boolean {
  return (
    consents.structuredResearchUploadAccepted &&
    consents.dreamJournalUploadAccepted &&
    !consents.structuredResearchUploadWithdrawn &&
    !consents.dreamJournalUploadWithdrawn
  );
}

export function canUploadEntity(
  entityType: EntityType | string,
  consents: ConsentState,
): boolean {
  if (entityType === "dream_journal") {
    return canUploadDreamJournal(consents);
  }

  return (
    structuredUploadEntityTypes.has(entityType) &&
    canUploadStructuredData(consents)
  );
}

export function getRequiredConsentForEntity(
  entityType: EntityType,
): "structured_research_upload" | "dream_journal_upload" {
  return entityType === "dream_journal"
    ? "dream_journal_upload"
    : "structured_research_upload";
}
