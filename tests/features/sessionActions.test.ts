import { describe, expect, it } from "vitest";

import {
  applySessionEvent,
  createNightSession,
} from "@/src/features/sessions/sessionActions";

function baseSession() {
  return createNightSession({
    id: "session-1",
    participantId: "participant-1",
    sessionType: "tlr",
    mode: "phone",
    startedAt: "2026-01-20T03:50:00.000Z",
  });
}

describe("session actions", () => {
  it("records skipped guided training as explicit local session state", () => {
    const timestamp = "2026-01-20T04:00:00.000Z";
    const session = applySessionEvent(
      baseSession(),
      "skip_guided_training",
      timestamp,
    );

    expect(session.status).toBe("waiting_for_cue_window");
    expect(session.trainingStartedAt).toBe(timestamp);
    expect(session.trainingEndedAt).toBe(timestamp);
    expect(session.guidedTrainingSkipped).toBe(true);
  });

  it("does not mark normal guided training as skipped", () => {
    const training = applySessionEvent(
      baseSession(),
      "start_training",
      "2026-01-20T03:55:00.000Z",
    );
    const session = applySessionEvent(
      training,
      "finish_training",
      "2026-01-20T04:00:00.000Z",
    );

    expect(session.status).toBe("waiting_for_cue_window");
    expect(session.guidedTrainingSkipped).toBe(false);
  });
});
