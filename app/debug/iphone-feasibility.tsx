import { Redirect } from "expo-router";
import { Play, RefreshCw, Share2, Square, Trash2 } from "lucide-react-native";
import React from "react";
import { Alert, Pressable, Share, Text, View } from "react-native";

import {
  Card,
  InfoRow,
  PrimaryPillButton,
  Screen,
  SectionTitle,
  TextField,
} from "@/src/components/ui";
import {
  iPhoneFeasibilityHarness,
  isIPhoneFeasibilityModuleAvailable,
  type FeasibilityEvent,
  type FeasibilitySessionOptions,
  type IPhonePhoneModeRuntime,
} from "@/src/native/feasibility/IPhoneFeasibilityHarness";
import { borders, colors, radii, typography } from "@/src/theme/tokens";

type PresetKey =
  | "foreground"
  | "lockedAudioShort"
  | "lockedAudioControl"
  | "lockedMotionShort"
  | "lockedMotionControl"
  | "kitchenSink"
  | "interruption"
  | "lowPower"
  | "sleepFocus"
  | "notificationFallback"
  | "twoHour"
  | "overnight";

type Preset = {
  key: PresetKey;
  label: string;
  purpose: string;
  instructions: string;
  options: Omit<FeasibilitySessionOptions, "sessionId">;
};

const baseMotionOptions = {
  cueAfterSeconds: 600,
  testDurationSeconds: 1800,
  playAudioBed: true,
  audioBedVolume: 0.03,
  enableMotionLogging: true,
  enableDebugMicFeatures: false,
  enableNotificationFallback: false,
} as const;

