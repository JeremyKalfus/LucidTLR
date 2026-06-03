import { router } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import type { TextInputProps } from "react-native";
import {
  ChevronLeft,
  ChevronRight,
  Cpu,
  History,
  RefreshCw,
  SlidersHorizontal,
  Smartphone,
  Trash2,
  Watch,
} from "lucide-react-native";
import React from "react";
import { Alert, Pressable, Switch, Text, View } from "react-native";

import {
  Card,
  DraftTextField,
  InfoRow,
  PrimaryPillButton,
  Screen,
  SectionTitle,
  TimeInput,
} from "@/src/components/ui";
import {
  isFiniteNumberDraft,
  isNumberRangeDraft,
  parseFiniteNumberDraft,
  parseNumberRangeDraft,
} from "@/src/components/ui/draftInput";
import { TlrOptionsControls } from "@/src/components/tlr/TlrOptionsControls";
import {
  formatEnginePercent,
  getProfileDefaults,
  type CueDecisionSettings,
  type SoundSensitivityProfile,
} from "@/src/engine";
import type { ExternalSleepSource } from "@/src/domain/types";
import {
  phoneRuntime,
  type PhoneRuntimeStatus,
} from "@/src/native/phoneRuntime";
import {
  watchRuntime,
  type WatchRuntimeStatus,
} from "@/src/native/watch";
import { useAppState } from "@/src/state/AppState";
import { borders, colors, radii, typography } from "@/src/theme/tokens";

type SettingsRoute =
  | "/settings/ios-phone-mode"
  | "/settings/android-phone-mode"
  | "/settings/watch-mode"
  | "/settings/engine";

function DraftSettingInput({
  isValidDraft,
  keyboardType,
  label,
  onValidDraftChange,
  value,
}: {
  isValidDraft: (value: string) => boolean;
  keyboardType?: TextInputProps["keyboardType"];
  label: string;
  onValidDraftChange: (value: string) => void;
  value: string;
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
      <DraftTextField
        height={40}
        isValidDraft={isValidDraft}
        keyboardType={keyboardType}
        value={value}
        onValidDraftChange={onValidDraftChange}
      />
    </View>
  );
}

