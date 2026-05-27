import type { DreamJournalEntry } from "../../domain/types";

export type DreamJournalInputKind = "text" | "audio";

export interface DreamJournalDraft {
  sessionId?: string;
  text?: string;
  audioLocalUri?: string;
}

export function createLocalDreamJournalEntry(input: {
  id: string;
  draft: DreamJournalDraft;
  createdAt: string;
}): DreamJournalEntry {
  return {
    id: input.id,
    sessionId: input.draft.sessionId,
    createdAt: input.createdAt,
    text: input.draft.text,
    audioLocalUri: input.draft.audioLocalUri,
    localOnly: true,
    uploadedWithExplicitConsent: false,
  };
}
