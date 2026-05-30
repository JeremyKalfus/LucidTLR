import { router } from "expo-router";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import type { LucideIcon } from "lucide-react-native";
import { AlarmClock, Moon, NotebookPen, Settings, Sparkles } from "lucide-react-native";
import React from "react";
import { Pressable, Text, View } from "react-native";

import {
  Card,
  IconButton,
  InfoRow,
  Screen,
} from "@/src/components/ui";
import { TlrOptionsControls } from "@/src/components/tlr/TlrOptionsControls";
import { getCueAppAsset } from "@/src/audio/cueAssets";
import { formatSessionLength } from "@/src/features/sessions/sessionLength";
import type { TlrOptionsPatch } from "@/src/features/tlrOptions/tlrOptions";
import { useAppState } from "@/src/state/AppState";
import { borders, colors, radii, shadows, spacing, typography } from "@/src/theme/tokens";

const labelToCardGap = 6;
const actionRowGap = 10;
const sideActionHorizontalPadding = 6;

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

function HomeActionButton({
  flex,
  icon: Icon,
  label,
  onPress,
  primary = false,
}: {
  flex?: number;
  icon?: LucideIcon;
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        ...(flex === undefined
          ? { width: "100%" }
          : {
              flexGrow: flex,
              flexShrink: 1,
              flexBasis: 0,
            }),
        minWidth: 0,
        minHeight: primary ? 78 : 72,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: radii.primaryPill,
        borderWidth: borders.hairline,
        borderColor: colors.cardBorder,
        backgroundColor: colors.card,
        paddingHorizontal: primary ? 12 : sideActionHorizontalPadding,
        opacity: pressed ? 0.72 : 1,
        boxShadow: primary ? shadows.primaryGlow : undefined,
      })}
    >
      <View
        style={{
          width: "100%",
          minWidth: 0,
          alignItems: "center",
          justifyContent: "center",
          gap: Icon ? (primary ? 4 : 5) : 0,
        }}
      >
        {Icon ? (
          <Icon
            color={colors.textMuted}
            size={24}
            strokeWidth={1.8}
          />
        ) : null}
        <Text
          selectable
          adjustsFontSizeToFit
          minimumFontScale={0.82}
          numberOfLines={primary ? 1 : 2}
          style={{
            color: primary ? colors.textPrimary : colors.textMuted,
            fontSize: typography.label.fontSize,
            lineHeight: typography.label.lineHeight,
            letterSpacing: primary
              ? typography.title.letterSpacing
              : typography.label.letterSpacing,
            textAlign: "center",
            fontWeight: "400",
          }}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

export function HomeScreen() {
  const [cuePreviewRequest, setCuePreviewRequest] = React.useState<{
    cueId: string;
    requestedAt: number;
  } | null>(null);
  const {
    engineSettings,
    latestEngineSnapshot,
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
  const engineValues = latestEngineSnapshot.currentValues;
  const tlrNights = sessionHistory.filter(
    (session) => session.sessionType === "tlr",
  ).length;
  const lastSession = sessionHistory[0] ?? null;
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

        <Card compact>
          <TlrOptionsControls
            selectedMode={selectedMode}
            tlrOptions={tlrOptions}
            typicalWakeTime={engineSettings.typicalWakeTime}
            onModeChange={setSelectedMode}
            onOptionsChange={handleTlrOptionsChange}
          />
          <InfoRow label="nights with TLR" value={String(tlrNights)} />
          <InfoRow label="sensitivity" value={engineValues.sensitivityProfile.replaceAll("_", " ")} />
          <InfoRow label="cues tonight" value={engineValues.cueCountTonight} />
          <InfoRow label="sleep prior" value={`${engineValues.sleepPriorSource} (${engineValues.sleepPriorConfidence})`} />
        </Card>
      </View>

      <View style={{ gap: actionRowGap }}>
        <HomeActionButton
          icon={Sparkles}
          label="Begin TLR"
          primary
          onPress={() => {
            startSession("tlr");
            router.push("/presleep-training");
          }}
        />
        <View style={{ flexDirection: "row", gap: actionRowGap }}>
          <HomeActionButton
            flex={1}
            icon={AlarmClock}
            label="set alarm"
            onPress={() => router.push("/settings")}
          />
          <HomeActionButton
            flex={1}
            icon={Moon}
            label="no TLR"
            onPress={() => {
              startSession("sleep_log");
              router.push("/active-night-session");
            }}
          />
          <HomeActionButton
            flex={1}
            icon={NotebookPen}
            label="journal"
            onPress={() => router.push("/journal")}
          />
        </View>
      </View>

      <View style={{ gap: labelToCardGap, marginTop: spacing.cardGap - labelToCardGap }}>
        <HomeSectionLabel>Your last sleep</HomeSectionLabel>
        <Card>
          <View style={{ minHeight: 280, justifyContent: "center" }}>
            {lastSession ? (
              <View style={{ gap: 10 }}>
                <InfoRow label="type" value={lastSession.sessionType} />
                <InfoRow label="mode" value={lastSession.mode ?? "none"} />
                <InfoRow label="status" value={lastSession.status.replaceAll("_", " ")} />
                <InfoRow label="length" value={formatSessionLength(lastSession)} />
                <InfoRow
                  label="started"
                  value={new Date(lastSession.startedAt).toLocaleString()}
                />
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
