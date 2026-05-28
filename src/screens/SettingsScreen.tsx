import { router } from "expo-router";
import React from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";

import {
  Card,
  InfoRow,
  PrimaryPillButton,
  Screen,
  SectionTitle,
} from "@/src/components/ui";
import type { AppMode } from "@/src/domain/types";
import {
  formatEnginePercent,
  getProfileDefaults,
  type CueDecisionSettings,
  type SoundSensitivityProfile,
} from "@/src/engine";
import type { ExternalSleepSource } from "@/src/domain/types";
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

function SettingInput({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text
        selectable
        style={{
          color: colors.textMuted,
          fontSize: typography.label.fontSize,
          lineHeight: typography.label.lineHeight,
        }}
      >
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={colors.textDim}
        style={{
          minHeight: 40,
          borderWidth: borders.hairline,
          borderColor: colors.cardBorder,
          borderRadius: radii.card,
          color: colors.textPrimary,
          paddingHorizontal: 12,
          fontSize: typography.body.fontSize,
          lineHeight: typography.body.lineHeight,
        }}
      />
    </View>
  );
}

function NumericSettingInput({
  label,
  settingKey,
  settings,
  updateEngineSettings,
}: {
  label: string;
  settingKey: keyof CueDecisionSettings;
  settings: CueDecisionSettings;
  updateEngineSettings: (patch: Partial<CueDecisionSettings>) => Promise<void>;
}) {
  const value = settings[settingKey];

  if (typeof value !== "number") {
    return null;
  }

  return (
    <SettingInput
      label={label}
      value={String(value)}
      onChangeText={(text) => {
        const nextValue = Number(text);

        if (Number.isFinite(nextValue)) {
          void updateEngineSettings({ [settingKey]: nextValue });
        }
      }}
    />
  );
}

function SensitivityButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 42,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: borders.hairline,
        borderRadius: radii.card,
        borderColor: active ? colors.textMuted : colors.cardBorder,
        opacity: pressed ? 0.72 : 1,
        paddingHorizontal: 6,
      })}
    >
      <Text
        selectable
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        numberOfLines={1}
        style={{
          color: active ? colors.textPrimary : colors.textMuted,
          fontSize: typography.label.fontSize,
          lineHeight: typography.label.lineHeight,
          textAlign: "center",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function formatSleepHistorySource(source: ExternalSleepSource | null): string {
  if (source === "apple_health") {
    return "Apple Health";
  }

  if (source === "health_connect") {
    return "Health Connect";
  }

  return "none";
}

function formatOptionalDate(value: string | undefined): string {
  return value ? new Date(value).toLocaleString() : "never";
}

export function SettingsScreen() {
  const [isResetting, setIsResetting] = React.useState(false);
  const [resetError, setResetError] = React.useState<string | null>(null);
  const {
    consentChoices,
    engineSettings,
    isSyncingSleepHistory,
    participantId,
    resetAppData,
    selectedMode,
    setSelectedMode,
    setSleepHistoryEnabled,
    sleepHistory,
    syncSleepHistoryNow,
    updateEngineSettings,
  } = useAppState();
  const applySensitivityProfile = React.useCallback(
    (soundSensitivity: SoundSensitivityProfile) => {
      void updateEngineSettings({
        soundSensitivity,
        ...getProfileDefaults(soundSensitivity),
      });
    },
    [updateEngineSettings],
  );

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
        <InfoRow label="structured upload" value={consentChoices.structuredResearchUploadConsent ? "enabled" : "off"} />
        <InfoRow label="dream upload" value={consentChoices.dreamJournalUploadConsent ? "enabled" : "off"} />
      </Card>

      <SectionTitle>Engine assumptions</SectionTitle>
      <Card>
        <Text
          selectable
          style={{
            color: colors.textPrimary,
            fontSize: typography.body.fontSize,
            lineHeight: typography.body.lineHeight,
          }}
        >
          Sensitivity
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <SensitivityButton
            active={engineSettings.soundSensitivity === "sensitive"}
            label="Sensitive"
            onPress={() => applySensitivityProfile("sensitive")}
          />
          <SensitivityButton
            active={engineSettings.soundSensitivity === "standard"}
            label="Standard"
            onPress={() => applySensitivityProfile("standard")}
          />
          <SensitivityButton
            active={engineSettings.soundSensitivity === "hard_to_wake"}
            label="Hard"
            onPress={() => applySensitivityProfile("hard_to_wake")}
          />
        </View>
        <SettingInput
          label="typical bedtime"
          value={engineSettings.typicalBedtime}
          onChangeText={(typicalBedtime) =>
            void updateEngineSettings({ typicalBedtime })
          }
        />
        <SettingInput
          label="typical wake time"
          value={engineSettings.typicalWakeTime}
          onChangeText={(typicalWakeTime) =>
            void updateEngineSettings({ typicalWakeTime })
          }
        />
        <NumericSettingInput
          label="typical sleep duration hours"
          settingKey="typicalSleepDurationHours"
          settings={engineSettings}
          updateEngineSettings={updateEngineSettings}
        />
        <NumericSettingInput
          label="sleep latency minutes"
          settingKey="selfReportedSleepLatencyMinutes"
          settings={engineSettings}
          updateEngineSettings={updateEngineSettings}
        />
      </Card>

      <SectionTitle>Cue timing</SectionTitle>
      <Card>
        <NumericSettingInput
          label="cue delay hours after training"
          settingKey="cueStartDelayHoursAfterTraining"
          settings={engineSettings}
          updateEngineSettings={updateEngineSettings}
        />
        <SettingInput
          label="cue interval seconds"
          value={`${engineSettings.cueIntervalRangeSeconds[0]}-${engineSettings.cueIntervalRangeSeconds[1]}`}
          onChangeText={(text) => {
            const [minText, maxText] = text.split("-");
            const min = Number(minText);
            const max = Number(maxText);

            if (Number.isFinite(min) && Number.isFinite(max)) {
              void updateEngineSettings({ cueIntervalRangeSeconds: [min, max] });
            }
          }}
        />
        <NumericSettingInput
          label="stable low movement seconds"
          settingKey="stableLowMovementRequiredSeconds"
          settings={engineSettings}
          updateEngineSettings={updateEngineSettings}
        />
        <NumericSettingInput
          label="Watch REM threshold"
          settingKey="remThreshold"
          settings={engineSettings}
          updateEngineSettings={updateEngineSettings}
        />
      </Card>

      <SectionTitle>Sleep history calibration</SectionTitle>
      <Card>
        <InfoRow label="enabled" value={sleepHistory.enabled ? "on" : "off"} />
        <InfoRow label="source" value={formatSleepHistorySource(sleepHistory.source)} />
        <InfoRow label="permission" value={sleepHistory.permissionStatus} />
        <InfoRow label="nights imported" value={String(sleepHistory.nightsImported)} />
        <InfoRow label="last import" value={formatOptionalDate(sleepHistory.lastImportedAt)} />
        <InfoRow
          label="prior confidence"
          value={sleepHistory.prior?.confidence ?? "none"}
        />
        {sleepHistory.lastSyncError ? (
          <Text
            selectable
            style={{
              color: colors.textSecondary,
              fontSize: typography.body.fontSize,
              lineHeight: typography.body.lineHeight,
            }}
          >
            {sleepHistory.lastSyncError}
          </Text>
        ) : null}
        <Text
          selectable
          style={{
            color: colors.textSecondary,
            fontSize: typography.body.fontSize,
            lineHeight: typography.body.lineHeight,
          }}
        >
          Used locally to estimate better cue windows. Not uploaded by default.
        </Text>
        <PrimaryPillButton
          disabled={isSyncingSleepHistory}
          label={
            sleepHistory.enabled
              ? "Turn sleep history off"
              : "Use sleep history to improve cue timing"
          }
          onPress={() => {
            void setSleepHistoryEnabled(!sleepHistory.enabled);
          }}
        />
        {sleepHistory.enabled ? (
          <PrimaryPillButton
            disabled={isSyncingSleepHistory}
            label={
              isSyncingSleepHistory ? "Syncing..." : "Sync sleep history now"
            }
            onPress={() => {
              void syncSleepHistoryNow();
            }}
          />
        ) : null}
      </Card>

      <SectionTitle>Volume model</SectionTitle>
      <Card>
        <NumericSettingInput
          label="volume start level"
          settingKey="volumeStartLevel"
          settings={engineSettings}
          updateEngineSettings={updateEngineSettings}
        />
        <NumericSettingInput
          label="volume ramp per cue"
          settingKey="volumeRampPerCue"
          settings={engineSettings}
          updateEngineSettings={updateEngineSettings}
        />
        <InfoRow
          label="volume ramp display"
          value={formatEnginePercent(engineSettings.volumeRampPerCue)}
        />
        <NumericSettingInput
          label="volume cap"
          settingKey="volumeCap"
          settings={engineSettings}
          updateEngineSettings={updateEngineSettings}
        />
        <InfoRow label="last successful cue volume" value="not available yet" />
        <InfoRow label="last awakening cue volume" value="not available yet" />
      </Card>

      <SectionTitle>Cue budget</SectionTitle>
      <Card>
        <NumericSettingInput
          label="max phone cues per block"
          settingKey="maxPhoneCuesPerBlock"
          settings={engineSettings}
          updateEngineSettings={updateEngineSettings}
        />
        <NumericSettingInput
          label="max phone block minutes"
          settingKey="maxPhoneBlockDurationMinutes"
          settings={engineSettings}
          updateEngineSettings={updateEngineSettings}
        />
        <NumericSettingInput
          label="min rest between blocks minutes"
          settingKey="minRestBetweenCueBlocksMinutes"
          settings={engineSettings}
          updateEngineSettings={updateEngineSettings}
        />
        <NumericSettingInput
          label="max cues per night"
          settingKey="maxCuesPerNight"
          settings={engineSettings}
          updateEngineSettings={updateEngineSettings}
        />
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
          Engine settings are stored locally and used by the TypeScript
          decision engine. Native sensing and overnight audio behavior are not
          connected here.
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
