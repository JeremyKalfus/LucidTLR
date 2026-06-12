import { router } from "expo-router";
import { Watch } from "lucide-react-native";
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
  Screen,
  SectionTitle,
} from "@/src/components/ui";
import { getLocalDb } from "@/src/data/local/expoSqliteDb";
import {
  abandonWatchModeProductSessionLocalOnly,
  isWatchModeProductFlowAvailable,
  loadWatchModeProductLockState,
  resolveWatchModeProductSync,
  type WatchModeProductLockState,
} from "@/src/features/watchMode/watchModeProductFlow";
import { useAppState } from "@/src/state/AppState";
import { colors, typography } from "@/src/theme/tokens";

const WATCH_MODE_SYNC_POLL_MS = 5000;

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
    participantId,
    reloadLocalData,
    selectSessionForMorningReview,
  } = useAppState();
  const [lock, setLock] = React.useState<WatchModeProductLockState | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

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
        void refreshAndResolve();
      }
    });

    return () => subscription.remove();
  }, [refreshAndResolve]);

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
