import { router } from "expo-router";
import React from "react";
import { Alert, AppState as NativeAppState, Text } from "react-native";

import {
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

const TLR_PUSH_BACK_SECONDS = 30 * 60;

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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Runtime action failed.";
}

export function ActiveNightSessionScreen() {
  const { activeSession, sendSessionEvent } = useAppState();
  const [runtimeStatus, setRuntimeStatus] =
    React.useState<PhoneRuntimeStatus | null>(null);
  const [watchRuntimeStatus, setWatchRuntimeStatus] =
    React.useState<WatchRuntimeStatus | null>(null);
  const [runtimeError, setRuntimeError] = React.useState<string | null>(null);
  const [isStopping, setIsStopping] = React.useState(false);
  const [runtimeAction, setRuntimeAction] = React.useState<
    "defer" | "pause" | "resume" | null
  >(null);
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
  const canControlTlrRuntime =
    (usesPhoneRuntime && runtimeStatus?.available === true) ||
    (usesWatchRuntime && watchRuntimeStatus?.available === true);
  const tlrPaused =
    (usesPhoneRuntime && runtimeStatus?.tlrPaused === true) ||
    (usesWatchRuntime && watchRuntimeStatus?.tlrPaused === true);
  const runtimeControlsDisabled = isStopping || runtimeAction !== null;

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
        Alert.alert("Wake up failed", message);
      }
    } finally {
      setIsStopping(false);
    }
  }

  async function pushBackTlr() {
    setRuntimeAction("defer");
    setRuntimeError(null);

    try {
      if (usesPhoneRuntime) {
        await phoneRuntime.deferPhoneTlrCueing({
          durationSeconds: TLR_PUSH_BACK_SECONDS,
        });
        await refreshRuntimeStatus();
      }

      if (usesWatchRuntime) {
        await watchRuntime.deferWatchTlrCueing({
          durationSeconds: TLR_PUSH_BACK_SECONDS,
        });
        await refreshWatchRuntimeStatus();
      }
    } catch (error) {
      const message = errorMessage(error);

      setRuntimeError(message);

      if (process.env.EXPO_OS !== "web") {
        Alert.alert("TLR update failed", message);
      }
    } finally {
      setRuntimeAction(null);
    }
  }

  async function toggleTlrPause() {
    const action = tlrPaused ? "resume" : "pause";

    setRuntimeAction(action);
    setRuntimeError(null);

    try {
      if (usesPhoneRuntime) {
        if (tlrPaused) {
          await phoneRuntime.resumePhoneTlrCueing();
        } else {
          await phoneRuntime.pausePhoneTlrCueing();
        }

        await refreshRuntimeStatus();
      }

      if (usesWatchRuntime) {
        if (tlrPaused) {
          await watchRuntime.resumeWatchTlrCueing();
        } else {
          await watchRuntime.pauseWatchTlrCueing();
        }

        await refreshWatchRuntimeStatus();
      }
    } catch (error) {
      const message = errorMessage(error);

      setRuntimeError(message);

      if (process.env.EXPO_OS !== "web") {
        Alert.alert("TLR update failed", message);
      }
    } finally {
      setRuntimeAction(null);
    }
  }

  if (activeSession && canEnd) {
    return (
      <Screen bottomNav={false}>
        <RunningSessionClock
          label={runningSessionLabel(activeSession)}
          startedAt={nightSessionStartedAt(activeSession)}
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
        {canControlTlrRuntime ? (
          <PrimaryPillButton
            disabled={runtimeControlsDisabled}
            label="Push back TLR (30 minutes)"
            onPress={() => {
              void pushBackTlr();
            }}
          />
        ) : null}
        {canControlTlrRuntime ? (
          <PrimaryPillButton
            disabled={runtimeControlsDisabled}
            label={tlrPaused ? "Start TLR" : "Pause TLR"}
            onPress={() => {
              void toggleTlrPause();
            }}
          />
        ) : null}
        <PrimaryPillButton
          disabled={isStopping}
          label={isStopping ? "Waking Up..." : "Wake Up"}
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
