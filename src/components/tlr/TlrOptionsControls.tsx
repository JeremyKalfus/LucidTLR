import React from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { ChevronDown } from "lucide-react-native";

import { InfoRow, TextField, TimeInput } from "@/src/components/ui";
import { builtInCues, getBuiltInCue } from "@/src/audio/cueCatalog";
import type { AppMode, TlrOptions } from "@/src/domain/types";
import {
  backgroundNoiseOptions,
  formatBackgroundNoiseOption,
  normalizeAlarmTime,
  type TlrOptionsPatch,
} from "@/src/features/tlrOptions/tlrOptions";
import { borders, colors, radii, typography } from "@/src/theme/tokens";

function RowLabel({ children }: { children: string }) {
  return (
    <Text
      selectable
      style={{
        color: colors.textMuted,
        fontSize: typography.body.fontSize,
        lineHeight: typography.body.lineHeight,
      }}
    >
      {children}
    </Text>
  );
}

function SegmentButton({
  active,
  fill = true,
  label,
  onPress,
}: {
  active: boolean;
  fill?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        ...(fill ? { flex: 1 } : { alignSelf: "stretch" }),
        minHeight: 34,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: borders.hairline,
        borderRadius: radii.card,
        borderColor: active ? colors.textMuted : colors.cardBorder,
        opacity: pressed ? 0.72 : 1,
        paddingHorizontal: 8,
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

function ToggleRow({
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
        minHeight: 34,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <RowLabel>{label}</RowLabel>
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

function CompactInput({
  label,
  value,
  keyboardType = "default",
  onChangeText,
}: {
  label: string;
  value: string;
  keyboardType?: "default" | "numeric";
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={{ gap: 6 }}>
      <RowLabel>{label}</RowLabel>
      <TextField
        height={36}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        style={{ paddingHorizontal: 10 }}
      />
    </View>
  );
}

function CompactTimeInput({
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
      <RowLabel>{label}</RowLabel>
      <TimeInput
        accessibilityLabel={label}
        height={36}
        value={value}
        onChangeText={onChangeText}
      />
    </View>
  );
}

export function TlrOptionsControls({
  selectedMode,
  tlrOptions,
  typicalWakeTime,
  onModeChange,
  onOptionsChange,
}: {
  selectedMode: AppMode;
  tlrOptions: TlrOptions;
  typicalWakeTime: string;
  onModeChange: (mode: AppMode) => void;
  onOptionsChange: (patch: TlrOptionsPatch) => void;
}) {
  const [cueOpen, setCueOpen] = React.useState(false);
  const [noiseOpen, setNoiseOpen] = React.useState(false);
  const selectedCue = getBuiltInCue(tlrOptions.selectedCueId);

  return (
    <View style={{ gap: 9 }}>
      <View style={{ gap: 6 }}>
        <RowLabel>mode</RowLabel>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <SegmentButton
            active={selectedMode === "phone"}
            label="phone"
            onPress={() => onModeChange("phone")}
          />
          <SegmentButton
            active={selectedMode === "watch"}
            label="watch"
            onPress={() => onModeChange("watch")}
          />
        </View>
      </View>

      <View style={{ gap: 7 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose cue sound"
          onPress={() => setCueOpen((open) => !open)}
          style={({ pressed }) => ({
            minHeight: 34,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            opacity: pressed ? 0.72 : 1,
          })}
        >
          <RowLabel>cue sound</RowLabel>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text
              selectable
              style={{
                color: colors.textPrimary,
                flexShrink: 1,
                textAlign: "right",
                fontSize: typography.body.fontSize,
                lineHeight: typography.body.lineHeight,
              }}
            >
              {selectedCue.label}
            </Text>
            <ChevronDown color={colors.textMuted} size={16} strokeWidth={1.8} />
          </View>
        </Pressable>
        {cueOpen ? (
          <View style={{ gap: 7 }}>
            {builtInCues.map((cue) => (
              <SegmentButton
                key={cue.id}
                active={selectedCue.id === cue.id}
                fill={false}
                label={cue.label}
                onPress={() => {
                  onOptionsChange({ selectedCueId: cue.id });
                  setCueOpen(false);
                }}
              />
            ))}
          </View>
        ) : null}
      </View>

      <View style={{ gap: 7 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose background noise"
          onPress={() => setNoiseOpen((open) => !open)}
          style={({ pressed }) => ({
            minHeight: 34,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            opacity: pressed ? 0.72 : 1,
          })}
        >
          <RowLabel>background noise</RowLabel>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text
              selectable
              style={{
                color: colors.textPrimary,
                flexShrink: 1,
                textAlign: "right",
                fontSize: typography.body.fontSize,
                lineHeight: typography.body.lineHeight,
              }}
            >
              {formatBackgroundNoiseOption(tlrOptions.backgroundNoise)}
            </Text>
            <ChevronDown color={colors.textMuted} size={16} strokeWidth={1.8} />
          </View>
        </Pressable>
        {noiseOpen ? (
          <View style={{ gap: 7 }}>
            {backgroundNoiseOptions.map((option) => (
              <SegmentButton
                key={option.value}
                active={tlrOptions.backgroundNoise === option.value}
                fill={false}
                label={option.label}
                onPress={() => {
                  onOptionsChange({ backgroundNoise: option.value });
                  setNoiseOpen(false);
                }}
              />
            ))}
          </View>
        ) : null}
      </View>

      <ToggleRow
        label="skip training"
        value={tlrOptions.skipGuidedTraining}
        onValueChange={(skipGuidedTraining) =>
          onOptionsChange({ skipGuidedTraining })
        }
      />

      <ToggleRow
        label="alarm"
        value={tlrOptions.alarm.enabled}
        onValueChange={(enabled) =>
          onOptionsChange({
            alarm: {
              enabled,
              time: enabled
                ? normalizeAlarmTime(
                    tlrOptions.alarm.enabled
                      ? tlrOptions.alarm.time
                      : typicalWakeTime,
                    typicalWakeTime,
                  )
                : tlrOptions.alarm.time,
            },
          })
        }
      />

      {tlrOptions.alarm.enabled ? (
        <View style={{ gap: 9 }}>
          <CompactTimeInput
            label="alarm time"
            value={tlrOptions.alarm.time}
            onChangeText={(time) => onOptionsChange({ alarm: { time } })}
          />
          <ToggleRow
            label="auto shutoff"
            value={tlrOptions.alarm.autoShutoff}
            onValueChange={(autoShutoff) =>
              onOptionsChange({ alarm: { autoShutoff } })
            }
          />
          {tlrOptions.alarm.autoShutoff ? (
            <CompactInput
              label="ring duration minutes"
              value={String(tlrOptions.alarm.ringDurationMinutes)}
              keyboardType="numeric"
              onChangeText={(text) => {
                const trimmed = text.trim();

                if (!trimmed) {
                  return;
                }

                const ringDurationMinutes = Number(trimmed);

                if (Number.isFinite(ringDurationMinutes)) {
                  onOptionsChange({ alarm: { ringDurationMinutes } });
                }
              }}
            />
          ) : (
            <InfoRow label="ring duration" value="until stopped" />
          )}
        </View>
      ) : null}
    </View>
  );
}
