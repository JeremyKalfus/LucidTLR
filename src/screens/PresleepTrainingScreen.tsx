import { router } from "expo-router";
import { Headphones, Play, StepForward } from "lucide-react-native";
import { Text, View } from "react-native";

import {
  Card,
  InfoRow,
  PrimaryPillButton,
  RunningSessionClock,
  Screen,
  SectionTitle,
} from "@/src/components/ui";
import { cueAudio, PRESLEEP_SCRIPT_NOTICE, PRESLEEP_SCRIPT_PLACEHOLDER } from "@/src/protocol/tlrProtocol";
import { canTransitionSession } from "@/src/features/sessions/sessionStateMachine";
import { useAppState } from "@/src/state/AppState";
import { colors, typography } from "@/src/theme/tokens";

export function PresleepTrainingScreen() {
  const { activeSession, sendSessionEvent, startSession } = useAppState();
  const session =
    activeSession?.sessionType === "tlr" ? activeSession : null;
  const canStart =
    session?.status === "setup" &&
    canTransitionSession("tlr", session.status, "start_training");
  const canFinish =
    session?.status === "training" &&
    canTransitionSession("tlr", session.status, "finish_training");

  if (canFinish) {
    return (
      <Screen bottomNav={false} centered>
        <RunningSessionClock
          startedAt={session.trainingStartedAt ?? session.startedAt}
        />
        <PrimaryPillButton
          label="Skip"
          onPress={() => {
            sendSessionEvent("finish_training");
            router.push("/active-night-session");
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <SectionTitle>Presleep training</SectionTitle>

      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Headphones color={colors.textMuted} size={24} strokeWidth={1.8} />
          <Text
            selectable
            style={{
              color: colors.textPrimary,
              fontSize: typography.body.fontSize,
              lineHeight: typography.body.lineHeight,
            }}
          >
            Cue/training player placeholder
          </Text>
        </View>
        <InfoRow label="cue" value={cueAudio.description} />
        <InfoRow label="audio adapter" value="not connected in this shell" />
      </Card>

      <Card>
        <Text
          selectable
          style={{
            color: colors.textMuted,
            fontSize: typography.label.fontSize,
            lineHeight: typography.label.lineHeight,
          }}
        >
          {PRESLEEP_SCRIPT_NOTICE}
        </Text>
        <Text
          selectable
          style={{
            color: colors.textSecondary,
            fontSize: typography.body.fontSize,
            lineHeight: typography.body.lineHeight,
          }}
        >
          {PRESLEEP_SCRIPT_PLACEHOLDER.trim()}
        </Text>
      </Card>

      <Card compact>
        <InfoRow label="session status" value={session?.status ?? "none"} />
        <InfoRow label="mode" value={session?.mode ?? "none"} />
      </Card>

      {!session ? (
        <PrimaryPillButton
          label="Create TLR Session"
          onPress={() => startSession("tlr")}
        />
      ) : null}

      {canStart ? (
        <PrimaryPillButton
          label="Start Training"
          onPress={() => sendSessionEvent("start_training")}
        />
      ) : null}

      {session?.status === "waiting_for_cue_window" ? (
        <PrimaryPillButton
          label="Open Night Session"
          onPress={() => router.push("/active-night-session")}
        />
      ) : null}

      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <Play color={colors.textDim} size={16} strokeWidth={1.6} />
        <StepForward color={colors.textDim} size={16} strokeWidth={1.6} />
        <Text
          selectable
          style={{
            color: colors.textDim,
            fontSize: typography.label.fontSize,
            lineHeight: typography.label.lineHeight,
          }}
        >
          Controls are visual placeholders only; no real audio is implemented.
        </Text>
      </View>
    </Screen>
  );
}
