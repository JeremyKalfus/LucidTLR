import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import {
  Card,
  PrimaryPillButton,
  Screen,
  SectionTitle,
} from "@/src/components/ui";
import {
  MORNING_REPORT_CORE_FIELDS,
  MORNING_REPORT_OPTIONAL_LUCIDITY_FIELDS,
  MORNING_REPORT_OPTIONAL_LUCIDITY_STORAGE,
  type MorningReportField,
} from "@/src/features/reports/morningReportSchema";
import { canTransitionSession } from "@/src/features/sessions/sessionStateMachine";
import { useAppState } from "@/src/state/AppState";
import { borders, colors, radii, typography } from "@/src/theme/tokens";

type FieldValue = boolean | number | null;

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: MorningReportField;
  value: FieldValue;
  onChange: (value: FieldValue) => void;
}) {
  if (field.type === "rating") {
    return (
      <TextInput
        keyboardType="numeric"
        placeholder="1-5"
        placeholderTextColor={colors.textDim}
        value={typeof value === "number" ? String(value) : ""}
        onChangeText={(text) => onChange(text.trim() ? Number(text) : null)}
        style={{
          minHeight: 44,
          borderWidth: borders.hairline,
          borderColor: colors.cardBorder,
          borderRadius: radii.card,
          color: colors.textPrimary,
          paddingHorizontal: 12,
          fontSize: typography.body.fontSize,
        }}
      />
    );
  }

  const options =
    field.type === "boolean"
      ? [
          { label: "Yes", value: true },
          { label: "No", value: false },
        ]
      : [
          { label: "Yes", value: true },
          { label: "No", value: false },
          { label: "Skip", value: null },
        ];

  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {options.map((option) => (
        <Pressable
          accessibilityRole="button"
          key={option.label}
          onPress={() => onChange(option.value)}
          style={({ pressed }) => ({
            flex: 1,
            minHeight: 42,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: borders.hairline,
            borderRadius: radii.card,
            borderColor:
              value === option.value ? colors.textMuted : colors.cardBorder,
            backgroundColor: colors.card,
            opacity: pressed ? 0.72 : 1,
          })}
        >
          <Text
            selectable
            style={{
              color:
                value === option.value ? colors.textPrimary : colors.textMuted,
              fontSize: typography.label.fontSize,
              lineHeight: typography.label.lineHeight,
            }}
          >
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function ReviewField({
  field,
  value,
  onChange,
}: {
  field: MorningReportField;
  value: FieldValue;
  onChange: (value: FieldValue) => void;
}) {
  return (
    <Card compact>
      <Text
        selectable
        style={{
          color: colors.textPrimary,
          fontSize: typography.body.fontSize,
          lineHeight: typography.body.lineHeight,
        }}
      >
        {field.label}
      </Text>
      <FieldControl field={field} value={value} onChange={onChange} />
    </Card>
  );
}

export function MorningReviewScreen() {
  const { activeSession, sendSessionEvent } = useAppState();
  const [answers, setAnswers] = useState<Record<string, FieldValue>>({});
  const [showOptional, setShowOptional] = useState(false);

  return (
    <Screen>
      <SectionTitle>Morning review</SectionTitle>

      <Card>
        <Text
          selectable
          style={{
            color: colors.textSecondary,
            fontSize: typography.body.fontSize,
            lineHeight: typography.body.lineHeight,
          }}
        >
          Core report fields stay short by default. Dream journal text/audio is
          separate and local-only unless explicit dream upload consent is
          enabled later.
        </Text>
      </Card>

      {MORNING_REPORT_CORE_FIELDS.map((field) => (
        <ReviewField
          key={field.id}
          field={field}
          value={answers[field.id] ?? null}
          onChange={(value) =>
            setAnswers((current) => ({ ...current, [field.id]: value }))
          }
        />
      ))}

      <PrimaryPillButton
        label={showOptional ? "Hide Optional Detail" : "Optional Lucidity Detail"}
        onPress={() => setShowOptional((value) => !value)}
      />

      {showOptional ? (
        <View style={{ gap: 12 }}>
          <Card>
            <Text
              selectable
              style={{
                color: colors.textMuted,
                fontSize: typography.label.fontSize,
                lineHeight: typography.label.lineHeight,
              }}
            >
              Optional lucidity detail is conceptually stored through{" "}
              {MORNING_REPORT_OPTIONAL_LUCIDITY_STORAGE.table} with form id{" "}
              {MORNING_REPORT_OPTIONAL_LUCIDITY_STORAGE.formId}.
            </Text>
          </Card>
          {MORNING_REPORT_OPTIONAL_LUCIDITY_FIELDS.map((field) => (
            <ReviewField
              key={field.id}
              field={field}
              value={answers[field.id] ?? null}
              onChange={(value) =>
                setAnswers((current) => ({ ...current, [field.id]: value }))
              }
            />
          ))}
        </View>
      ) : null}

      <PrimaryPillButton
        label="Save Review"
        onPress={() => {
          if (
            activeSession &&
            canTransitionSession(
              activeSession.sessionType,
              activeSession.status,
              "complete_morning_review",
            )
          ) {
            sendSessionEvent("complete_morning_review");
          }

          router.push("/data");
        }}
      />
    </Screen>
  );
}
