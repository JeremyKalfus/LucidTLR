import { router } from "expo-router";
import React from "react";
import { Alert, Text } from "react-native";

import {
  Card,
  InfoRow,
  PrimaryPillButton,
  RunningSessionClock,
  Screen,
} from "@/src/components/ui";
import type { NightSession } from "@/src/domain/types";
import { canTransitionSession } from "@/src/features/sessions/sessionStateMachine";
import {
  importPhoneRuntimeLogsToLocalRecords,
  phoneRuntime,
  type PhoneRuntimeStatus,
} from "@/src/native/phoneRuntime";
import { useAppState } from "@/src/state/AppState";
import { colors, typography } from "@/src/theme/tokens";

function nightSessionStartedAt(session: NightSession): string {
  if (session.sessionType === "tlr") {
    return session.trainingEndedAt ?? session.startedAt;
  }

  return session.startedAt;
}

function runningSessionLabel(session: NightSession): string {
  return session.sessionType === "tlr"
    ? "TLR session running"
    : "Sleep log running";
}

function displayValue(value: string | number | boolean | undefined): string {
  if (value === undefined || value === "") {
    return "not available";
  }

  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }

  return String(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Phone runtime stop failed.";
}

export function ActiveNightSessionScreen() {
  const { activeSession, sendSessionEvent } = useAppState();
  const [runtimeStatus, setRuntimeStatus] =
    React.useState<PhoneRuntimeStatus | null>(null);
  const [runtimeError, setRuntimeError] = React.useState<string | null>(null);
  const [isStopping, setIsStopping] = React.useState(false);
  const canEnd =
    activeSession &&
    canTransitionSession(
      activeSession.sessionType,
      activeSession.status,
      "end_session",
    );
  const canGoHome =
    !activeSession || activeSession.status === "morning_review_complete";
  const usesPhoneRuntime =
    activeSession?.sessionType === "tlr" && activeSession.mode === "phone";

  const refreshRuntimeStatus = React.useCallback(async () => {
    if (!usesPhoneRuntime) {
      return;
    }

    try {
      setRuntimeStatus(await phoneRuntime.getPhoneRuntimeStatus());
    } catch (error) {
      setRuntimeError(errorMessage(error));
    }
  }, [usesPhoneRuntime]);

  React.useEffect(() => {
    void refreshRuntimeStatus();

    if (!usesPhoneRuntime || !canEnd) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      void refreshRuntimeStatus();
    }, 5000);

    return () => clearInterval(intervalId);
  }, [canEnd, refreshRuntimeStatus, usesPhoneRuntime]);

  async function stopSession() {
    if (!activeSession) {
      return;
    }

    setIsStopping(true);
    setRuntimeError(null);

    try {
      if (usesPhoneRuntime) {
        await phoneRuntime.stopPhoneTlrSession({ reason: "user_stopped" });
        const logs = await phoneRuntime.getPhoneRuntimeLogs(activeSession.id);
        await importPhoneRuntimeLogsToLocalRecords(logs);
      }

      sendSessionEvent("end_session");
    } catch (error) {
      const message = errorMessage(error);

      setRuntimeError(message);

      if (process.env.EXPO_OS !== "web") {
        Alert.alert("Stop failed", message);
      }
    } finally {
      setIsStopping(false);
    }
  }

  if (activeSession && canEnd) {
    return (
      <Screen bottomNav={false}>
        <RunningSessionClock
          label={runningSessionLabel(activeSession)}
          startedAt={nightSessionStartedAt(activeSession)}
        />
        {usesPhoneRuntime ? (
          <Card>
            <InfoRow
              label="runtime running"
              value={displayValue(runtimeStatus?.running)}
            />
            <InfoRow
              label="audio bed"
              value={displayValue(runtimeStatus?.audioBedRunning)}
            />
            <InfoRow
              label="motion"
              value={displayValue(runtimeStatus?.motionRunning)}
            />
            <InfoRow
              label="cue count"
              value={displayValue(runtimeStatus?.cueCount)}
            />
            <InfoRow
              label="cues in block"
              value={displayValue(runtimeStatus?.cuesInBlock)}
            />
            <InfoRow
              label="last cue"
              value={displayValue(runtimeStatus?.lastCueAt)}
            />
            <InfoRow
              label="next cue candidate"
              value={displayValue(runtimeStatus?.nextCueCandidateAt)}
            />
            <InfoRow
              label="latest reason"
              value={displayValue(runtimeStatus?.latestDecisionReason)}
            />
            <InfoRow
              label="movement"
              value={displayValue(runtimeStatus?.latestMovementIntensity)}
            />
            <InfoRow
              label="motion summary"
              value={displayValue(runtimeStatus?.latestMotionSummaryAt)}
            />
            <InfoRow
              label="runtime error"
              value={
                runtimeError ??
                runtimeStatus?.latestRuntimeError ??
                runtimeStatus?.unavailableReason ??
                "none"
              }
            />
          </Card>
        ) : null}
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
          disabled={isStopping}
          label={isStopping ? "Stopping..." : "Stop Session"}
          onPress={() => {
            void stopSession();
          }}
        />
      </Screen>
    );
  }

  if (activeSession?.status === "ended") {
    return (
      <Screen bottomNav={false} centered>
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
