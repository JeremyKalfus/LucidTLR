import { router } from "expo-router";
import { Text } from "react-native";

import {
  Card,
  InfoRow,
  PrimaryPillButton,
  Screen,
  SectionTitle,
} from "@/src/components/ui";
import { canTransitionSession } from "@/src/features/sessions/sessionStateMachine";
import { useAppState } from "@/src/state/AppState";
import { colors, typography } from "@/src/theme/tokens";

function cueingLabel(status: string | undefined): string {
  if (!status) {
    return "not started";
  }

  if (status === "cueing") {
    return "active placeholder";
  }

  if (status === "cueing_disabled_sleep_log") {
    return "disabled for sleep log";
  }

  if (status === "waiting_for_cue_window") {
    return "waiting for late-night cue window";
  }

  return status.replaceAll("_", " ");
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

  return (
    <Screen>
      <SectionTitle>Night session</SectionTitle>

      <Card>
        <InfoRow label="session" value={activeSession?.sessionType ?? "none"} />
        <InfoRow label="mode" value={activeSession?.mode ?? "none"} />
        <InfoRow label="status" value={cueingLabel(activeSession?.status)} />
        <InfoRow
          label="cueing"
          value={cueingLabel(activeSession?.status)}
        />
        <InfoRow label="movement pause" value="placeholder only" />
      </Card>

      <Card>
        <Text
          selectable
          style={{
            color: colors.textSecondary,
            fontSize: typography.body.fontSize,
            lineHeight: typography.body.lineHeight,
          }}
        >
          Native overnight behavior is not implemented in this shell. iOS,
          watchOS, and Android adapters are typed stubs only; no JavaScript
          timers are pretending to run overnight cueing or sensing.
        </Text>
      </Card>

      {canEnd ? (
        <PrimaryPillButton
          label="Stop Session"
          onPress={() => sendSessionEvent("end_session")}
        />
      ) : null}

      {activeSession?.status === "ended" ? (
        <PrimaryPillButton
          label="Morning Review"
          onPress={() => router.push("/morning-review")}
        />
      ) : null}

      {!activeSession ? (
        <PrimaryPillButton label="Back Home" onPress={() => router.replace("/")} />
      ) : null}
    </Screen>
  );
}
