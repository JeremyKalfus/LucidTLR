import { router } from "expo-router";
import { Headphones, Play, StepForward } from "lucide-react-native";
import React from "react";
import { Alert, Text, View } from "react-native";

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
import {
  buildNativePhoneSessionPlan,
  phoneRuntime,
} from "@/src/native/phoneRuntime";
import { useAppState } from "@/src/state/AppState";
import { colors, typography } from "@/src/theme/tokens";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Phone runtime failed.";
}

export function PresleepTrainingScreen() {
  const {
    activeSession,
    engineSettings,
    latestEngineSnapshot,
    sendSessionEvent,
    startSession,
  } = useAppState();
  const [runtimeError, setRuntimeError] = React.useState<string | null>(null);
  const [isStartingRuntime, setIsStartingRuntime] = React.useState(false);
  const session =
    activeSession?.sessionType === "tlr" ? activeSession : null;
  const canStart =
    session?.status === "setup" &&
    canTransitionSession("tlr", session.status, "start_training");
  const canFinish =
    session?.status === "training" &&
    canTransitionSession("tlr", session.status, "finish_training");
  const canStartRuntime =
    session?.status === "waiting_for_cue_window" && session.mode === "phone";

  async function startPhoneRuntime() {
    const timestamp = new Date().toISOString();
    const runtimeSession =
      session?.status === "training"
        ? sendSessionEvent("finish_training", timestamp)
        : session;

    if (!runtimeSession) {
      return;
    }

    setRuntimeError(null);
    setIsStartingRuntime(true);

    try {
      const plan = buildNativePhoneSessionPlan({
        session: runtimeSession,
        sleepTiming: latestEngineSnapshot.sleepTiming,
        settings: engineSettings,
      });

      await phoneRuntime.startPhoneTlrSession(plan);
      router.push("/active-night-session");
    } catch (error) {
      const message = errorMessage(error);

      setRuntimeError(message);

      if (process.env.EXPO_OS !== "web") {
        Alert.alert("Phone runtime failed", message);
      }
    } finally {
      setIsStartingRuntime(false);
    }
  }

  if (canFinish) {
    return (
      <Screen bottomNav={false} centered>
        <RunningSessionClock
          startedAt={session.trainingStartedAt ?? session.startedAt}
        />
        {runtimeError ? (
          <Text
            selectable
            style={{
              color: colors.textSecondary,
              fontSize: typography.body.fontSize,
              lineHeight: typography.body.lineHeight,
              textAlign: "center",
            }}
          >
            {runtimeError}
          </Text>
        ) : null}
        <PrimaryPillButton
          disabled={isStartingRuntime}
          label={isStartingRuntime ? "Starting Phone Runtime..." : "Start Night Session"}
          onPress={() => {
            void startPhoneRuntime();
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
        <InfoRow label="runtime" value="native iPhone Phone Mode after training" />
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
        <View style={{ gap: 12 }}>
          {runtimeError ? (
            <Card>
              <Text
                selectable
                style={{
                  color: colors.textSecondary,
                  fontSize: typography.body.fontSize,
                  lineHeight: typography.body.lineHeight,
                }}
              >
                {runtimeError}
              </Text>
            </Card>
          ) : null}
          {canStartRuntime ? (
            <PrimaryPillButton
              disabled={isStartingRuntime}
              label={
                isStartingRuntime
                  ? "Starting Phone Runtime..."
                  : "Start Native Phone Runtime"
              }
              onPress={() => {
                void startPhoneRuntime();
              }}
            />
          ) : null}
          <PrimaryPillButton
            label="Open Night Session"
            onPress={() => router.push("/active-night-session")}
          />
        </View>
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
          Training player controls are placeholders; locked Phone Mode uses the
          native runtime after training.
        </Text>
      </View>
    </Screen>
  );
}