const presets: Preset[] = [
  {
    key: "foreground",
    label: "Foreground sanity cue",
    purpose: "Confirm native module and native audio cue playback before lock testing.",
    instructions: "Keep the app open. A native cue should play after 30 seconds.",
    options: {
      testName: "Foreground sanity cue",
      cueAfterSeconds: 30,
      testDurationSeconds: 120,
      playAudioBed: true,
      audioBedVolume: 0.03,
      enableMotionLogging: false,
      enableDebugMicFeatures: false,
      enableNotificationFallback: false,
    },
  },
  {
    key: "lockedAudioShort",
    label: "Locked audio short",
    purpose: "Test whether a locked, charging iPhone plays a native cue after 10 minutes.",
    instructions: "Start, lock the phone, keep charging, reopen after 12 minutes.",
    options: {
      testName: "Locked audio short",
      cueAfterSeconds: 600,
      testDurationSeconds: 720,
      playAudioBed: true,
      audioBedVolume: 0.03,
      enableMotionLogging: false,
      enableDebugMicFeatures: false,
      enableNotificationFallback: false,
    },
  },
  {
    key: "lockedAudioControl",
    label: "Locked audio control",
    purpose: "Test whether locked cue playback works without an audible audio bed.",
    instructions: "Start, lock the phone, keep charging, reopen after 12 minutes.",
    options: {
      testName: "Locked audio control",
      cueAfterSeconds: 600,
      testDurationSeconds: 720,
      playAudioBed: false,
      audioBedVolume: 0,
      enableMotionLogging: false,
      enableDebugMicFeatures: false,
      enableNotificationFallback: false,
    },
  },
  {
    key: "lockedMotionShort",
    label: "Locked motion short",
    purpose: "Test whether phone motion summaries continue while locked on the mattress.",
    instructions:
      "Start, lock, place phone beside pillow. Alternate stillness, light shifts, a large roll, and a mattress tap.",
    options: {
      testName: "Locked motion short",
      ...baseMotionOptions,
    },
  },
  {
    key: "lockedMotionControl",
    label: "Locked motion control",
    purpose: "Test whether locked motion logging works without an audible audio bed.",
    instructions:
      "Start, lock, place phone beside pillow, and repeat still/light/large movement periods.",
    options: {
      testName: "Locked motion control",
      ...baseMotionOptions,
      playAudioBed: false,
      audioBedVolume: 0,
    },
  },
  {
    key: "kitchenSink",
    label: "Kitchen sink audio test",
    purpose:
      "Test native locked audio-bed control, bundled segment playback, and native random cue selection.",
    instructions:
      "Start, lock, keep charging, and inspect logs for volume changes, bed pause/resume, low/high segments, random segment decisions, and the 10-minute computed cue.",
    options: {
      testName: "Kitchen sink audio test",
      cueAfterSeconds: 600,
      testDurationSeconds: 900,
      playAudioBed: true,
      audioBedVolume: 0.03,
      enableMotionLogging: true,
      enableDebugMicFeatures: false,
      enableNotificationFallback: false,
      enableKitchenSinkAudioTest: true,
    },
  },
  {
    key: "interruption",
    label: "Interruption test",
    purpose: "Test route changes and audio interruptions during a locked native session.",
    instructions:
      "During the locked test, trigger a call, alarm, Siri, AirPods, or Bluetooth route change.",
    options: {
      testName: "Interruption test",
      ...baseMotionOptions,
    },
  },
  {
    key: "lowPower",
    label: "Low Power Mode test",
    purpose: "Test whether Low Power Mode affects locked audio or motion behavior.",
    instructions: "Enable Low Power Mode before starting, then run like locked motion short.",
    options: {
      testName: "Low Power Mode test",
      ...baseMotionOptions,
    },
  },
  {
    key: "sleepFocus",
    label: "Sleep Focus test",
    purpose: "Test whether Sleep Focus affects locked cue playback or notifications.",
    instructions: "Enable Sleep Focus or Do Not Disturb before starting, then lock the phone.",
    options: {
      testName: "Sleep Focus test",
      cueAfterSeconds: 600,
      testDurationSeconds: 720,
      playAudioBed: true,
      audioBedVolume: 0.03,
      enableMotionLogging: false,
      enableDebugMicFeatures: false,
      enableNotificationFallback: false,
    },
  },
  {
    key: "notificationFallback",
    label: "Notification fallback test",
    purpose: "Test notification-based locked fallback cueing only.",
    instructions: "Start, lock the phone, and inspect scheduled/fired/opened notification logs.",
    options: {
      testName: "Notification fallback test",
      cueAfterSeconds: 600,
      testDurationSeconds: 720,
      playAudioBed: false,
      audioBedVolume: 0,
      enableMotionLogging: false,
      enableDebugMicFeatures: false,
      enableNotificationFallback: true,
    },
  },
  {
    key: "twoHour",
    label: "Two-hour locked test",
    purpose: "Intermediate reliability test before an overnight attempt.",
    instructions: "Start, lock, keep charging, and reopen after two hours.",
    options: {
      testName: "Two-hour locked test",
      cueAfterSeconds: 3600,
      testDurationSeconds: 7200,
      playAudioBed: true,
      audioBedVolume: 0.03,
      enableMotionLogging: true,
      enableDebugMicFeatures: false,
      enableNotificationFallback: false,
    },
  },
  {
    key: "overnight",
    label: "Overnight locked test",
    purpose: "Real-world locked Phone Mode viability test.",
    instructions: "Start before bed, lock the charging phone, and inspect persisted logs after waking.",
    options: {
      testName: "Overnight locked test",
      cueAfterSeconds: 14400,
      testDurationSeconds: 28800,
      playAudioBed: true,
      audioBedVolume: 0.03,
      enableMotionLogging: true,
      enableDebugMicFeatures: false,
      enableNotificationFallback: false,
    },
  },
];

const runtimeOptions: IPhonePhoneModeRuntime[] = [
  "unknown",
  "locked_audio_motion_supported",
  "locked_audio_only_supported",
  "foreground_only",
  "timed_only",
];

function createSessionId(testName: string): string {
  const slug = testName.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return `${slug}-${Date.now()}`;
}

function getPreset(key: PresetKey): Preset {
  return presets.find((preset) => preset.key === key) ?? presets[0];
}

function latestEventOfType(
  logs: FeasibilityEvent[],
  eventType: FeasibilityEvent["eventType"],
): FeasibilityEvent | null {
  return [...logs].reverse().find((event) => event.eventType === eventType) ?? null;
}