function TimeSettingInput({
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
      <TimeInput
        accessibilityLabel={label}
        height={40}
        value={value}
        onChangeText={onChangeText}
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
    <DraftSettingInput
      isValidDraft={isFiniteNumberDraft}
      keyboardType="numbers-and-punctuation"
      label={label}
      value={String(value)}
      onValidDraftChange={(text) => {
        const nextValue = parseFiniteNumberDraft(text);

        if (nextValue !== null) {
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

function SettingsPageHeader({ title }: { title: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <Pressable
        accessibilityLabel="Back to settings"
        accessibilityRole="button"
        onPress={() => router.replace("/settings")}
        style={({ pressed }) => ({
          width: 32,
          height: 32,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.68 : 1,
        })}
      >
        <ChevronLeft color={colors.textMuted} size={24} strokeWidth={1.8} />
      </Pressable>
      <SectionTitle>{title}</SectionTitle>
    </View>
  );
}

function SettingsNavRow({
  detail,
  icon: Icon,
  route,
  title,
}: {
  detail: string;
  icon: LucideIcon;
  route: SettingsRoute;
  title: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(route)}
      style={({ pressed }) => ({
        minHeight: 58,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        opacity: pressed ? 0.72 : 1,
      })}
    >
      <Icon color={colors.textMuted} size={23} strokeWidth={1.8} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          selectable
          style={{
            color: colors.textPrimary,
            fontSize: typography.body.fontSize,
            lineHeight: typography.body.lineHeight,
          }}
        >
          {title}
        </Text>
        <Text
          selectable
          style={{
            color: colors.textMuted,
            fontSize: typography.label.fontSize,
            lineHeight: typography.label.lineHeight,
          }}
        >
          {detail}
        </Text>
      </View>
      <ChevronRight color={colors.textDim} size={20} strokeWidth={1.8} />
    </Pressable>
  );
}

function SettingsNote({ children }: { children: string }) {
  return (
    <Text
      selectable
      style={{
        color: colors.textSecondary,
        fontSize: typography.body.fontSize,
        lineHeight: typography.body.lineHeight,
      }}
    >
      {children}
    </Text>
  );
}

function SettingsToggleRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View
      style={{
        minHeight: 40,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <Text
        selectable
        style={{
          color: colors.textMuted,
          flexShrink: 1,
          fontSize: typography.body.fontSize,
          lineHeight: typography.body.lineHeight,
        }}
      >
        {label}
      </Text>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.cardBorder, true: colors.textDim }}
        ios_backgroundColor={colors.cardBorder}
      />
    </View>
  );
}

function watchCueChannelLabel(input: {
  watchAudioCueEnabled: boolean;
  watchHapticCueEnabled: boolean;
}): string {
  if (input.watchAudioCueEnabled && input.watchHapticCueEnabled) {
    return "audio + haptic";
  }

  return input.watchAudioCueEnabled ? "audio" : "haptic";
}

function watchCueTogglePatch(
  channel: "audio" | "haptic",
  enabled: boolean,
  current: {
    watchAudioCueEnabled: boolean;
    watchHapticCueEnabled: boolean;
  },
) {
  const nextAudio =
    channel === "audio" ? enabled : current.watchAudioCueEnabled;
  const nextHaptic =
    channel === "haptic" ? enabled : current.watchHapticCueEnabled;

  if (!nextAudio && !nextHaptic) {
    return channel === "audio"
      ? { watchAudioCueEnabled: false, watchHapticCueEnabled: true }
      : { watchAudioCueEnabled: true, watchHapticCueEnabled: false };
  }

  return channel === "audio"
    ? { watchAudioCueEnabled: enabled }
    : { watchHapticCueEnabled: enabled };
}

function SimpleModeButton({
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
        minHeight: 42,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: borders.hairline,
        borderRadius: radii.card,
        borderColor: active ? colors.textMuted : colors.cardBorder,
        opacity: pressed ? 0.72 : 1,
        paddingHorizontal: 10,
      })}
    >
      <Text
        selectable
        adjustsFontSizeToFit
        minimumFontScale={0.82}
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

function usePhoneRuntimeStatus() {
  const [runtimeStatus, setRuntimeStatus] =
    React.useState<PhoneRuntimeStatus | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function loadRuntimeStatus() {
      try {
        const status = await phoneRuntime.getPhoneRuntimeStatus();

        if (!cancelled) {
          setRuntimeStatus(status);
        }
      } catch (error) {
        if (!cancelled) {
          setRuntimeStatus({
            available: false,
            unavailableReason:
              error instanceof Error ? error.message : "unknown",
            running: false,
            audioBedRunning: false,
            backgroundAudioRunning: false,
            alarmRinging: false,
            motionRunning: false,
            cueCount: 0,
            cuesInBlock: 0,
          });
        }
      }
    }

    void loadRuntimeStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  return runtimeStatus;
}

export function SettingsScreen() {
  const [isResetting, setIsResetting] = React.useState(false);
  const [resetError, setResetError] = React.useState<string | null>(null);
  const {
    consentChoices,
    resetAppData,
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
        <SettingsNavRow
          detail="iPhone runtime, audio bed, alarm, and TLR options."
          icon={Smartphone}
          route="/settings/ios-phone-mode"
          title="iOS phone mode"
        />
        <SettingsNavRow
          detail="Android phone runtime status and constraints."
          icon={Smartphone}
          route="/settings/android-phone-mode"
          title="Android phone mode"
        />
        <SettingsNavRow
          detail="Watch setup, sync status, and sensing assumptions."
          icon={Watch}
          route="/settings/watch-mode"
          title="Watch mode"
        />
        <SettingsNavRow
          detail="Cue timing, sleep history, volume, and cue budget."
          icon={SlidersHorizontal}
          route="/settings/engine"
          title="Engine"
        />
      </Card>

      <View style={{ gap: 12 }}>
        <InfoRow
          label="structured upload"
          value={consentChoices.structuredResearchUploadConsent ? "enabled" : "off"}
        />
      </View>

      <View style={{ gap: 12 }}>
        <SettingsNote>
          Reset app and delete local data clears this device. Full remote
          deletion is not implemented yet.
        </SettingsNote>
        {resetError ? <SettingsNote>{resetError}</SettingsNote> : null}
        <PrimaryPillButton
          disabled={isResetting}
          icon={Trash2}
          label={isResetting ? "Resetting..." : "Reset app and delete local data"}
          onPress={confirmReset}
        />
      </View>
    </Screen>
  );
}

export function IosPhoneModeSettingsScreen() {
  const runtimeStatus = usePhoneRuntimeStatus();
  const {
    engineSettings,
    selectedMode,
    setSelectedMode,
    tlrOptions,
    updateEngineSettings,
    updateTlrOptions,
  } = useAppState();

  return (
    <Screen>
      <SettingsPageHeader title="iOS phone mode" />

      <Card>
        <TlrOptionsControls
          selectedMode={selectedMode}
          tlrOptions={tlrOptions}
          typicalWakeTime={engineSettings.typicalWakeTime}
          onModeChange={setSelectedMode}
          onOptionsChange={(patch) => {
            void updateTlrOptions(patch);
          }}
        />
      </Card>

      <Card>
        <SettingsNote>
          Locked iPhone Phone Mode requires a quiet audio bed.
        </SettingsNote>
        <SettingsToggleRow
          label="Require accelerometer"
          value={tlrOptions.requireAccelerometer}
          onValueChange={(requireAccelerometer) => {
            void updateTlrOptions({ requireAccelerometer });
          }}
        />
        <NumericSettingInput
          label="audio bed volume"
          settingKey="phoneAudioBedVolume"
          settings={engineSettings}
          updateEngineSettings={updateEngineSettings}
        />
        <InfoRow
          label="native runtime"
          value={
            runtimeStatus?.available
              ? runtimeStatus.running
                ? "running"
                : "available"
              : runtimeStatus?.unavailableReason ?? "unknown"
          }
        />
        <InfoRow
          label="background audio"
          value={runtimeStatus?.backgroundAudioRunning ? "running" : "idle"}
        />
        <InfoRow
          label="alarm"
          value={runtimeStatus?.alarmRinging ? "ringing" : "idle"}
        />
        <InfoRow label="manual capability" value="unknown" />
      </Card>

      {__DEV__ ? (
        <Card>
          <SettingsNote>
            Development-only locked runtime smoke test.
          </SettingsNote>
          <PrimaryPillButton
            icon={Cpu}
            label="45-minute kitchen sink"
            onPress={() => router.push("/debug/iphone-kitchen-sink")}
          />
        </Card>
      ) : null}
    </Screen>
  );
}

export function AndroidPhoneModeSettingsScreen() {
  const { selectedMode, setSelectedMode } = useAppState();

  return (
    <Screen>
      <SettingsPageHeader title="Android phone mode" />

      <Card>
        <SimpleModeButton
          active={selectedMode === "phone"}
          label="Use Phone Mode"
          onPress={() => setSelectedMode("phone")}
        />
        <InfoRow label="runtime" value="not implemented" />
        <InfoRow label="minimum OS" value="Android 10+" />
        <InfoRow label="watch support" value="excluded" />
        <SettingsNote>
          Android Phone Mode will use the same Phone Mode protocol with a Kotlin
          foreground service, accelerometer monitoring, movement pauses, cue
          scheduling, and audio playback. Native Android runtime behavior is not
          wired in this pass.
        </SettingsNote>
      </Card>
    </Screen>
  );
}

export function WatchModeSettingsScreen() {
  const { selectedMode, setSelectedMode, tlrOptions, updateTlrOptions } =
    useAppState();
  const [runtimeStatus, setRuntimeStatus] =
    React.useState<WatchRuntimeStatus | null>(null);

  React.useEffect(() => {
    let mounted = true;

    void watchRuntime.getWatchRuntimeStatus().then((status) => {
      if (mounted) {
        setRuntimeStatus(status);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <Screen>
      <SettingsPageHeader title="Watch mode" />

      <Card>
        <SimpleModeButton
          active={selectedMode === "watch"}
          label="Use Watch Mode"
          onPress={() => setSelectedMode("watch")}
        />
        <InfoRow
          label="setup/sync client"
          value={
            runtimeStatus?.available
              ? runtimeStatus.running
                ? "active"
                : "ready"
              : runtimeStatus?.unavailableReason ?? "unknown"
          }
        />
        <InfoRow
          label="watch app"
          value={
            runtimeStatus?.watchAppInstalled === undefined
              ? "unknown"
              : runtimeStatus.watchAppInstalled
                ? "installed"
                : "not detected"
          }
        />
        <InfoRow
          label="setup/sync status"
          value={
            runtimeStatus
              ? runtimeStatus.watchReachable
                ? "ready for setup/sync"
                : runtimeStatus.connectivityState
              : "unknown"
          }
        />
        <InfoRow
          label="REM classifier"
          value={
            runtimeStatus?.modelAvailable
              ? runtimeStatus.classifierVersion
              : "mallela-rf boundary; cueing disabled until exact features verified"
          }
        />
        <InfoRow label="REM threshold" value="0.24" />
        <InfoRow label="epoch length" value="30 seconds" />
        <InfoRow label="cue channel" value={watchCueChannelLabel(tlrOptions)} />
        <SettingsToggleRow
          label="Watch audio cue"
          value={tlrOptions.watchAudioCueEnabled}
          onValueChange={(watchAudioCueEnabled) => {
            void updateTlrOptions(
              watchCueTogglePatch("audio", watchAudioCueEnabled, tlrOptions),
            );
          }}
        />
        <SettingsToggleRow
          label="Watch haptic cue"
          value={tlrOptions.watchHapticCueEnabled}
          onValueChange={(watchHapticCueEnabled) => {
            void updateTlrOptions(
              watchCueTogglePatch("haptic", watchHapticCueEnabled, tlrOptions),
            );
          }}
        />
        <InfoRow label="battery start" value="warn below 60%" />
        <SettingsNote>
          Watch Mode is the watch-owned overnight path. Prepare the night on the
          phone, start it in the Watch app, then sync epochs and events back for
          review. Setup/sync reachability is not the overnight source of truth.
        </SettingsNote>
      </Card>
    </Screen>
  );
}

export function EngineSettingsScreen() {
  const {
    engineSettings,
    isSyncingSleepHistory,
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

  return (
    <Screen>
      <SettingsPageHeader title="Engine" />

      <SectionTitle>Assumptions</SectionTitle>
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
        <TimeSettingInput
          label="typical bedtime"
          value={engineSettings.typicalBedtime}
          onChangeText={(typicalBedtime) =>
            void updateEngineSettings({ typicalBedtime })
          }
        />
        <TimeSettingInput
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
        <DraftSettingInput
          isValidDraft={isNumberRangeDraft}
          keyboardType="numbers-and-punctuation"
          label="cue interval seconds"
          value={`${engineSettings.cueIntervalRangeSeconds[0]}-${engineSettings.cueIntervalRangeSeconds[1]}`}
          onValidDraftChange={(text) => {
            const range = parseNumberRangeDraft(text);

            if (range) {
              void updateEngineSettings({ cueIntervalRangeSeconds: range });
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
        <InfoRow
          label="source"
          value={formatSleepHistorySource(sleepHistory.source)}
        />
        <InfoRow label="permission" value={sleepHistory.permissionStatus} />
        <InfoRow
          label="nights imported"
          value={String(sleepHistory.nightsImported)}
        />
        <InfoRow
          label="last import"
          value={formatOptionalDate(sleepHistory.lastImportedAt)}
        />
        <InfoRow
          label="prior confidence"
          value={sleepHistory.prior?.confidence ?? "none"}
        />
        {sleepHistory.lastSyncError ? (
          <SettingsNote>{sleepHistory.lastSyncError}</SettingsNote>
        ) : null}
        <SettingsNote>
          Used locally to estimate better cue windows. Not uploaded by default.
        </SettingsNote>
        <PrimaryPillButton
          disabled={isSyncingSleepHistory}
          icon={History}
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
            icon={RefreshCw}
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
        <Cpu color={colors.textMuted} size={23} strokeWidth={1.8} />
        <SettingsNote>
          Engine settings are stored locally and used by the TypeScript decision
          engine and native iPhone Phone Mode plan builder.
        </SettingsNote>
      </Card>
    </Screen>
  );
}
