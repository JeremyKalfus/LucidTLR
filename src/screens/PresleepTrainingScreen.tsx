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
  buildNativePhoneSessionPlanFromCompletedSession,
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
    sendSessionEvent,
    sleepHistory,
    startSession,
    tlrOptions,
  } = useAppState();
  const [runtimeError, setRuntimeError] = React.useState<string | null>(null);
  const [isStartingRuntime, setIsStartingRuntime] = React.useState(false);
  const session =
    activeSession?.sessionType === "tlr" ? activeSession : null;
  const canStart =
    session?.status === "setup" &&
    canTransitionSession("tlr", session.status, "start_training");
  const canSkipGuidedTraining =
    session?.status === "setup" &&
    tlrOptions.skipGuidedTraining &&
    canTransitionSession("tlr", session.status, "skip_guided_training");
  const canFinish =
    session?.status === "training" &&
    canTransitionSession("tlr", session.status, "finish_training");
  const canStartRuntime =
    session?.status === "waiting_for_cue_window" && session.mode === "phone";

  async function startNightSession(options?: { skipGuidedTraining?: boolean }) {
    const timestamp = new Date().toISOString();
    const runtimeSession =
      options?.skipGuidedTraining && session?.status === "setup"
        ? sendSessionEvent("skip_guided_training", timestamp)
        : session?.status === "training"
        ? sendSessionEvent("finish_training", timestamp)
        : session;

    if (!runtimeSession) {
      return;
    }

    if (runtimeSession.mode !== "phone") {
      router.push("/active-night-session");
      return;
    }

    setRuntimeError(null);
    setIsStartingRuntime(true);

    try {
      const plan = buildNativePhoneSessionPlanFromCompletedSession({
        session: runtimeSession,
        settings: engineSettings,
        tlrOptions,
        historicalSleepPrior:
          sleepHistory.enabled &&
          sleepHistory.prior &&
          sleepHistory.prior.confidence !== "none"
            ? sleepHistory.prior
            : undefined,
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
            void startNightSession();
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

      {canSkipGuidedTraining ? (
        <Card compact>
          <InfoRow label="cue" value={cueAudio.description} />
          <InfoRow label="training" value="guided script skipped" />
          <InfoRow label="checkpoint" value="cue-associated lucid mindset" />
        </Card>
      ) : null}

      {!tlrOptions.skipGuidedTraining ? (
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
      ) : null}

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

      {canSkipGuidedTraining ? (
        <PrimaryPillButton
          disabled={isStartingRuntime}
          label={isStartingRuntime ? "Starting Phone Runtime..." : "Start Night Session"}
          onPress={() => {
            void startNightSession({ skipGuidedTraining: true });
          }}
        />
      ) : null}

      {canStart && !tlrOptions.skipGuidedTraining ? (
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
                void startNightSession();
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
