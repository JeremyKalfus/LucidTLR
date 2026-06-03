import { router } from "expo-router";
import { ClipboardList, FastForward, Home, Pause, Play, Sun } from "lucide-react-native";
import React from "react";
import { Alert, AppState as NativeAppState, Text, View } from "react-native";

import {
  PrimaryPillButton,
  RunningSessionClock,
  Screen,
} from "@/src/components/ui";
import { WatchConnectionCheckpoint } from "@/src/components/watch/WatchConnectionCheckpoint";
import type { NightSession } from "@/src/domain/types";
import { canTransitionSession } from "@/src/features/sessions/sessionStateMachine";
import {
  buildNativePhoneWatchSpeakerPlan,
  importPhoneRuntimeLogsToLocalRecords,
  latestPhoneRuntimeStopTimestamp,
  phoneRuntime,
  summarizePhoneRuntimeEvents,
  type PhoneRuntimeStatus,
} from "@/src/native/phoneRuntime";
import {
  buildWatchOwnedSessionPlan,
  importWatchOwnedRuntimeDataToLocalRecords,
  isCompleteWatchOwnedImportPayload,
  watchRuntime,
  type WatchOwnedStatusV2,
} from "@/src/native/watch";
import { getLocalDb } from "@/src/data/local/expoSqliteDb";
import {
  applyPhoneNightCalibrationToSettings,
  buildSleepTimingPrior,
} from "@/src/engine";
import { useAppState } from "@/src/state/AppState";
import { colors, typography } from "@/src/theme/tokens";

const TLR_PUSH_BACK_SECONDS = 30 * 60;
const WATCH_SYNC_POLL_MS = 2000;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

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

function isWatchOwnedRuntimeStarted(status: WatchOwnedStatusV2): boolean {
  return (
    status.state === "running" ||
    status.state === "cue_window_pending" ||
    status.state === "cueing_enabled" ||
    status.state === "cueing_disabled_low_battery" ||
    status.isRunning === true
  );
}

