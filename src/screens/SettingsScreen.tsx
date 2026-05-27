import { router } from "expo-router";
import React from "react";
import { Alert, Pressable, Text, View } from "react-native";

import {
  Card,
  InfoRow,
  PrimaryPillButton,
  Screen,
  SectionTitle,
} from "@/src/components/ui";
import type { AppMode } from "@/src/domain/types";
import { cueAudio, TLR_PROTOCOL_VERSION } from "@/src/protocol/tlrProtocol";
import { useAppState } from "@/src/state/AppState";
import { borders, colors, radii, typography } from "@/src/theme/tokens";

function ModeButton({
  mode,
  active,
  onPress,
}: {
  mode: AppMode;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 44,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: borders.hairline,
        borderRadius: radii.card,
        borderColor: active ? colors.textMuted : colors.cardBorder,
        opacity: pressed ? 0.72 : 1,
      })}
    >
      <Text
        selectable
        style={{
          color: active ? colors.textPrimary : colors.textMuted,
          fontSize: typography.body.fontSize,
          lineHeight: typography.body.lineHeight,
        }}
      >
        {mode}
      </Text>
    </Pressable>
  );
}

export function SettingsScreen() {
  const [isResetting, setIsResetting] = React.useState(false);
  const [resetError, setResetError] = React.useState<string | null>(null);
  const {
    consentChoices,
    participantId,
    resetAppData,
    selectedMode,
    setSelectedMode,
  } = useAppState();

  const reset = React.useCallback(async () => {
    setIsResetting(true);
    setResetError(null);

    try {
      await resetAppData();
      router.replace("/onboarding");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Reset failed. Please try again.";

      setResetError(message);

      if (process.env.EXPO_OS !== "web") {
        Alert.alert("Reset failed", message);
      }
    } finally {
      setIsResetting(false);
    }
  }, [resetAppData]);

  const confirmReset = () => {
    if (process.env.EXPO_OS === "web" && globalThis.confirm) {
      if (
        globalThis.confirm(
          "Reset app and delete local data? This clears local onboarding, sleep, and journal data on this device.",
        )
      ) {
        void reset();
      }

      return;
    }

    Alert.alert(
      "Reset app and delete local data?",
      "This clears local onboarding, sleep, and journal data on this device.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: () => {
            void reset();
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <SectionTitle>Settings</SectionTitle>

      <Card>
        <Text
          selectable
          style={{
            color: colors.textPrimary,
            fontSize: typography.body.fontSize,
            lineHeight: typography.body.lineHeight,
          }}
        >
          Mode
        </Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <ModeButton
            mode="phone"
            active={selectedMode === "phone"}
            onPress={() => setSelectedMode("phone")}
          />
          <ModeButton
            mode="watch"
            active={selectedMode === "watch"}
            onPress={() => setSelectedMode("watch")}
          />
        </View>
      </Card>

      <Card>
        <InfoRow label="cue sound" value={cueAudio.description} />
        <InfoRow label="sensitivity preset" value="placeholder" />
        <InfoRow label="structured upload" value={consentChoices.structuredResearchUploadConsent ? "enabled" : "off"} />
        <InfoRow label="dream upload" value={consentChoices.dreamJournalUploadConsent ? "enabled" : "off"} />
      </Card>

      <Card>
        <InfoRow label="participant ID" value={participantId} />
        <InfoRow label="protocol" value={TLR_PROTOCOL_VERSION} />
        <InfoRow label="app shell" value="0.1.0" />
      </Card>

      <Card>
        <Text
          selectable
          style={{
            color: colors.textSecondary,
            fontSize: typography.body.fontSize,
            lineHeight: typography.body.lineHeight,
          }}
        >
          Settings are local React state placeholders for the first runnable
          shell. Native sensing and overnight audio behavior are not connected
          here.
        </Text>
      </Card>

      <Card>
        <Text
          selectable
          style={{
            color: colors.textSecondary,
            fontSize: typography.body.fontSize,
            lineHeight: typography.body.lineHeight,
          }}
        >
          Reset app and delete local data clears this device. Full remote
          deletion is not implemented yet.
        </Text>
        {resetError ? (
          <Text
            selectable
            style={{
              color: colors.textSecondary,
              fontSize: typography.body.fontSize,
              lineHeight: typography.body.lineHeight,
            }}
          >
            {resetError}
          </Text>
        ) : null}
        <PrimaryPillButton
          disabled={isResetting}
          label={isResetting ? "Resetting..." : "Reset app and delete local data"}
          onPress={confirmReset}
        />
      </Card>
    </Screen>
  );
}
