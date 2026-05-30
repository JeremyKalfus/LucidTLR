import DateTimePicker from "@react-native-community/datetimepicker";
import type { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import React from "react";
import { Pressable, Text, View } from "react-native";

import { colors, typography } from "@/src/theme/tokens";
import { TextField } from "./TextField";

function normalizeClockTime(value: string | null | undefined, fallback = "07:00") {
  if (typeof value !== "string") {
    return fallback;
  }

  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    return fallback;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return fallback;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseClockTime(value: string | null | undefined): string | null {
  const normalized = normalizeClockTime(value, "");

  return normalized || null;
}

function dateFromClockTime(value: string): Date {
  const [hourText, minuteText] = normalizeClockTime(value).split(":");
  const date = new Date();

  date.setHours(Number(hourText), Number(minuteText), 0, 0);

  return date;
}

function formatClockTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}

export function TimeInput({
  accessibilityLabel,
  fallbackTime = "07:00",
  height = 44,
  placeholder = "22:30",
  value,
  onChangeText,
}: {
  accessibilityLabel?: string;
  fallbackTime?: string;
  height?: number;
  placeholder?: string;
  value: string;
  onChangeText: (value: string) => void;
}) {
  const [pickerVisible, setPickerVisible] = React.useState(false);
  const normalizedValue = parseClockTime(value);
  const fallbackValue = normalizeClockTime(fallbackTime);
  const pickerValue = React.useMemo(
    () => dateFromClockTime(normalizedValue ?? fallbackValue),
    [fallbackValue, normalizedValue],
  );
  const isNativePicker =
    process.env.EXPO_OS === "ios" || process.env.EXPO_OS === "android";

  const onPickerChange = (
    event: DateTimePickerEvent,
    selectedDate?: Date,
  ) => {
    if (process.env.EXPO_OS === "android") {
      setPickerVisible(false);
    }

    if (event.type === "dismissed" || !selectedDate) {
      return;
    }

    onChangeText(formatClockTime(selectedDate));
  };

  if (!isNativePicker) {
    return (
      <TextField
        height={height}
        keyboardType="numbers-and-punctuation"
        placeholder={placeholder}
        value={value}
        onChangeText={(text) => onChangeText(normalizeClockTime(text, text))}
      />
    );
  }

  return (
    <View style={{ gap: 8 }}>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        onPress={() => setPickerVisible(true)}
      >
        <TextField
          editable={false}
          height={height}
          placeholder={placeholder}
          pointerEvents="none"
          value={normalizedValue ?? ""}
        />
      </Pressable>

      {pickerVisible ? (
        <View style={{ gap: 6 }}>
          <DateTimePicker
            display={process.env.EXPO_OS === "ios" ? "spinner" : "default"}
            mode="time"
            value={pickerValue}
            onChange={onPickerChange}
            style={{ height: process.env.EXPO_OS === "ios" ? 150 : undefined }}
          />
          {process.env.EXPO_OS === "ios" ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setPickerVisible(false)}
              style={({ pressed }) => ({
                alignSelf: "flex-end",
                opacity: pressed ? 0.7 : 1,
                paddingVertical: 4,
                paddingHorizontal: 2,
              })}
            >
              <Text
                style={{
                  color: colors.textPrimary,
                  fontSize: typography.label.fontSize,
                  lineHeight: typography.label.lineHeight,
                }}
              >
                Done
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