export function ActiveNightSessionScreen() {
  const {
    activeSession,
    engineSettings,
    phoneNightCalibration,
    sendSessionEvent,
    sleepHistory,
    tlrOptions,
  } = useAppState();
  const [runtimeStatus, setRuntimeStatus] =
    React.useState<PhoneRuntimeStatus | null>(null);
  const [watchOwnedStatus, setWatchOwnedStatus] =
    React.useState<WatchOwnedStatusV2 | null>(null);
  const [runtimeError, setRuntimeError] = React.useState<string | null>(null);
  const [isStopping, setIsStopping] = React.useState(false);
  const [runtimeAction, setRuntimeAction] = React.useState<
    "defer" | "pause" | "resume" | null
  >(null);
  const watchEndCheckpointInFlightRef = React.useRef(false);
  const watchStartSyncInFlightRef = React.useRef(false);
  const watchSpeakerStartedSessionRef = React.useRef<string | null>(null);
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
  const effectiveEngineSettings = React.useMemo(
    () =>
      applyPhoneNightCalibrationToSettings(
        engineSettings,
        phoneNightCalibration.nightsIncluded > 0
          ? phoneNightCalibration
          : undefined,
      ),
    [engineSettings, phoneNightCalibration],
  );
  const historicalSleepPrior =
    sleepHistory.enabled &&
    sleepHistory.prior &&
    sleepHistory.prior.confidence !== "none"
      ? sleepHistory.prior
      : undefined;
  const phoneNightPrior =
    phoneNightCalibration.nightsIncluded > 0
      ? phoneNightCalibration
      : undefined;
  const canControlTlrRuntime =
    usesPhoneRuntime && runtimeStatus?.available === true;
  const tlrPaused = usesPhoneRuntime && runtimeStatus?.tlrPaused === true;
  const runtimeControlsDisabled = isStopping || runtimeAction !== null;
  const watchOwnedStatusMatchesActiveSession =
    Boolean(
      activeSession &&
        (watchOwnedStatus?.sessionId === activeSession.id ||
          watchOwnedStatus?.preparedSessionId === activeSession.id),
    );
  const isWatchStartSyncScreen =
    usesWatchRuntime &&
    activeSession?.status === "setup";
  const isWatchWaitingForPhoneSyncScreen =
    usesWatchRuntime &&
    Boolean(canEnd) &&
    activeSession?.status !== "setup" &&
    watchOwnedStatusMatchesActiveSession &&
    watchOwnedStatus?.state === "waiting_for_phone_sync";
  const canSyncWatchLogs =
    Boolean(activeSession && isWatchWaitingForPhoneSyncScreen && !isStopping);
  const waitForCompleteWatchOwnedLogs = React.useCallback(
    async (sessionId: string) => {
      for (;;) {
        try {
          const db = await getLocalDb();
          const payload = await watchRuntime.importWatchOwnedSessionLogs(sessionId);

          if (isCompleteWatchOwnedImportPayload(payload)) {
            await importWatchOwnedRuntimeDataToLocalRecords({ db, payload });
            return payload;
          }
        } catch (error) {
          setRuntimeError(errorMessage(error));
        }

        await wait(WATCH_SYNC_POLL_MS);
      }
    },
    [],
  );
  const beginWatchStartSync = React.useCallback(async () => {
    if (
      !activeSession ||
      !isWatchStartSyncScreen ||
      watchStartSyncInFlightRef.current
    ) {
      return;
    }

    watchStartSyncInFlightRef.current = true;
    setRuntimeError(null);

    try {
      const sleepTiming = buildSleepTimingPrior({
        trainingEndedAt: activeSession.startedAt,
        settings: effectiveEngineSettings,
        historicalSleepPrior,
        phoneNightPrior,
      });
      const plan = buildWatchOwnedSessionPlan({
        session: activeSession,
        settings: effectiveEngineSettings,
        tlrOptions,
        sleepTiming,
      });

      await watchRuntime.beginWatchOwnedStartSync(plan);
    } catch (error) {
      setRuntimeError(errorMessage(error));
    } finally {
      watchStartSyncInFlightRef.current = false;
    }
  }, [
    activeSession,
    effectiveEngineSettings,
    historicalSleepPrior,
    isWatchStartSyncScreen,
    phoneNightPrior,
    tlrOptions,
  ]);
  const startPhoneSpeakerForWatchNight = React.useCallback(
    async (ownedStatus: WatchOwnedStatusV2) => {
      if (
        !activeSession ||
        activeSession.status !== "setup" ||
        activeSession.mode !== "watch" ||
        (ownedStatus.sessionId !== activeSession.id &&
          ownedStatus.preparedSessionId !== activeSession.id) ||
        !isWatchOwnedRuntimeStarted(ownedStatus) ||
        watchSpeakerStartedSessionRef.current === activeSession.id
      ) {
        return;
      }

      watchSpeakerStartedSessionRef.current = activeSession.id;
      setRuntimeError(null);

      try {
        const sleepTiming = buildSleepTimingPrior({
          trainingEndedAt: activeSession.startedAt,
          settings: effectiveEngineSettings,
          historicalSleepPrior,
          phoneNightPrior,
        });
        const plan = buildNativePhoneWatchSpeakerPlan({
          session: activeSession,
          settings: effectiveEngineSettings,
          tlrOptions,
          sleepTiming,
        });

        await phoneRuntime.startPhoneWatchSpeakerSession(plan);
      } catch (error) {
        setRuntimeError(errorMessage(error));
      } finally {
        sendSessionEvent("start_watch_night", new Date().toISOString());
      }
    },
    [
      activeSession,
      effectiveEngineSettings,
      historicalSleepPrior,
      phoneNightPrior,
      sendSessionEvent,
      tlrOptions,
    ],
  );
  const syncWatchLogsToPhone = React.useCallback(
    async (sessionId: string) => {
      if (watchEndCheckpointInFlightRef.current) {
        return;
      }

      watchEndCheckpointInFlightRef.current = true;
      setIsStopping(true);
      setRuntimeError(null);

      try {
        await watchRuntime.requestWatchOwnedLogSync({ sessionId });
        const payload = await waitForCompleteWatchOwnedLogs(sessionId);

        try {
          await phoneRuntime.stopPhoneTlrSession({ reason: "user_stopped" });
        } catch {
          // Watch log import is the source of truth; the phone speaker bed may
          // already be stopped or unavailable in older dev builds.
        }

        await watchRuntime.acknowledgeWatchOwnedLogSync({ sessionId });
        sendSessionEvent(
          "end_session",
          payload.summary?.stoppedAt ?? new Date().toISOString(),
        );
      } catch (error) {
        setRuntimeError(errorMessage(error));
      } finally {
        setIsStopping(false);
        watchEndCheckpointInFlightRef.current = false;
      }
    },
    [sendSessionEvent, waitForCompleteWatchOwnedLogs],
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

  const refreshWatchOwnedStatus = React.useCallback(async () => {
    if (!usesWatchRuntime) {
      return;
    }

    try {
      const ownedStatus = await watchRuntime.getLatestWatchOwnedStatus();

      setWatchOwnedStatus(ownedStatus);

      if (!ownedStatus.available) {
        return;
      }

      if (!activeSession) {
        return;
      }

      await startPhoneSpeakerForWatchNight(ownedStatus);
    } catch (error) {
      setRuntimeError(errorMessage(error));
    }
  }, [
    activeSession,
    startPhoneSpeakerForWatchNight,
    usesWatchRuntime,
  ]);

  React.useEffect(() => {
    void refreshRuntimeStatus();
    void refreshWatchOwnedStatus();

    if ((!usesPhoneRuntime && !usesWatchRuntime) || !canEnd) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      void refreshRuntimeStatus();
      void refreshWatchOwnedStatus();
    }, 5000);

    return () => clearInterval(intervalId);
  }, [
    canEnd,
    refreshRuntimeStatus,
    refreshWatchOwnedStatus,
    usesPhoneRuntime,
    usesWatchRuntime,
  ]);

  React.useEffect(() => {
    if (!isWatchStartSyncScreen) {
      return undefined;
    }

    void beginWatchStartSync();

    const intervalId = setInterval(() => {
      void beginWatchStartSync();
    }, WATCH_SYNC_POLL_MS);

    return () => clearInterval(intervalId);
  }, [beginWatchStartSync, isWatchStartSyncScreen]);

  React.useEffect(() => {
    if ((!usesPhoneRuntime && !usesWatchRuntime) || !canEnd) {
      return undefined;
    }

    const subscription = NativeAppState.addEventListener("change", (state) => {
      if (state === "active") {
        void refreshRuntimeStatus();
        void refreshWatchOwnedStatus();
      }
    });

    return () => subscription.remove();
  }, [
    canEnd,
    refreshRuntimeStatus,
    refreshWatchOwnedStatus,
    usesPhoneRuntime,
    usesWatchRuntime,
  ]);

  async function stopSession() {
    if (!activeSession) {
      return;
    }

    if (usesWatchRuntime) {
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

  if (usesWatchRuntime && isWatchStartSyncScreen) {
    return (
      <WatchConnectionCheckpoint
        detail={runtimeError}
        title="Waiting for Watch Sync"
      />
    );
  }

  if (usesWatchRuntime && isWatchWaitingForPhoneSyncScreen && activeSession) {
    return (
      <WatchConnectionCheckpoint
        detail={runtimeError}
        title="Waiting for Phone Sync"
      >
        <PrimaryPillButton
          disabled={!canSyncWatchLogs}
          icon={Sun}
          label={isStopping ? "Syncing..." : "Sync Watch"}
          onPress={() => {
            void syncWatchLogsToPhone(activeSession.id);
          }}
        />
      </WatchConnectionCheckpoint>
    );
  }

  if (activeSession && usesWatchRuntime && canEnd) {
    return (
      <Screen bottomNav={false} centered>
        <RunningSessionClock startedAt={activeSession.startedAt} />
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
