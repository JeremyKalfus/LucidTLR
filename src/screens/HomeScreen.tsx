import { router } from "expo-router";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { AlarmClock, Moon, NotebookPen, Settings, Sparkles } from "lucide-react-native";
import React from "react";
import { Alert, Text, View } from "react-native";

import {
  Card,
  IconButton,
  InfoRow,
  PrimaryPillButton,
  Screen,
} from "@/src/components/ui";
import { SleepNightGraph } from "@/src/components/sleep/SleepNightGraph";
import { TlrOptionsControls } from "@/src/components/tlr/TlrOptionsControls";
import { getCueAppAsset } from "@/src/audio/cueAssets";
import {
  loadArchivedPhoneRuntimeLogs,
  saveArchivedPhoneRuntimeLogs,
} from "@/src/data/local/fullDataBackup";
import { getLocalDb } from "@/src/data/local/expoSqliteDb";
import { formatSessionLength } from "@/src/features/sessions/sessionLength";
import type { TlrOptionsPatch } from "@/src/features/tlrOptions/tlrOptions";
import {
  phoneRuntime,
  type NativePhoneRuntimeEvent,
} from "@/src/native/phoneRuntime";
import {
  watchTlrStartBlockReason,
  watchRuntime,
} from "@/src/native/watch";
import { useAppState } from "@/src/state/AppState";
import { colors, spacing, typography } from "@/src/theme/tokens";

const labelToCardGap = 6;
const actionRowGap = 10;

function HomeSectionLabel({ children }: { children: string }) {
  return (
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
      {children}
    </Text>
  );
}

