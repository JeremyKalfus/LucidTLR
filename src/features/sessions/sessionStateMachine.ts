import type { SessionStatus, SessionType } from "../../domain/types";

export type SessionEvent =
  | "start_setup"
  | "start_training"
  | "finish_training"
  | "start_cueing"
  | "movement_detected"
  | "movement_pause_complete"
  | "awakening_reported"
  | "awakening_pause_complete"
  | "end_session"
  | "complete_morning_review";

const tlrTransitions: Record<SessionStatus, Partial<Record<SessionEvent, SessionStatus>>> = {
  idle: { start_setup: "setup" },
  setup: { start_training: "training", end_session: "ended" },
  training: { finish_training: "waiting_for_cue_window", end_session: "ended" },
  waiting_for_cue_window: {
    start_cueing: "cueing",
    end_session: "ended",
  },
  cueing: {
    movement_detected: "paused_for_movement",
    awakening_reported: "paused_after_awakening",
    end_session: "ended",
  },
  paused_for_movement: {
    movement_pause_complete: "cueing",
    end_session: "ended",
  },
  paused_after_awakening: {
    awakening_pause_complete: "waiting_for_cue_window",
    end_session: "ended",
  },
  cueing_disabled_sleep_log: {},
  ended: { complete_morning_review: "morning_review_complete" },
  morning_review_complete: {},
};

const sleepLogTransitions: Record<
  SessionStatus,
  Partial<Record<SessionEvent, SessionStatus>>
> = {
  idle: { start_setup: "setup" },
  setup: { start_cueing: "cueing_disabled_sleep_log", end_session: "ended" },
  training: {},
  waiting_for_cue_window: {},
  cueing: {},
  paused_for_movement: {},
  paused_after_awakening: {},
  cueing_disabled_sleep_log: { end_session: "ended" },
  ended: { complete_morning_review: "morning_review_complete" },
  morning_review_complete: {},
};

export function getAllowedSessionEvents(
  sessionType: SessionType,
  status: SessionStatus,
): SessionEvent[] {
  const transitions =
    sessionType === "tlr" ? tlrTransitions[status] : sleepLogTransitions[status];
  return Object.keys(transitions) as SessionEvent[];
}

export function transitionSessionStatus(
  sessionType: SessionType,
  status: SessionStatus,
  event: SessionEvent,
): SessionStatus {
  const transitions =
    sessionType === "tlr" ? tlrTransitions[status] : sleepLogTransitions[status];
  const nextStatus = transitions[event];

  if (!nextStatus) {
    throw new Error(
      `Invalid ${sessionType} session transition: ${status} -> ${event}`,
    );
  }

  return nextStatus;
}

export function canTransitionSession(
  sessionType: SessionType,
  status: SessionStatus,
  event: SessionEvent,
): boolean {
  const transitions =
    sessionType === "tlr" ? tlrTransitions[status] : sleepLogTransitions[status];
  return Boolean(transitions[event]);
}
