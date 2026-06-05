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
  WATCH_MODE_DISABLED_MESSAGE,
  WATCH_MODE_DISABLED_TITLE,
} from "@/src/features/watchMode/watchModeAvailability";
import {
  importPhoneRuntimeLogsToLocalRecords,
  latestPhoneRuntimeStopTimestamp,
  phoneRuntime,
  summarizePhoneRuntimeEvents,
  type PhoneRuntimeStatus,
} from "@/src/native/phoneRuntime";
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
  const {
    activeSession,
    sendSessionEvent,
  } = useAppState();
  const [runtimeStatus, setRuntimeStatus] =
    React.useState<PhoneRuntimeStatus | null>(null);
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
  const usesWatchPlaceholder =
    activeSession?.mode === "watch";
  const canControlTlrRuntime =
    usesPhoneRuntime && runtimeStatus?.available === true;
  const tlrPaused = usesPhoneRuntime && runtimeStatus?.tlrPaused === true;
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

  React.useEffect(() => {
    void refreshRuntimeStatus();

    if (!usesPhoneRuntime || !canEnd) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      void refreshRuntimeStatus();
    }, 5000);

    return () => clearInterval(intervalId);
  }, [
    canEnd,
    refreshRuntimeStatus,
    usesPhoneRuntime,
  ]);

  React.useEffect(() => {
    if (!usesPhoneRuntime || !canEnd) {
      return undefined;
    }

    const subscription = NativeAppState.addEventListener("change", (state) => {
      if (state === "active") {
        void refreshRuntimeStatus();
      }
    });

    return () => subscription.remove();
  }, [
    canEnd,
    refreshRuntimeStatus,
    usesPhoneRuntime,
  ]);

  async function stopSession() {
    if (!activeSession || !canEnd) {
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

  if (activeSession && usesWatchPlaceholder) {
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
            {WATCH_MODE_DISABLED_TITLE}
          </Text>
          <RunningSessionClock
            label="Local Watch Mode placeholder"
            startedAt={activeSession.startedAt}
          />
          <Text
            selectable
            style={{
              color: colors.textSecondary,
              fontSize: typography.body.fontSize,
              lineHeight: typography.body.lineHeight,
              textAlign: "center",
            }}
          >
            {WATCH_MODE_DISABLED_MESSAGE}
          </Text>
          {canEnd ? (
            <PrimaryPillButton
              disabled={isStopping}
              icon={Sun}
              label={isStopping ? "Ending..." : "End Local Session"}
              onPress={() => {
                void stopSession();
              }}
            />
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
        </View>
      </Screen>
    );
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
              label={isStopping ? "Waking Up..." : "Wake Up"}
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