function formatPayload(payload: Record<string, unknown>): string {
  const serialized = JSON.stringify(payload, null, 2);

  return serialized.length > 900 ? `${serialized.slice(0, 900)}...` : serialized;
}

function OptionButton({
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
        minHeight: 40,
        borderRadius: radii.card,
        borderWidth: borders.hairline,
        borderColor: active ? colors.textMuted : colors.cardBorder,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 10,
        opacity: pressed ? 0.72 : 1,
      })}
    >
      <Text
        selectable
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

function ToggleButton({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={({ pressed }) => ({
        minHeight: 40,
        borderRadius: radii.card,
        borderWidth: borders.hairline,
        borderColor: value ? colors.textMuted : colors.cardBorder,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 10,
        opacity: pressed ? 0.72 : 1,
      })}
    >
      <Text
        selectable
        style={{
          color: value ? colors.textPrimary : colors.textMuted,
          fontSize: typography.label.fontSize,
          lineHeight: typography.label.lineHeight,
          textAlign: "center",
        }}
      >
        {label}: {value ? "on" : "off"}
      </Text>
    </Pressable>
  );
}

function NumberField({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={{ flex: 1, gap: 6, minWidth: 120 }}>
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
      <TextField
        height={40}
        keyboardType="numeric"
        onChangeText={onChangeText}
        value={value}
        style={{ paddingHorizontal: 10 }}
      />
    </View>
  );
}

