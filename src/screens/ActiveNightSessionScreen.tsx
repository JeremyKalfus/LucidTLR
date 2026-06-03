import { router } from "expo-router";
import { ClipboardList, FastForward, Home, Pause, Play, Sun } from "lucide-react-native";
import React from "react";
import { Alert, AppState as NativeAppState, Text, View } from "react-native";

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
  importWatchOwnedRuntimeDataToLocalRecords,
  watchRuntime,
  type WatchOwnedStatusV2,
  type WatchRuntimeStatus,
} from "@/src/native/watch";
import { getLocalDb } from "@/src/data/local/expoSqliteDb";
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
  if (session.mode === "watch") {
    return "Watch Mode night active";
  }

  return session.sessionType === "tlr"
    ? "TLR session running"
    : "Sleep log running";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Runtime action failed.";
}

function watchHealthStatusLabel(
  ownedStatus: WatchOwnedStatusV2 | null,
  legacyStatus: WatchRuntimeStatus | null,
): string {
  return (
    ownedStatus?.healthAuthorizationStatus ??
    legacyStatus?.watchHealthAuthorizationStatus ??
    "unknown"
  );
}

function watchHealthStatusAction(
  ownedStatus: WatchOwnedStatusV2 | null,
  legacyStatus: WatchRuntimeStatus | null,
): string | null {
  const status =
    ownedStatus?.healthAuthorizationStatus ??
    legacyStatus?.watchHealthAuthorizationStatus;

  if (status === "denied") {
    return "Enable HealthKit heart-rate access for LucidCue before preparing Watch Mode.";
  }

  if (status === "unavailable") {
    return "HealthKit heart-rate access is unavailable on this Apple Watch.";
  }

  return null;
}

export function ActiveNightSessionScreen() {
  const {
    activeSession,
    sendSessionEvent,
  } = useAppState();
  const [runtimeStatus, setRuntimeStatus] =
    React.useState<PhoneRuntimeStatus | null>(null);
  const [watchRuntimeStatus, setWatchRuntimeStatus] =
    React.useState<WatchRuntimeStatus | null>(null);
  const [watchOwnedStatus, setWatchOwnedStatus] =
    React.useState<WatchOwnedStatusV2 | null>(null);
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
    activeSession?.mode === "watch";
  const canControlTlrRuntime =
    usesPhoneRuntime && runtimeStatus?.available === true;
  const tlrPaused = usesPhoneRuntime && runtimeStatus?.tlrPaused === true;
  const runtimeControlsDisabled = isStopping || runtimeAction !== null;
  const watchHealthAction = watchHealthStatusAction(
    watchOwnedStatus,
    watchRuntimeStatus,
  );
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
      const ownedStatus = await watchRuntime.getLatestWatchOwnedStatus();

      setWatchOwnedStatus(ownedStatus);

      if (!ownedStatus.available) {
        setWatchRuntimeStatus(await watchRuntime.getWatchRuntimeStatus());
        return;
      }

      setWatchRuntimeStatus(null);

      if (!activeSession || !canEnd) {
        return;
      }

      if (
        ownedStatus.sessionId !== activeSession.id ||
        (ownedStatus.state !== "completed" && ownedStatus.state !== "sync_pending")
      ) {
        return;
      }

      const db = await getLocalDb();
      const payload = await watchRuntime.importWatchOwnedSessionLogs(activeSession.id);
      await importWatchOwnedRuntimeDataToLocalRecords({ db, payload });
      sendSessionEvent(
        "end_session",
        payload.summary?.stoppedAt ?? new Date().toISOString(),
      );
    } catch (error) {
      setRuntimeError(errorMessage(error));
    }
  }, [
    activeSession,
    canEnd,
    sendSessionEvent,
    usesWatchRuntime,
  ]);

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
        await watchRuntime.requestWatchOwnedStop({
          reason: "user_stopped",
          sessionId: activeSession.id,
        });
        const db = await getLocalDb();
        const payload = await watchRuntime.importWatchOwnedSessionLogs(activeSession.id);

        await importWatchOwnedRuntimeDataToLocalRecords({
          db,
          payload,
        });
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
      <Screen bottomNav={false} centered>
        <View style={{ alignItems: "center", gap: 18 }}>
          <Text
            selectable
            style={{
              color: colors.textPrimary,
              fontSize: typography.title.fontSize,
              lineHeight: typography.title.lineHeight,
              letterSpacing: typography.title.letterSpacing,
              textAlign: "center",
              fontWeight: "400",
            }}
          >
            {runningSessionLabel(activeSession)}
          </Text>
          <RunningSessionClock
            startedAt={nightSessionStartedAt(activeSession)}
          />
          {usesWatchRuntime ? (
            <Text
              selectable
              style={{
                color: colors.textSecondary,
                fontSize: typography.body.fontSize,
                lineHeight: typography.body.lineHeight,
                textAlign: "center",
              }}
            >
              {`Watch setup: HealthKit heart rate ${watchHealthStatusLabel(
                watchOwnedStatus,
                watchRuntimeStatus,
              )}`}
            </Text>
          ) : null}
          {usesWatchRuntime && watchHealthAction ? (
            <Text
              selectable
              style={{
                color: colors.textSecondary,
                fontSize: typography.body.fontSize,
                lineHeight: typography.body.lineHeight,
                textAlign: "center",
              }}
            >
              {watchHealthAction}
            </Text>
          ) : null}
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: 10,
            }}
          >
            {canControlTlrRuntime ? (
              <PrimaryPillButton
                disabled={runtimeControlsDisabled}
                flex={1}
                icon={FastForward}
                label="Push Back 30m"
                onPress={() => {
                  void pushBackTlr();
                }}
              />
            ) : null}
            {canControlTlrRuntime ? (
              <PrimaryPillButton
                disabled={runtimeControlsDisabled}
                flex={1}
                icon={tlrPaused ? Play : Pause}
                label={tlrPaused ? "Resume TLR" : "Pause TLR"}
                onPress={() => {
                  void toggleTlrPause();
                }}
              />
            ) : null}
            <PrimaryPillButton
              disabled={isStopping}
              flex={1}
              icon={Sun}
              label={
                isStopping
                  ? usesWatchRuntime
                    ? "Syncing..."
                    : "Waking Up..."
                  : usesWatchRuntime
                    ? "Stop + Sync"
                    : "Wake Up"
              }
              onPress={() => {
                void stopSession();
              }}
            />
          </View>
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
        </View>
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
          icon={ClipboardList}
          label="Morning Review"
          onPress={() => router.push("/morning-review")}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      {canGoHome ? (
        <PrimaryPillButton
          icon={Home}
          label="Back Home"
          onPress={() => router.replace("/")}
        />
      ) : null}
    </Screen>
  );
}
