import React from "react";
import { Pressable, Switch, Text, TextInput, View } from "react-native";
import { ChevronDown } from "lucide-react-native";

import { InfoRow } from "@/src/components/ui";
import type { AppMode, TlrOptions } from "@/src/domain/types";
import {
  backgroundNoiseOptions,
  formatBackgroundNoiseOption,
  normalizeAlarmTime,
  type TlrOptionsPatch,
} from "@/src/features/tlrOptions/tlrOptions";
import { cueAudio } from "@/src/protocol/tlrProtocol";
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
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.cardBorder, true: colors.textDim }}
        thumbColor={value ? colors.textPrimary : colors.textMuted}
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
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholderTextColor={colors.textDim}
        style={{
          minHeight: 36,
          borderWidth: borders.hairline,
          borderColor: colors.cardBorder,
          borderRadius: radii.card,
          color: colors.textPrimary,
          paddingHorizontal: 10,
          fontSize: typography.body.fontSize,
          lineHeight: typography.body.lineHeight,
        }}
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
  const [noiseOpen, setNoiseOpen] = React.useState(false);

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

      <InfoRow label="sound" value={cueAudio.defaultCueId.replaceAll("-", " ")} />

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
          <CompactInput
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
                const ringDurationMinutes = Number(text);

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
