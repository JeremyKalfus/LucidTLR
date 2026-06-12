import { router } from "expo-router";
import { FastForward, Pause, Play, Watch } from "lucide-react-native";
import React from "react";
import {
  Alert,
  AppState as NativeAppState,
  Pressable,
  Text,
  View,
} from "react-native";

import {
  InfoRow,
  PrimaryPillButton,
  Screen,
  SectionTitle,
} from "@/src/components/ui";
import { getLocalDb } from "@/src/data/local/expoSqliteDb";
import {
  abandonWatchModeProductSessionLocalOnly,
  isWatchModeProductFlowAvailable,
  loadWatchModeProductLockState,
  markWatchModeProductTrainingEnded,
  markWatchModeProductTrainingStarted,
  resolveWatchModeProductSync,
  type WatchModeProductLockState,
} from "@/src/features/watchMode/watchModeProductFlow";
import {
  formatWatchTrainingPlaybackTime,
  getWatchModeTrainingPlaybackState,
  WATCH_MODE_SKIP_TRAINING_CONFIRM_COPY,
} from "@/src/features/watchMode/watchModeTrainingPlayback";
import {
  buildNativePhoneSessionPlanForWatchLockedTraining,
  latestPhoneTrainingCompletedTimestamp,
  phoneRuntime,
} from "@/src/native/phoneRuntime";
import { useAppState } from "@/src/state/AppState";
import { colors, typography } from "@/src/theme/tokens";

const WATCH_MODE_SYNC_POLL_MS = 5000;
const WATCH_MODE_TRAINING_POLL_MS = 5000;

export const WATCH_MODE_ESCAPE_HATCH_DRAFT_COPY = {
  title: "End Watch session?",
  message:
    "Your Watch may still be recording this night. Ending here may lose the night's data from the Watch.",
  confirm: "End Session",
} as const;

