import { router } from "expo-router";
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from "expo-audio";
import type { LucideIcon } from "lucide-react-native";
import { FastForward, Headphones, Pause, Play } from "lucide-react-native";
import React from "react";
import { Alert, Pressable, Text, View } from "react-native";

import {
  Card,
  InfoRow,
  PrimaryPillButton,
  RunningSessionClock,
  Screen,
  SectionTitle,
} from "@/src/components/ui";
import { getBuiltInCue } from "@/src/audio/cueCatalog";
import {
  FINAL_LUCID_TRAINING_DURATION_SECONDS,
  buildTrainingCueSchedule,
} from "@/src/audio/trainingAudio";
import { getCueAppAsset } from "@/src/audio/cueAssets";
import { FINAL_LUCID_TRAINING_AUDIO_ASSET } from "@/src/audio/trainingAssets";
import { canTransitionSession } from "@/src/features/sessions/sessionStateMachine";
import {
  applyPhoneNightCalibrationToSettings,
  buildSleepTimingPrior,
} from "@/src/engine";
import {
  buildNativePhoneSessionPlanForLockedTraining,
  buildNativePhoneSessionPlanFromCompletedSession,
  latestPhoneTrainingCompletedTimestamp,
  phoneRuntime,
} from "@/src/native/phoneRuntime";
import {
  buildNativeWatchSessionPlan,
  watchRuntime,
  type WatchRuntimeStatus,
} from "@/src/native/watch";
import { useAppState } from "@/src/state/AppState";
import { borders, colors, radii, typography } from "@/src/theme/tokens";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Phone runtime failed.";
}

function formatPlaybackTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainderSeconds = safeSeconds % 60;

  return `${minutes}:${String(remainderSeconds).padStart(2, "0")}`;
}

function planTrainingEndFallback(session: { trainingStartedAt?: string }) {
  if (!session.trainingStartedAt) {
    return null;
  }

  return new Date(
    Date.parse(session.trainingStartedAt) +
      FINAL_LUCID_TRAINING_DURATION_SECONDS * 1000,
  ).toISOString();
}