export function HomeScreen() {
  const [cuePreviewRequest, setCuePreviewRequest] = React.useState<{
    cueId: string;
    requestedAt: number;
  } | null>(null);
  const {
    engineSettings,
    selectedMode,
    sessionHistory,
    setSelectedMode,
    startSession,
    tlrOptions,
    updateTlrOptions,
  } = useAppState();
  const cuePreviewAsset = React.useMemo(
    () =>
      cuePreviewRequest
        ? getCueAppAsset(cuePreviewRequest.cueId)
        : null,
    [cuePreviewRequest],
  );
  const cuePreviewPlayer = useAudioPlayer(cuePreviewAsset, {
    updateInterval: 250,
    downloadFirst: true,
    keepAudioSessionActive: false,
  });
  const cuePreviewStatus = useAudioPlayerStatus(cuePreviewPlayer);
  const lastSession = sessionHistory[0] ?? null;
  const [lastSleepLogs, setLastSleepLogs] = React.useState<
    NativePhoneRuntimeEvent[]
  >([]);
  const handleBeginTlr = React.useCallback(async () => {
    if (selectedMode === "watch") {
      let status = null;

      try {
        status = await watchRuntime.getWatchRuntimeStatus();
      } catch {
        status = null;
      }

      const blockReason = watchTlrStartBlockReason(status);

      if (blockReason) {
        Alert.alert("Watch not connected", blockReason);
        return;
      }
    }

    startSession("tlr");
    router.push("/presleep-training");
  }, [selectedMode, startSession]);
  const handleTlrOptionsChange = React.useCallback(
    (patch: TlrOptionsPatch) => {
      void updateTlrOptions(patch);

      if (patch.selectedCueId) {
        setCuePreviewRequest({
          cueId: patch.selectedCueId,
          requestedAt: Date.now(),
        });
      }
    },
    [updateTlrOptions],
  );

  React.useEffect(() => {
    if (!cuePreviewRequest || !cuePreviewStatus.isLoaded) {
      return;
    }

    let cancelled = false;

    async function playCuePreview() {
      try {
        await setAudioModeAsync({
          playsInSilentMode: true,
          interruptionMode: "doNotMix",
          shouldPlayInBackground: false,
          allowsRecording: false,
          shouldRouteThroughEarpiece: false,
        });
        cuePreviewPlayer.pause();
        cuePreviewPlayer.volume = 1;
        await cuePreviewPlayer.seekTo(0);

        if (!cancelled) {
          cuePreviewPlayer.play();
        }
      } catch (error) {
        console.warn("[LucidCue] Cue preview failed", error);
      }
    }

    void playCuePreview();

    return () => {
      cancelled = true;
    };
  }, [
    cuePreviewPlayer,
    cuePreviewRequest,
    cuePreviewStatus.isLoaded,
  ]);

  React.useEffect(() => {
    let cancelled = false;

    async function loadLastSleepLogs() {
      if (!lastSession) {
        setLastSleepLogs([]);
        return;
      }

      try {
        const db = await getLocalDb();
        const archivedLogs = await loadArchivedPhoneRuntimeLogs(db);
        let logs = archivedLogs[lastSession.id] ?? [];

        if (lastSession.sessionType === "tlr" && lastSession.mode === "phone") {
          try {
            const nativeLogs = await phoneRuntime.getPhoneRuntimeLogs(lastSession.id);

            if (nativeLogs.length > 0) {
              logs = nativeLogs;
              await saveArchivedPhoneRuntimeLogs({
                db,
                logs: {
                  ...archivedLogs,
                  [lastSession.id]: nativeLogs,
                },
                updatedAt: new Date().toISOString(),
              });
            }
          } catch {
            // Archived logs still let Home render the latest imported night.
          }
        }

        if (!cancelled) {
          setLastSleepLogs(logs);
        }
      } catch {
        if (!cancelled) {
          setLastSleepLogs([]);
        }
      }
    }

    void loadLastSleepLogs();

    return () => {
      cancelled = true;
    };
  }, [lastSession]);

  return (
    <Screen>
      <View style={{ gap: labelToCardGap }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <HomeSectionLabel>TLR options</HomeSectionLabel>
          <IconButton
            icon={Settings}
            label="Open settings"
            onPress={() => router.push("/settings")}
          />
        </View>

        <View style={{ gap: 8, paddingTop: 4 }}>
          <TlrOptionsControls
            selectedMode={selectedMode}
            tlrOptions={tlrOptions}
            typicalWakeTime={engineSettings.typicalWakeTime}
            onModeChange={setSelectedMode}
            onOptionsChange={handleTlrOptionsChange}
          />
        </View>
      </View>

      <View style={{ gap: actionRowGap }}>
        <PrimaryPillButton
          icon={Sparkles}
          label="Begin TLR"
          onPress={() => {
            void handleBeginTlr();
          }}
        />
        <View style={{ flexDirection: "row", gap: actionRowGap }}>
          <PrimaryPillButton
            flex={1}
            icon={AlarmClock}
            label="Set Alarm"
            onPress={() => router.push("/settings")}
          />
          <PrimaryPillButton
            flex={1}
            icon={Moon}
            label="No TLR"
            onPress={() => {
              startSession("sleep_log");
              router.push("/active-night-session");
            }}
          />
          <PrimaryPillButton
            flex={1}
            icon={NotebookPen}
            label="Journal"
            onPress={() => router.push("/journal")}
          />
        </View>
      </View>

      <View style={{ gap: labelToCardGap, marginTop: spacing.cardGap - labelToCardGap }}>
        <HomeSectionLabel>Your last sleep</HomeSectionLabel>
        <Card>
          <View style={{ minHeight: 280, justifyContent: "center" }}>
            {lastSession ? (
              <View style={{ gap: 12 }}>
                <SleepNightGraph
                  endAt={lastSession.endedAt}
                  logs={lastSleepLogs}
                  startAt={
                    lastSession.trainingStartedAt ?? lastSession.startedAt
                  }
                />
                <InfoRow label="type" value={lastSession.sessionType} />
                <InfoRow label="length" value={formatSessionLength(lastSession)} />
                <InfoRow label="mode" value={lastSession.mode ?? "none"} />
              </View>
            ) : (
              <Text
                selectable
                style={{
                  color: colors.textDim,
                  fontSize: typography.body.fontSize,
                  lineHeight: typography.body.lineHeight,
                  textAlign: "center",
                }}
              >
                No sleep sessions logged yet.
              </Text>
            )}
          </View>
        </Card>
      </View>
    </Screen>
  );
}