function formatStartedAt(value: string | undefined): string {
  if (!value) {
    return "unknown time";
  }

  return new Date(value).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function titleForLock(lock: WatchModeProductLockState | null): string {
  if (!lock?.state) {
    return "Watch Mode running";
  }

  if (lock.phase === "syncing") {
    return "Night ended on watch - syncing...";
  }

  if (lock.phase === "error") {
    return "Watch Mode needs attention";
  }

  return `Watch Mode running - started ${formatStartedAt(
    lock.state.startedAt ?? lock.state.lastStatusAt ?? lock.state.updatedAt,
  )}`;
}

export function WatchModeRunningScreen() {
  const {
    engineSettings,
    participantId,
    reloadLocalData,
    selectSessionForMorningReview,
    tlrOptions,
  } = useAppState();
  const [lock, setLock] = React.useState<WatchModeProductLockState | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [trainingErrorMessage, setTrainingErrorMessage] =
    React.useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isTrainingPaused, setIsTrainingPaused] = React.useState(false);
  const [trainingNowMs, setTrainingNowMs] = React.useState(() => Date.now());
  const trainingStartAttemptRef = React.useRef<string | null>(null);
  const session = lock?.session ?? null;
  const trainingPlayback = getWatchModeTrainingPlaybackState({
    session,
    now: trainingNowMs,
  });

  const updateLockSession = React.useCallback((nextSession: NonNullable<typeof session>) => {
    setLock((current) =>
      current?.state?.sessionId === nextSession.id
        ? { ...current, session: nextSession }
        : current,
    );
  }, []);

  const markTrainingEnded = React.useCallback(
    async (input: { endedAt: string; skipped?: boolean }) => {
      if (!session) {
        return null;
      }

      const db = await getLocalDb();
      const nextSession = await markWatchModeProductTrainingEnded({
        db,
        participantId,
        sessionId: session.id,
        endedAt: input.endedAt,
        skipped: input.skipped,
      });

      updateLockSession(nextSession);
      await reloadLocalData();

      return nextSession;
    },
    [participantId, reloadLocalData, session, updateLockSession],
  );

  const refreshAndResolve = React.useCallback(async () => {
    if (!isWatchModeProductFlowAvailable()) {
      router.replace("/");
      return;
    }

    setIsRefreshing(true);

    try {
      const db = await getLocalDb();
      const next = await resolveWatchModeProductSync({
        db,
        participantId,
      });

      setLock(next);
      setErrorMessage(null);

      if (next.resolvedSessionId) {
        await reloadLocalData();
        await selectSessionForMorningReview(next.resolvedSessionId);
        router.replace("/morning-review");
      } else if (next.phase === "none") {
        router.replace("/");
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Watch Mode sync could not refresh.",
      );
    } finally {
      setIsRefreshing(false);
    }
  }, [participantId, reloadLocalData, selectSessionForMorningReview]);

  React.useEffect(() => {
    let cancelled = false;

    async function loadInitialState() {
      try {
        const db = await getLocalDb();
        const initial = await loadWatchModeProductLockState({
          db,
          participantId,
        });

        if (!cancelled) {
          setLock(initial);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Watch Mode state could not load.",
          );
        }
      }

      if (!cancelled) {
        await refreshAndResolve();
      }
    }

    void loadInitialState();

    return () => {
      cancelled = true;
    };
  }, [participantId, refreshAndResolve]);

  React.useEffect(() => {
    const intervalId = setInterval(() => {
      void refreshAndResolve();
    }, WATCH_MODE_SYNC_POLL_MS);

    return () => clearInterval(intervalId);
  }, [refreshAndResolve]);

  React.useEffect(() => {
    const subscription = NativeAppState.addEventListener("change", (state) => {
      if (state === "active") {
        setTrainingNowMs(Date.now());
        void refreshAndResolve();
      }
    });

    return () => subscription.remove();
  }, [refreshAndResolve]);

  React.useEffect(() => {
    if (!session || (!trainingPlayback.visible && !trainingPlayback.windowExpired)) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      setTrainingNowMs(Date.now());
    }, 1000);

    return () => clearInterval(intervalId);
  }, [
    session,
    trainingPlayback.visible,
    trainingPlayback.windowExpired,
  ]);

  React.useEffect(() => {
    if (
      !session ||
      !lock?.state ||
      !trainingPlayback.shouldStartPlayback ||
      trainingStartAttemptRef.current === session.id
    ) {
      return undefined;
    }

    let cancelled = false;
    const currentSession = session;
    trainingStartAttemptRef.current = currentSession.id;

    async function startWatchTrainingPlayback() {
      const startedAt = new Date().toISOString();

      try {
        if (!phoneRuntime.isAvailable()) {
          throw new Error(
            "Locked presleep training requires the current iOS TestFlight build.",
          );
        }

        const db = await getLocalDb();
        const nextSession = await markWatchModeProductTrainingStarted({
          db,
          participantId,
          sessionId: currentSession.id,
          startedAt,
        });
        const plan = buildNativePhoneSessionPlanForWatchLockedTraining({
          session: nextSession,
          trainingStartedAt: startedAt,
          settings: engineSettings,
          tlrOptions,
        });

        if (!cancelled) {
          updateLockSession(nextSession);
        }

        await phoneRuntime.startPhonePresleepTrainingOnly(plan);

        if (!cancelled) {
          setIsTrainingPaused(false);
          setTrainingErrorMessage(null);
          setTrainingNowMs(Date.now());
        }

        await reloadLocalData();
      } catch (error) {
        if (!cancelled) {
          setTrainingErrorMessage(
            error instanceof Error
              ? error.message
              : "Presleep training could not start.",
          );
        }
      }
    }

    void startWatchTrainingPlayback();

    return () => {
      cancelled = true;
    };
  }, [
    engineSettings,
    lock?.state,
    participantId,
    reloadLocalData,
    session,
    tlrOptions,
    trainingPlayback.shouldStartPlayback,
    updateLockSession,
  ]);

  const reconcileWatchTrainingPlayback = React.useCallback(async () => {
    if (!session?.trainingStartedAt || session.trainingEndedAt) {
      return;
    }

    const currentPlayback = getWatchModeTrainingPlaybackState({
      session,
      now: Date.now(),
    });

    if (currentPlayback.windowExpired) {
      try {
        await phoneRuntime.stopPhonePresleepTrainingOnly({
          reason: "window_expired",
        });
      } catch {
        // The native player may already have completed or been torn down.
      }

      await markTrainingEnded({
        endedAt: new Date().toISOString(),
      });
      setIsTrainingPaused(false);
      return;
    }

    try {
      const status = await phoneRuntime.getPhoneRuntimeStatus();

      if (status.sessionId === session.id && status.phase === "training") {
        setIsTrainingPaused(status.trainingAudioRunning === false);
      }

      const logs = await phoneRuntime.getPhoneRuntimeLogs(session.id);
      const completedAt = latestPhoneTrainingCompletedTimestamp(logs);

      if (completedAt) {
        await markTrainingEnded({
          endedAt: completedAt,
        });
        setIsTrainingPaused(false);
      }
    } catch (error) {
      setTrainingErrorMessage(
        error instanceof Error
          ? error.message
          : "Presleep training status could not refresh.",
      );
    }
  }, [markTrainingEnded, session]);

  React.useEffect(() => {
    if (!session?.trainingStartedAt || session.trainingEndedAt) {
      return undefined;
    }

    void reconcileWatchTrainingPlayback();

    const intervalId = setInterval(() => {
      void reconcileWatchTrainingPlayback();
    }, WATCH_MODE_TRAINING_POLL_MS);

    return () => clearInterval(intervalId);
  }, [reconcileWatchTrainingPlayback, session]);

  const skipWatchTraining = React.useCallback(async () => {
    if (!session || session.trainingEndedAt) {
      return;
    }

    try {
      try {
        await phoneRuntime.stopPhonePresleepTrainingOnly({
          reason: "user_skipped",
        });
      } catch {
        // A missing native player should not restage or keep the section open.
      }

      await markTrainingEnded({
        endedAt: new Date().toISOString(),
        skipped: true,
      });
      setIsTrainingPaused(false);
      setTrainingErrorMessage(null);
    } catch (error) {
      setTrainingErrorMessage(
        error instanceof Error
          ? error.message
          : "Presleep training could not be skipped.",
      );
    }
  }, [markTrainingEnded, session]);

  const confirmSkipTraining = React.useCallback(() => {
    Alert.alert(
      WATCH_MODE_SKIP_TRAINING_CONFIRM_COPY.title,
      WATCH_MODE_SKIP_TRAINING_CONFIRM_COPY.message,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: WATCH_MODE_SKIP_TRAINING_CONFIRM_COPY.confirm,
          style: "destructive",
          onPress: () => {
            void skipWatchTraining();
          },
        },
      ],
    );
  }, [skipWatchTraining]);

  const toggleTrainingPause = React.useCallback(async () => {
    if (!session?.trainingStartedAt || session.trainingEndedAt) {
      return;
    }

    try {
      if (isTrainingPaused) {
        await phoneRuntime.resumePhonePresleepTraining();
      } else {
        await phoneRuntime.pausePhonePresleepTraining();
      }

      setIsTrainingPaused((paused) => !paused);
      setTrainingErrorMessage(null);
    } catch (error) {
      setTrainingErrorMessage(
        error instanceof Error
          ? error.message
          : "Presleep training control failed.",
      );
    }
  }, [isTrainingPaused, session]);

  const confirmLocalEnd = React.useCallback(() => {
    Alert.alert(
      WATCH_MODE_ESCAPE_HATCH_DRAFT_COPY.title,
      WATCH_MODE_ESCAPE_HATCH_DRAFT_COPY.message,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: WATCH_MODE_ESCAPE_HATCH_DRAFT_COPY.confirm,
          style: "destructive",
          onPress: async () => {
            const db = await getLocalDb();

            try {
              await phoneRuntime.stopPhonePresleepTrainingOnly({
                reason: "user_stopped",
              });
            } catch {
              // Ending the phone lock should proceed even if training already stopped.
            }
            await abandonWatchModeProductSessionLocalOnly({
              db,
              participantId,
            });
            await reloadLocalData();
            router.replace("/");
          },
        },
      ],
    );
  }, [participantId, reloadLocalData]);

  return (
    <Screen bottomNav={false} centered>
      <View style={{ alignSelf: "center", gap: 14, width: "100%" }}>
        {trainingPlayback.visible ? (
          <View style={{ gap: 10, paddingBottom: 2 }}>
            <Text
              selectable
              style={{
                color: colors.textPrimary,
                fontSize: typography.body.fontSize,
                lineHeight: typography.body.lineHeight,
                fontWeight: "400",
              }}
            >
              Presleep training playing
            </Text>
            <InfoRow
              label="elapsed"
              value={formatWatchTrainingPlaybackTime(
                trainingPlayback.elapsedSeconds,
              )}
            />
            <InfoRow
              label="remaining"
              value={formatWatchTrainingPlaybackTime(
                trainingPlayback.remainingSeconds,
              )}
            />
            <PrimaryPillButton
              icon={isTrainingPaused ? Play : Pause}
              label={isTrainingPaused ? "Resume" : "Pause"}
              onPress={() => {
                void toggleTrainingPause();
              }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Skip Training"
              onPress={confirmSkipTraining}
              style={({ pressed }) => ({
                alignSelf: "flex-start",
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                opacity: pressed ? 0.65 : 1,
                paddingVertical: 4,
              })}
            >
              <FastForward
                color={colors.textDim}
                size={15}
                strokeWidth={1.7}
              />
              <Text
                selectable
                style={{
                  color: colors.textDim,
                  fontSize: typography.label.fontSize,
                  lineHeight: typography.label.lineHeight,
                  textDecorationLine: "underline",
                }}
              >
                Skip Training
              </Text>
            </Pressable>
          </View>
        ) : null}

        <SectionTitle>{titleForLock(lock)}</SectionTitle>

        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Watch color={colors.textMuted} size={21} strokeWidth={1.8} />
            <Text
              selectable
              style={{
                color: colors.textPrimary,
                flex: 1,
                fontSize: typography.body.fontSize,
                lineHeight: typography.body.lineHeight,
              }}
            >
              The Watch owns this night. Keep the session controls on the Watch.
            </Text>
          </View>

          <InfoRow label="session" value={lock?.state?.sessionId ?? "loading"} />
          <InfoRow label="ledger" value={lock?.state?.status ?? "loading"} />
          <InfoRow
            label="watch state"
            value={lock?.state?.lastKnownWatchState ?? "waiting"}
          />
          <InfoRow
            label="package"
            value={lock?.state?.packageId ?? "not sealed"}
          />
          <InfoRow
            label="transport"
            value={
              lock?.status.lastMessageType
                ? `${lock.status.lastMessageType}`
                : "waiting"
            }
          />
          <InfoRow
            label="refresh"
            value={isRefreshing ? "syncing" : "idle"}
          />
        </View>

        {trainingErrorMessage ? (
          <View style={{ paddingVertical: 2 }}>
            <Text
              selectable
              style={{
                color: colors.textSecondary,
                fontSize: typography.body.fontSize,
                lineHeight: typography.body.lineHeight,
              }}
            >
              {trainingErrorMessage}
            </Text>
          </View>
        ) : null}

        {errorMessage ? (
          <View style={{ paddingVertical: 2 }}>
            <Text
              selectable
              style={{
                color: colors.textSecondary,
                fontSize: typography.body.fontSize,
                lineHeight: typography.body.lineHeight,
              }}
            >
              {errorMessage}
            </Text>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="End session on this phone"
          onPress={confirmLocalEnd}
          style={({ pressed }) => ({
            alignSelf: "flex-start",
            opacity: pressed ? 0.65 : 1,
            paddingVertical: 8,
          })}
        >
          <Text
            selectable
            style={{
              color: colors.textDim,
              fontSize: typography.label.fontSize,
              lineHeight: typography.label.lineHeight,
              textDecorationLine: "underline",
            }}
          >
            End session on this phone
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}
