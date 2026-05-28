import { router } from "expo-router";

import {
  PrimaryPillButton,
  RunningSessionClock,
  Screen,
} from "@/src/components/ui";
import type { NightSession } from "@/src/domain/types";
import { canTransitionSession } from "@/src/features/sessions/sessionStateMachine";
import { useAppState } from "@/src/state/AppState";

function nightSessionStartedAt(session: NightSession): string {
  if (session.sessionType === "tlr") {
    return session.trainingEndedAt ?? session.startedAt;
  }

  return session.startedAt;
}

export function ActiveNightSessionScreen() {
  const { activeSession, sendSessionEvent } = useAppState();
  const canEnd =
    activeSession &&
    canTransitionSession(
      activeSession.sessionType,
      activeSession.status,
      "end_session",
    );
  const canGoHome =
    !activeSession || activeSession.status === "morning_review_complete";

  if (activeSession && canEnd) {
    return (
      <Screen bottomNav={false} centered>
        <RunningSessionClock startedAt={nightSessionStartedAt(activeSession)} />
        <PrimaryPillButton
          label="Stop Session"
          onPress={() => sendSessionEvent("end_session")}
        />
      </Screen>
    );
  }

  if (activeSession?.status === "ended") {
    return (
      <Screen centered>
        <PrimaryPillButton
          label="Morning Review"
          onPress={() => router.push("/morning-review")}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      {canGoHome ? (
        <PrimaryPillButton label="Back Home" onPress={() => router.replace("/")} />
      ) : null}
    </Screen>
  );
}
