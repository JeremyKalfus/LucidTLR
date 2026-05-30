import { router } from "expo-router";
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from "expo-audio";
import { Headphones, Play } from "lucide-react-native";
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
import { getBuiltInCue } from "@/src/audio/cueCatalog";
import {
  FINAL_LUCID_TRAINING_DURATION_SECONDS,
  buildTrainingCueSchedule,
} from "@/src/audio/trainingAudio";
import { getCueAppAsset } from "@/src/audio/cueAssets";
import { FINAL_LUCID_TRAINING_AUDIO_ASSET } from "@/src/audio/trainingAssets";
import { PRESLEEP_SCRIPT_NOTICE, PRESLEEP_SCRIPT_PLACEHOLDER } from "@/src/protocol/tlrProtocol";
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

function formatPlaybackTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainderSeconds = safeSeconds % 60;

  return `${minutes}:${String(remainderSeconds).padStart(2, "0")}`;
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
  const session =
    activeSession?.sessionType === "tlr" ? activeSession : null;
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
  const [trainingError, setTrainingError] = React.useState<string | null>(null);
  const [trainingDebugLog, setTrainingDebugLog] = React.useState<string[]>([]);
  const [playedCueCount, setPlayedCueCount] = React.useState(0);
  const [isStartingRuntime, setIsStartingRuntime] = React.useState(false);
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
    session?.status === "waiting_for_cue_window" && session.mode === "phone";
  const isTraining = session?.status === "training";
  const isTrainingAudioReady = trainingStatus.isLoaded && cueStatus.isLoaded;

  const appendTrainingDebugEvent = React.useCallback(
    (eventType: string, payload: Record<string, unknown>) => {
      const line = `${new Date().toLocaleTimeString()} / ${eventType} / ${JSON.stringify(payload)}`;

      console.info(`[LucidCue training] ${eventType}`, payload);
      setTrainingDebugLog((log) => [line, ...log].slice(0, 12));
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

          setTrainingError(message);
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
    playScheduledCue,
    trainingCueSchedule,
    trainingStatus.currentTime,
    trainingStatus.didJustFinish,
    trainingStatus.playing,
  ]);

  React.useEffect(() => {
    if (session?.status === "training") {
      return;
    }

    nextTrainingCueIndexRef.current = 0;
    finishingTrainingRef.current = false;
  }, [session?.id, session?.status]);

  async function startTrainingPlayback() {
    if (!canStart || !isTrainingAudioReady) {
      return;
    }

    const timestamp = new Date().toISOString();

    try {
      setTrainingError(null);
      setTrainingDebugLog([]);
      setPlayedCueCount(0);
      nextTrainingCueIndexRef.current = 0;
      finishingTrainingRef.current = false;

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

      setTrainingError(message);

      if (process.env.EXPO_OS !== "web") {
        Alert.alert("Training audio failed", message);
      }
    }
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

  if (isTraining) {
    return (
      <Screen bottomNav={false}>
        <SectionTitle>Presleep training</SectionTitle>
        <RunningSessionClock
          startedAt={session.trainingStartedAt ?? session.startedAt}
        />

        <Card>
          <InfoRow label="training audio" value="FINAL Lucid Training.mp3" />
          <InfoRow label="cue sound" value={sessionCue.label} />
          <InfoRow
            label="position"
            value={`${formatPlaybackTime(trainingStatus.currentTime)} / ${formatPlaybackTime(FINAL_LUCID_TRAINING_DURATION_SECONDS)}`}
          />
          <InfoRow
            label="cue overlays"
            value={`${playedCueCount} / ${trainingCueSchedule.length}`}
          />
        </Card>

        {trainingError ? (
          <Text
            selectable
            style={{
              color: colors.textSecondary,
              fontSize: typography.body.fontSize,
              lineHeight: typography.body.lineHeight,
              textAlign: "center",
            }}
          >
            {trainingError}
          </Text>
        ) : null}

        {trainingDebugLog.length > 0 ? (
          <Card>
            {trainingDebugLog.map((line) => (
              <Text
                selectable
                key={line}
                style={{
                  color: colors.textMuted,
                  fontSize: typography.label.fontSize,
                  lineHeight: typography.label.lineHeight,
                }}
              >
                {line}
              </Text>
            ))}
          </Card>
        ) : null}
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
        <InfoRow label="training audio" value="FINAL Lucid Training.mp3" />
        <InfoRow label="cue sound" value={sessionCue.label} />
        <InfoRow
          label="cue markers"
          value={`${trainingCueSchedule.length} midpoint overlays`}
        />
        <InfoRow label="runtime" value="native iPhone Phone Mode after training" />
      </Card>

      {canSkipGuidedTraining ? (
        <Card compact>
          <InfoRow label="cue" value={sessionCue.label} />
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