export default function IPhoneFeasibilityRoute() {
  if (!__DEV__) {
    return <Redirect href="/" />;
  }

  const moduleAvailable = isIPhoneFeasibilityModuleAvailable();
  const [logs, setLogs] = React.useState<FeasibilityEvent[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedPresetKey, setSelectedPresetKey] =
    React.useState<PresetKey>("foreground");
  const [audioBedEnabled, setAudioBedEnabled] = React.useState(true);
  const [motionEnabled, setMotionEnabled] = React.useState(false);
  const [debugMicEnabled, setDebugMicEnabled] = React.useState(false);
  const [notificationFallbackEnabled, setNotificationFallbackEnabled] =
    React.useState(false);
  const [overnightCueHours, setOvernightCueHours] = React.useState("4");
  const [overnightDurationHours, setOvernightDurationHours] =
    React.useState("8");
  const [runtimeAssessment, setRuntimeAssessment] =
    React.useState<IPhonePhoneModeRuntime>("unknown");
  const selectedPreset = getPreset(selectedPresetKey);
  const latestStart = latestEventOfType(logs, "session_started");
  const latestStop = latestEventOfType(logs, "session_stopped");
  const running =
    latestStart !== null &&
    (!latestStop ||
      Date.parse(latestStop.timestamp) < Date.parse(latestStart.timestamp));
  const latestEvent = logs[logs.length - 1] ?? null;

  const refreshLogs = React.useCallback(async () => {
    if (!moduleAvailable) {
      setLogs([]);
      return;
    }

    try {
      setError(null);
      setLogs(await iPhoneFeasibilityHarness.getFeasibilityLogs());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load logs.");
    }
  }, [moduleAvailable]);

  React.useEffect(() => {
    void refreshLogs();

    const intervalId = setInterval(() => {
      void refreshLogs();
    }, 5000);

    return () => clearInterval(intervalId);
  }, [refreshLogs]);

  function selectPreset(key: PresetKey) {
    const preset = getPreset(key);

    setSelectedPresetKey(key);
    setAudioBedEnabled(preset.options.playAudioBed);
    setMotionEnabled(preset.options.enableMotionLogging);
    setDebugMicEnabled(preset.options.enableDebugMicFeatures);
    setNotificationFallbackEnabled(Boolean(preset.options.enableNotificationFallback));
  }

  function optionsForPreset(key: PresetKey): Omit<FeasibilitySessionOptions, "sessionId"> {
    const preset = getPreset(key);

    if (key !== "overnight") {
      return preset.options;
    }

    const cueHours = Number(overnightCueHours);
    const durationHours = Number(overnightDurationHours);

    return {
      ...preset.options,
      cueAfterSeconds:
        Number.isFinite(cueHours) && cueHours > 0
          ? Math.round(cueHours * 3600)
          : preset.options.cueAfterSeconds,
      testDurationSeconds:
        Number.isFinite(durationHours) && durationHours > 0
          ? Math.round(durationHours * 3600)
          : preset.options.testDurationSeconds,
    };
  }

  async function startSession(
    key: PresetKey,
    useManualToggles: boolean,
  ): Promise<void> {
    if (!moduleAvailable) {
      setError("Install and open the custom iOS development build first.");
      return;
    }

    const baseOptions = optionsForPreset(key);
    const nextOptions: FeasibilitySessionOptions = {
      ...baseOptions,
      sessionId: createSessionId(baseOptions.testName),
      playAudioBed: useManualToggles
        ? audioBedEnabled
        : baseOptions.playAudioBed,
      audioBedVolume: useManualToggles
        ? audioBedEnabled
          ? baseOptions.audioBedVolume || 0.03
          : 0
        : baseOptions.audioBedVolume,
      enableMotionLogging: useManualToggles
        ? motionEnabled
        : baseOptions.enableMotionLogging,
      enableDebugMicFeatures: useManualToggles
        ? debugMicEnabled
        : baseOptions.enableDebugMicFeatures,
      enableNotificationFallback: useManualToggles
        ? notificationFallbackEnabled
        : baseOptions.enableNotificationFallback,
    };

    try {
      setError(null);
      await iPhoneFeasibilityHarness.startFeasibilitySession(nextOptions);
      selectPreset(key);
      await refreshLogs();
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Could not start test.";

      setError(message);

      if (process.env.EXPO_OS !== "web") {
        Alert.alert("Feasibility test failed", message);
      }
    }
  }

  async function stopSession(): Promise<void> {
    try {
      setError(null);
      await iPhoneFeasibilityHarness.stopFeasibilitySession();
      await refreshLogs();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not stop test.");
    }
  }

  async function clearLogs(): Promise<void> {
    try {
      setError(null);
      await iPhoneFeasibilityHarness.clearFeasibilityLogs();
      await refreshLogs();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not clear logs.");
    }
  }

  async function shareLogs(): Promise<void> {
    await Share.share({
      message: JSON.stringify(logs, null, 2),
      title: "LucidCue iPhone feasibility logs",
    });
  }

  if (!__DEV__) {
    return (
      <Screen bottomNav={false}>
        <SectionTitle>iPhone feasibility</SectionTitle>
        <Card>
          <Text
            selectable
            style={{
              color: colors.textMuted,
              fontSize: typography.body.fontSize,
              lineHeight: typography.body.lineHeight,
            }}
          >
            This hidden harness is only available in development builds.
          </Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen bottomNav={false}>
      <SectionTitle>iPhone feasibility</SectionTitle>

      <Card>
        <InfoRow label="native module" value={moduleAvailable ? "available" : "missing"} />
        <InfoRow label="test state" value={running ? "running" : "not running"} />
        <InfoRow label="selected preset" value={selectedPreset.label} />
        <InfoRow label="manual runtime flag" value={runtimeAssessment.replaceAll("_", " ")} />
        <InfoRow label="log events" value={String(logs.length)} />
        <InfoRow label="latest event" value={latestEvent?.eventType ?? "none"} />
      </Card>

      {error ? (
        <Card>
          <Text
            selectable
            style={{
              color: colors.textPrimary,
              fontSize: typography.body.fontSize,
              lineHeight: typography.body.lineHeight,
            }}
          >
            {error}
          </Text>
        </Card>
      ) : null}

      <Card>
        <Text
          selectable
          style={{
            color: colors.textPrimary,
            fontSize: typography.body.fontSize,
            lineHeight: typography.body.lineHeight,
          }}
        >
          Development-only harness. Use a physical iPhone. Start test, then
          lock the phone. Keep phone charging for long tests. Return after the
          test and inspect logs. Normal Phone Mode does not route through this
          screen. Microphone test is debug-only and local-only. This screen
          does not prove production support until locked-device logs pass.
        </Text>
      </Card>

      <Card>
        <InfoRow label="purpose" value={selectedPreset.purpose} />
        <InfoRow label="instructions" value={selectedPreset.instructions} />
        <InfoRow label="cue delay" value={`${optionsForPreset(selectedPresetKey).cueAfterSeconds}s`} />
        <InfoRow label="duration" value={`${optionsForPreset(selectedPresetKey).testDurationSeconds}s`} />
      </Card>

      <View style={{ gap: 8 }}>
        {presets.map((preset) => (
          <PrimaryPillButton
            key={preset.key}
            icon={Play}
            label={preset.label}
            onPress={() => {
              selectPreset(preset.key);
              void startSession(preset.key, false);
            }}
          />
        ))}
      </View>

      <Card>
        <InfoRow label="manual toggles" value="used by Run selected with toggles" />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <ToggleButton
            label="audio bed"
            value={audioBedEnabled}
            onChange={setAudioBedEnabled}
          />
          <ToggleButton
            label="motion logging"
            value={motionEnabled}
            onChange={setMotionEnabled}
          />
          <ToggleButton
            label="debug mic"
            value={debugMicEnabled}
            onChange={setDebugMicEnabled}
          />
          <ToggleButton
            label="notification fallback"
            value={notificationFallbackEnabled}
            onChange={setNotificationFallbackEnabled}
          />
        </View>
        <PrimaryPillButton
          icon={Play}
          label="Run selected with toggles"
          onPress={() => void startSession(selectedPresetKey, true)}
        />
      </Card>

      <Card>
        <InfoRow label="overnight defaults" value="4h cue / 8h duration" />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <NumberField
            label="cue after hours"
            value={overnightCueHours}
            onChangeText={setOvernightCueHours}
          />
          <NumberField
            label="duration hours"
            value={overnightDurationHours}
            onChangeText={setOvernightDurationHours}
          />
        </View>
      </Card>

      <Card>
        <InfoRow label="manual production flag" value="debug-only placeholder" />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {runtimeOptions.map((option) => (
            <OptionButton
              active={runtimeAssessment === option}
              key={option}
              label={option.replaceAll("_", " ")}
              onPress={() => setRuntimeAssessment(option)}
            />
          ))}
        </View>
      </Card>

      <View style={{ gap: 8 }}>
        <PrimaryPillButton
          icon={Square}
          label="Stop test"
          onPress={() => void stopSession()}
        />
        <PrimaryPillButton
          icon={RefreshCw}
          label="Refresh logs"
          onPress={() => void refreshLogs()}
        />
        <PrimaryPillButton
          icon={Share2}
          label="Share logs"
          onPress={() => void shareLogs()}
        />
        <PrimaryPillButton
          icon={Trash2}
          label="Clear logs"
          onPress={() => void clearLogs()}
        />
      </View>

      <Card>
        <Text
          selectable
          style={{
            color: colors.textPrimary,
            fontSize: typography.body.fontSize,
            lineHeight: typography.body.lineHeight,
          }}
        >
          Decision tree: if locked audio short fails, Option 2 is not viable; consider foreground
          dim-screen adaptive mode or locked timed/notification fallback. If audio passes but motion
          fails, use locked historical-prior timed cues without continuous movement gating. If both
          pass, a later production spike can wire native audio, native motion summaries, engine
          decisions, and local cue/movement logs. If overnight fails after short tests pass, keep
          Option 2 experimental.
        </Text>
      </Card>

      <View style={{ gap: 8 }}>
        {[...logs].reverse().slice(0, 120).map((event) => (
          <Card compact key={event.id}>
            <InfoRow label={event.eventType} value={new Date(event.timestamp).toLocaleString()} />
            <Text
              selectable
              style={{
                color: colors.textMuted,
                fontSize: typography.label.fontSize,
                lineHeight: typography.label.lineHeight,
              }}
            >
              {formatPayload(event.payload)}
            </Text>
          </Card>
        ))}
      </View>
    </Screen>
  );
}
