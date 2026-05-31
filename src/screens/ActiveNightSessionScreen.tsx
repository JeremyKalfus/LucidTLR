import { router } from "expo-router";
import React from "react";
import { Alert, AppState as NativeAppState, Text } from "react-native";

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
  latestPhoneRuntimeStopTimestamp,
  phoneRuntime,
  summarizePhoneRuntimeEvents,
  type PhoneRuntimeStatus,
} from "@/src/native/phoneRuntime";
import {
  watchRuntime,
  type WatchRuntimeStatus,
} from "@/src/native/watch";
import { getLocalDb } from "@/src/data/local/expoSqliteDb";
import {
  saveWatchEpochs,
  saveWatchRuntimeEvents,
} from "@/src/data/local/repositories";
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
  const [watchRuntimeStatus, setWatchRuntimeStatus] =
    React.useState<WatchRuntimeStatus | null>(null);
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
  const usesWatchRuntime =
    activeSession?.sessionType === "tlr" && activeSession.mode === "watch";

  const refreshRuntimeStatus = React.useCallback(async () => {
    if (!usesPhoneRuntime) {
      return;
    }

    try {
      const status = await phoneRuntime.getPhoneRuntimeStatus();

      setRuntimeStatus(status);

      if (!activeSession || status.running || !status.available || !canEnd) {
        return;
      }

      const logs = await phoneRuntime.getPhoneRuntimeLogs(activeSession.id);
      const summary = summarizePhoneRuntimeEvents(logs);

      if (!summary.stopped && !summary.completed && !summary.errored) {
        return;
      }

      await importPhoneRuntimeLogsToLocalRecords(logs);
      sendSessionEvent(
        "end_session",
        latestPhoneRuntimeStopTimestamp(logs) ?? new Date().toISOString(),
      );
    } catch (error) {
      setRuntimeError(errorMessage(error));
    }
  }, [activeSession, canEnd, sendSessionEvent, usesPhoneRuntime]);

  const refreshWatchRuntimeStatus = React.useCallback(async () => {
    if (!usesWatchRuntime) {
      return;
    }

    try {
      const status = await watchRuntime.getWatchRuntimeStatus();

      setWatchRuntimeStatus(status);
    } catch (error) {
      setRuntimeError(errorMessage(error));
    }
  }, [usesWatchRuntime]);

  React.useEffect(() => {
    void refreshRuntimeStatus();
    void refreshWatchRuntimeStatus();

    if ((!usesPhoneRuntime && !usesWatchRuntime) || !canEnd) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      void refreshRuntimeStatus();
      void refreshWatchRuntimeStatus();
    }, 5000);

    return () => clearInterval(intervalId);
  }, [
    canEnd,
    refreshRuntimeStatus,
    refreshWatchRuntimeStatus,
    usesPhoneRuntime,
    usesWatchRuntime,
  ]);

  React.useEffect(() => {
    if ((!usesPhoneRuntime && !usesWatchRuntime) || !canEnd) {
      return undefined;
    }

    const subscription = NativeAppState.addEventListener("change", (state) => {
      if (state === "active") {
        void refreshRuntimeStatus();
        void refreshWatchRuntimeStatus();
      }
    });

    return () => subscription.remove();
  }, [
    canEnd,
    refreshRuntimeStatus,
    refreshWatchRuntimeStatus,
    usesPhoneRuntime,
    usesWatchRuntime,
  ]);

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

      if (usesWatchRuntime) {
        await watchRuntime.stopWatchSession({ reason: "user_stopped" });
        const [epochs, logs, db] = await Promise.all([
          watchRuntime.getWatchEpochs(activeSession.id),
          watchRuntime.getWatchRuntimeLogs(activeSession.id),
          getLocalDb(),
        ]);

        await saveWatchEpochs({ db, records: epochs });
        await saveWatchRuntimeEvents({ db, events: logs });
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
              label="background audio"
              value={displayValue(runtimeStatus?.backgroundAudioRunning)}
            />
            <InfoRow
              label="alarm"
              value={displayValue(runtimeStatus?.alarmRinging)}
            />
            <InfoRow
              label="alarm time"
              value={displayValue(runtimeStatus?.alarmFireAt)}
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
        {usesWatchRuntime ? (
          <Card>
            <InfoRow
              label="watch runtime"
              value={displayValue(watchRuntimeStatus?.running)}
            />
            <InfoRow
              label="watch connected"
              value={displayValue(watchRuntimeStatus?.watchReachable)}
            />
            <InfoRow
              label="watch app"
              value={displayValue(watchRuntimeStatus?.watchAppInstalled)}
            />
            <InfoRow
              label="audio bed"
              value={displayValue(watchRuntimeStatus?.audioBedRunning)}
            />
            <InfoRow
              label="latest epoch"
              value={displayValue(watchRuntimeStatus?.latestEpochAt)}
            />
            <InfoRow
              label="latest HR"
              value={displayValue(watchRuntimeStatus?.latestHeartRate)}
            />
            <InfoRow
              label="latest motion"
              value={displayValue(watchRuntimeStatus?.latestMotionSummary)}
            />
            <InfoRow
              label="REM probability"
              value={displayValue(watchRuntimeStatus?.latestRemProbability)}
            />
            <InfoRow
              label="classifier"
              value={
                watchRuntimeStatus?.modelAvailable
                  ? watchRuntimeStatus.classifierVersion
                  : "unavailable; cueing disabled"
              }
            />
            <InfoRow
              label="likely REM streak"
              value={displayValue(watchRuntimeStatus?.consecutiveLikelyRemEpochs)}
            />
            <InfoRow
              label="cue count"
              value={displayValue(watchRuntimeStatus?.cueCount)}
            />
            <InfoRow
              label="latest reason"
              value={displayValue(watchRuntimeStatus?.latestCueDecisionReason)}
            />
            <InfoRow
              label="watch battery"
              value={displayValue(watchRuntimeStatus?.watchBatteryLevel)}
            />
            <InfoRow
              label="sensor quality"
              value={displayValue(watchRuntimeStatus?.latestSensorQuality)}
            />
            <InfoRow
              label="connectivity"
              value={displayValue(watchRuntimeStatus?.connectivityState)}
            />
            <InfoRow
              label="runtime error"
              value={
                runtimeError ??
                watchRuntimeStatus?.latestRuntimeError ??
                watchRuntimeStatus?.unavailableReason ??
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
