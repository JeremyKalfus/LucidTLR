import type { NightSession } from "../../domain/types";

export interface OvernightSessionAdapter {
  startSession(session: NightSession): Promise<void>;
  stopSession(sessionId: string): Promise<void>;
  recoverActiveSession(): Promise<NightSession | null>;
}