function TrainingControlButton({
  icon: Icon,
  label,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minWidth: 128,
        minHeight: 52,
        borderRadius: radii.button,
        borderWidth: borders.hairline,
        borderColor: colors.cardBorder,
        backgroundColor: colors.card,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 8,
        paddingHorizontal: 16,
        opacity: pressed ? 0.72 : 1,
      })}
    >
      <Icon color={colors.textMuted} size={20} strokeWidth={1.8} />
      <Text
        selectable
        style={{
          color: colors.textPrimary,
          fontSize: typography.body.fontSize,
          lineHeight: typography.body.lineHeight,
          letterSpacing: typography.body.letterSpacing,
          fontWeight: "400",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function PresleepTrainingScreen() {
  const {
    activeSession,
    engineSettings,
    phoneNightCalibration,
    sendSessionEvent,
    sleepHistory,
    startSession,
    tlrOptions,
  } = useAppState();
  const session =
    activeSession?.sessionType === "tlr" ? activeSession : null;
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
  const sessionCue = getBuiltInCue(session?.selectedCueId ?? tlrOptions.selectedCueId);
  const cueAppAsset = React.useMemo(
    () => getCueAppAsset(sessionCue.id),
    [sessionCue.id],
  );
  const trainingCueSchedule = React.useMemo(
    () => buildTrainingCueSchedule(sessionCue),
    [sessionCue],
  );
  const trainingPlayer = useAudioPlayer(FINAL_LUCID_TRAINING_AUDIO_ASSET, {
    updateInterval: 250,
    downloadFirst: true,
    keepAudioSessionActive: true,
  });
  const cuePlayer = useAudioPlayer(cueAppAsset, {
    updateInterval: 250,
    downloadFirst: true,
    keepAudioSessionActive: true,
  });
  const trainingStatus = useAudioPlayerStatus(trainingPlayer);
  const cueStatus = useAudioPlayerStatus(cuePlayer);
  const [runtimeError, setRuntimeError] = React.useState<string | null>(null);
  const [playedCueCount, setPlayedCueCount] = React.useState(0);
  const [isStartingRuntime, setIsStartingRuntime] = React.useState(false);
  const [isTrainingPaused, setIsTrainingPaused] = React.useState(false);
  const [watchRuntimeStatus, setWatchRuntimeStatus] =
    React.useState<WatchRuntimeStatus | null>(null);
  const nextTrainingCueIndexRef = React.useRef(0);
  const finishingTrainingRef = React.useRef(false);
  const canStart =
    session?.status === "setup" &&
    canTransitionSession("tlr", session.status, "start_training");
  const canSkipGuidedTraining =
    session?.status === "setup" &&
    tlrOptions.skipGuidedTraining &&
    canTransitionSession("tlr", session.status, "skip_guided_training");
  const canStartRuntime =
    session?.status === "waiting_for_cue_window" &&
    (session.mode === "phone" || session.mode === "watch");
  const isTraining = session?.status === "training";
  const usesNativeLockedTraining =
    session?.mode === "phone" && phoneRuntime.isAvailable();
  const isTrainingAudioReady =
    usesNativeLockedTraining || (trainingStatus.isLoaded && cueStatus.isLoaded);

  const appendTrainingDebugEvent = React.useCallback(
    (eventType: string, payload: Record<string, unknown>) => {
      console.info(`[LucidCue training] ${eventType}`, payload);
    },
    [],
  );

  const completeTrainingFromAudio = React.useCallback(
    (reason: string) => {
      if (
        finishingTrainingRef.current ||
        !session ||
        session.status !== "training"
      ) {
        return;
      }

      finishingTrainingRef.current = true;
      trainingPlayer.pause();
      cuePlayer.pause();

      const completedAt = new Date().toISOString();

      appendTrainingDebugEvent("training_completed", {
        reason,
        sessionId: session.id,
        selectedCueId: sessionCue.id,
        playedCueCount,
      });
      sendSessionEvent("finish_training", completedAt);
    },
    [
      appendTrainingDebugEvent,
      cuePlayer,
      playedCueCount,
      sendSessionEvent,
      session,
      sessionCue.id,
      trainingPlayer,
    ],
  );

  const playScheduledCue = React.useCallback(
    (entry: (typeof trainingCueSchedule)[number]) => {
      appendTrainingDebugEvent("training_cue_marker_reached", {
        markerIndex: entry.markerIndex,
        markerMidpointSeconds: entry.markerMidpointSeconds,
        cueStartSeconds: entry.cueStartSeconds,
        selectedCueId: sessionCue.id,
      });

      void cuePlayer
        .seekTo(0)
        .then(() => {
          cuePlayer.play();
          setPlayedCueCount((count) => count + 1);
          appendTrainingDebugEvent("selected_cue_played", {
            markerIndex: entry.markerIndex,
            selectedCueId: sessionCue.id,
            cueAsset: sessionCue.nativeResourceName,
            durationSeconds: sessionCue.durationSeconds,
          });
        })
        .catch((error) => {
          const message =
            error instanceof Error ? error.message : "Cue playback failed.";

          appendTrainingDebugEvent("selected_cue_failed", {
            markerIndex: entry.markerIndex,
            selectedCueId: sessionCue.id,
            error: message,
          });
        });
    },
    [appendTrainingDebugEvent, cuePlayer, sessionCue],
  );

  React.useEffect(() => {
    if (!isTraining) {
      return;
    }

    if (isTrainingPaused && !usesNativeLockedTraining) {
      return;
    }

    let nextIndex = nextTrainingCueIndexRef.current;

    while (
      nextIndex < trainingCueSchedule.length &&
      trainingStatus.currentTime >= trainingCueSchedule[nextIndex].cueStartSeconds
    ) {
      playScheduledCue(trainingCueSchedule[nextIndex]);
      nextIndex += 1;
    }

    nextTrainingCueIndexRef.current = nextIndex;

    if (
      trainingStatus.didJustFinish ||
      (trainingStatus.currentTime >= FINAL_LUCID_TRAINING_DURATION_SECONDS - 0.25 &&
        !trainingStatus.playing)
    ) {
      completeTrainingFromAudio("training_audio_finished");
    }
  }, [
    completeTrainingFromAudio,
    isTraining,
    isTrainingPaused,
    playScheduledCue,
    trainingCueSchedule,
    trainingStatus.currentTime,
    trainingStatus.didJustFinish,
    trainingStatus.playing,
    usesNativeLockedTraining,
  ]);

  React.useEffect(() => {
    if (session?.status === "training") {
      return;
    }

    nextTrainingCueIndexRef.current = 0;
    finishingTrainingRef.current = false;
    setIsTrainingPaused(false);
  }, [session?.id, session?.status]);

  async function startTrainingPlayback() {
    if (!canStart || !isTrainingAudioReady) {
      return;
    }

    const timestamp = new Date().toISOString();

    try {
      setPlayedCueCount(0);
      setIsTrainingPaused(false);
      nextTrainingCueIndexRef.current = 0;
      finishingTrainingRef.current = false;

      if (session.mode === "phone") {
        if (!phoneRuntime.isAvailable()) {
          throw new Error(
            "Locked iPhone presleep training requires the custom iOS development build.",
          );
        }

        const plan = buildNativePhoneSessionPlanForLockedTraining({
          session,
          trainingStartedAt: timestamp,
          settings: effectiveEngineSettings,
          tlrOptions,
          historicalSleepPrior:
            sleepHistory.enabled &&
            sleepHistory.prior &&
            sleepHistory.prior.confidence !== "none"
              ? sleepHistory.prior
              : undefined,
          phoneNightPrior:
            phoneNightCalibration.nightsIncluded > 0
              ? phoneNightCalibration
              : undefined,
        });

        await phoneRuntime.startPhoneTlrSessionAfterPresleepTraining(plan);

        const nextSession = sendSessionEvent("start_training", timestamp);

        if (!nextSession) {
          await phoneRuntime.stopPhoneTlrSession({ reason: "error" });
          return;
        }

        appendTrainingDebugEvent("native_locked_training_started", {
          sessionId: nextSession.id,
          selectedCueId: sessionCue.id,
          trainingAsset: "final-lucid-training.mp3",
          markerCount: trainingCueSchedule.length,
          projectedTrainingEndedAt: plan.trainingEndedAt,
        });
        return;
      }

      await setAudioModeAsync({
        playsInSilentMode: true,
        interruptionMode: "doNotMix",
        shouldPlayInBackground: false,
        allowsRecording: false,
        shouldRouteThroughEarpiece: false,
      });
      await cuePlayer.seekTo(0);
      await trainingPlayer.seekTo(0);

      const nextSession = sendSessionEvent("start_training", timestamp);

      if (!nextSession) {
        return;
      }

      trainingPlayer.volume = 1;
      cuePlayer.volume = 1;
      trainingPlayer.play();
      appendTrainingDebugEvent("training_started", {
        sessionId: nextSession.id,
        selectedCueId: sessionCue.id,
        trainingAsset: "final-lucid-training.mp3",
        markerCount: trainingCueSchedule.length,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Training audio failed.";

      if (process.env.EXPO_OS !== "web") {
        Alert.alert("Training audio failed", message);
      }
    }
  }

  const reconcileNativeLockedTraining = React.useCallback(async () => {
    if (!session || session.status !== "training" || session.mode !== "phone") {
      return;
    }

    try {
      const status = await phoneRuntime.getPhoneRuntimeStatus();

      if (!status.available || status.sessionId !== session.id) {
        return;
      }

      const runtimeHasStarted =
        status.phase === "runtime" ||
        status.audioBedRunning ||
        status.motionRunning ||
        status.latestDecisionReason === "training_completed";

      if (!runtimeHasStarted && status.running) {
        return;
      }

      const logs = await phoneRuntime.getPhoneRuntimeLogs(session.id);
      const completedAt =
        latestPhoneTrainingCompletedTimestamp(logs) ?? planTrainingEndFallback(session);

      if (!completedAt) {
        return;
      }

      sendSessionEvent("finish_training", completedAt);
      router.replace("/active-night-session");
    } catch (error) {
      console.warn(
        "[LucidCue training] Could not reconcile native presleep training.",
        error instanceof Error
          ? error.message
          : error,
      );
    }
  }, [sendSessionEvent, session]);

  React.useEffect(() => {
    if (!session || session.status !== "training" || session.mode !== "phone") {
      return undefined;
    }

    void reconcileNativeLockedTraining();

    const intervalId = setInterval(() => {
      void reconcileNativeLockedTraining();
    }, 5000);

    return () => clearInterval(intervalId);
  }, [reconcileNativeLockedTraining, session]);

  async function toggleTrainingPause() {
    if (!session || session.status !== "training") {
      return;
    }

    try {
      if (usesNativeLockedTraining) {
        if (isTrainingPaused) {
          await phoneRuntime.resumePhonePresleepTraining();
        } else {
          await phoneRuntime.pausePhonePresleepTraining();
        }
      } else if (isTrainingPaused) {
        trainingPlayer.play();
      } else {
        trainingPlayer.pause();
        cuePlayer.pause();
      }

      setIsTrainingPaused((paused) => !paused);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not pause training.";

      if (process.env.EXPO_OS !== "web") {
        Alert.alert("Training control failed", message);
      }
    }
  }

  async function skipTraining() {
    if (!session || session.status !== "training") {
      return;
    }

    trainingPlayer.pause();
    cuePlayer.pause();
    setIsTrainingPaused(false);
    await startNightSession();
  }

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

    setRuntimeError(null);
    setIsStartingRuntime(true);

    try {
      if (runtimeSession.mode === "watch") {
        if (!runtimeSession.trainingEndedAt) {
          throw new Error("Watch Mode requires completed presleep training.");
        }

        const sleepTiming = buildSleepTimingPrior({
          trainingEndedAt: runtimeSession.trainingEndedAt,
          settings: effectiveEngineSettings,
          historicalSleepPrior:
            sleepHistory.enabled &&
            sleepHistory.prior &&
            sleepHistory.prior.confidence !== "none"
              ? sleepHistory.prior
              : undefined,
          phoneNightPrior:
            phoneNightCalibration.nightsIncluded > 0
              ? phoneNightCalibration
              : undefined,
        });
        const plan = buildNativeWatchSessionPlan({
          session: runtimeSession,
          settings: effectiveEngineSettings,
          tlrOptions,
          sleepTiming,
        });

        await watchRuntime.startWatchSession(plan);
        setWatchRuntimeStatus(await watchRuntime.getWatchRuntimeStatus());
        router.push("/active-night-session");
        return;
      }

      const plan = buildNativePhoneSessionPlanFromCompletedSession({
        session: runtimeSession,
        settings: effectiveEngineSettings,
        tlrOptions,
        historicalSleepPrior:
          sleepHistory.enabled &&
          sleepHistory.prior &&
          sleepHistory.prior.confidence !== "none"
            ? sleepHistory.prior
            : undefined,
        phoneNightPrior:
          phoneNightCalibration.nightsIncluded > 0
            ? phoneNightCalibration
            : undefined,
      });

      await phoneRuntime.startPhoneTlrSession(plan);
      router.push("/active-night-session");
    } catch (error) {
      const message = errorMessage(error);

      setRuntimeError(message);

      if (process.env.EXPO_OS !== "web") {
        Alert.alert("Runtime failed", message);
      }
    } finally {
      setIsStartingRuntime(false);
    }
  }

  if (isTraining) {
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
            Presleep training
          </Text>
          <RunningSessionClock
            startedAt={session.trainingStartedAt ?? session.startedAt}
          />
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: 10,
            }}
          >
            <TrainingControlButton
              icon={isTrainingPaused ? Play : Pause}
              label={isTrainingPaused ? "Resume" : "Pause"}
              onPress={() => {
                void toggleTrainingPause();
              }}
            />
            <TrainingControlButton
              icon={FastForward}
              label="Skip"
              onPress={() => {
                void skipTraining();
              }}
            />
          </View>
        </View>
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
            Cue/training player
          </Text>
        </View>
        <InfoRow label="training audio" value="FINAL Lucid Training.mp3" />
        <InfoRow label="cue sound" value={sessionCue.label} />
        <InfoRow
          label="number of training cues"
          value={String(trainingCueSchedule.length)}
        />
        <InfoRow
          label="runtime"
          value={formatPlaybackTime(FINAL_LUCID_TRAINING_DURATION_SECONDS)}
        />
        <InfoRow label="mode" value={session?.mode ?? "none"} />
      </Card>

      {canSkipGuidedTraining ? (
        <Card compact>
          <InfoRow label="cue" value={sessionCue.label} />
          <InfoRow label="training" value="guided script skipped" />
          <InfoRow label="checkpoint" value="cue-associated lucid mindset" />
        </Card>
      ) : null}

      <Card compact>
        <InfoRow label="session status" value={session?.status ?? "none"} />
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
          disabled={!isTrainingAudioReady}
          label={isTrainingAudioReady ? "Start Training" : "Loading Training Audio..."}
          onPress={() => {
            void startTrainingPlayback();
          }}
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
                  ? session.mode === "watch"
                    ? "Starting Watch Runtime..."
                    : "Starting Phone Runtime..."
                  : session.mode === "watch"
                    ? "Start Native Watch Runtime"
                    : "Start Native Phone Runtime"
              }
              onPress={() => {
                void startNightSession();
              }}
            />
          ) : null}
          {watchRuntimeStatus ? (
            <Card compact>
              <InfoRow
                label="watch runtime"
                value={watchRuntimeStatus.running ? "running" : "idle"}
              />
              <InfoRow
                label="classifier"
                value={
                  watchRuntimeStatus.modelAvailable
                    ? watchRuntimeStatus.classifierVersion
                    : "unavailable; cueing disabled"
                }
              />
            </Card>
          ) : null}
          <PrimaryPillButton
            label="Open Night Session"
            onPress={() => router.push("/active-night-session")}
          />
        </View>
      ) : null}

      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <Play color={colors.textDim} size={16} strokeWidth={1.6} />
        <Text
          selectable
          style={{
            color: colors.textDim,
            fontSize: typography.label.fontSize,
            lineHeight: typography.label.lineHeight,
          }}
        >
          Training playback uses the selected cue as separate overlay events;
          locked Phone Mode uses that same selected cue later.
        </Text>
      </View>
    </Screen>
  );
}
