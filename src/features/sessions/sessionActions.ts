import { TLR_PROTOCOL_VERSION } from "../../protocol/tlrProtocol";
import type { AppMode, NightSession, SessionType } from "../../domain/types";
import {
  type SessionEvent,
  transitionSessionStatus,
} from "./sessionStateMachine";

export function createNightSession(input: {
  id: string;
  participantId: string;
  sessionType: SessionType;
  mode: AppMode | null;
  startedAt: string;
}): NightSession {
  return {
    id: input.id,
    participantId: input.participantId,
    sessionType: input.sessionType,
    mode: input.mode,
    status: "setup",
    protocolVersion: TLR_PROTOCOL_VERSION,
    startedAt: input.startedAt,
  };
}

export function applySessionEvent(
  session: NightSession,
  event: SessionEvent,
  timestamp: string,
): NightSession {
  const nextStatus = transitionSessionStatus(
    session.sessionType,
    session.status,
    event,
  );

  const nextSession: NightSession = {
    ...session,
    status: nextStatus,
  };

  if (event === "start_training") {
    nextSession.trainingStartedAt = timestamp;
    nextSession.guidedTrainingSkipped = false;
  }

  if (event === "skip_guided_training") {
    nextSession.trainingStartedAt = timestamp;
    nextSession.trainingEndedAt = timestamp;
    nextSession.guidedTrainingSkipped = true;
  }

  if (event === "finish_training") {
    nextSession.trainingEndedAt = timestamp;
    nextSession.guidedTrainingSkipped = false;
  }

  if (event === "start_cueing" && session.sessionType === "tlr") {
    nextSession.cueingStartedAt = timestamp;
  }

  if (event === "end_session") {
    nextSession.endedAt = timestamp;
  }

  return nextSession;
}
