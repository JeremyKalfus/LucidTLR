import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import {
  Card,
  PrimaryPillButton,
  Screen,
  SectionTitle,
} from "@/src/components/ui";
import type {
  OnboardingAnswerValue,
  OnboardingQuestion,
  OnboardingStepId,
} from "@/src/domain/forms";
import { onboardingSteps } from "@/src/features/onboarding/onboardingSteps";
import { useAppState } from "@/src/state/AppState";
import { borders, colors, radii, typography } from "@/src/theme/tokens";

function formatValue(value: OnboardingAnswerValue): string {
  if (Array.isArray(value)) {
    return value.join(", ");
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return value == null ? "" : String(value);
}

function ChoiceButton({
  label,
  note,
  active,
  onPress,
}: {
  label: string;
  note?: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        borderWidth: borders.hairline,
        borderColor: active ? colors.textMuted : colors.cardBorder,
        borderRadius: radii.card,
        padding: 12,
        gap: 4,
        backgroundColor: colors.card,
        opacity: pressed ? 0.72 : 1,
      })}
    >
      <Text
        selectable
        style={{
          color: active ? colors.textPrimary : colors.textSecondary,
          fontSize: typography.body.fontSize,
          lineHeight: typography.body.lineHeight,
        }}
      >
        {label}
      </Text>
      {note ? (
        <Text
          selectable
          style={{
            color: colors.textMuted,
            fontSize: typography.label.fontSize,
            lineHeight: typography.label.lineHeight,
          }}
        >
          {note}
        </Text>
      ) : null}
    </Pressable>
  );
}

function QuestionRenderer({
  question,
  stepId,
}: {
  question: OnboardingQuestion;
  stepId: OnboardingStepId;
}) {
  const {
    onboardingAnswers,
    selectedMode,
    setConsentChoice,
    setOnboardingAnswer,
  } = useAppState();
  const answer = onboardingAnswers.find(
    (candidate) =>
      candidate.stepId === stepId && candidate.questionId === question.id,
  );
  const value = answer?.value ?? question.defaultValue ?? null;

  if (question.mode && question.mode !== selectedMode) {
    return null;
  }

  if (question.type === "info" || question.type === "permission_summary") {
    return (
      <Card compact>
        <Text
          selectable
          style={{
            color: colors.textSecondary,
            fontSize: typography.body.fontSize,
            lineHeight: typography.body.lineHeight,
          }}
        >
          {question.prompt}
        </Text>
      </Card>
    );
  }

  if (question.type === "single_choice") {
    return (
      <View style={{ gap: 8 }}>
        <Text
          selectable
          style={{
            color: colors.textPrimary,
            fontSize: typography.body.fontSize,
            lineHeight: typography.body.lineHeight,
          }}
        >
          {question.prompt}
        </Text>
        {question.options?.map((option) => (
          <ChoiceButton
            key={option.value}
            label={option.label}
            note={option.note}
            active={value === option.value}
            onPress={() =>
              setOnboardingAnswer({
                stepId,
                questionId: question.id,
                value: option.value,
              })
            }
          />
        ))}
      </View>
    );
  }

  if (question.type === "multi_choice") {
    const selected = Array.isArray(value) ? value : [];

    return (
      <View style={{ gap: 8 }}>
        <Text
          selectable
          style={{
            color: colors.textPrimary,
            fontSize: typography.body.fontSize,
            lineHeight: typography.body.lineHeight,
          }}
        >
          {question.prompt}
        </Text>
        {question.options?.map((option) => {
          const active = selected.includes(option.value);
          const nextValue = active
            ? selected.filter((item) => item !== option.value)
            : [...selected, option.value];

          return (
            <ChoiceButton
              key={option.value}
              label={option.label}
              note={option.note}
              active={active}
              onPress={() =>
                setOnboardingAnswer({
                  stepId,
                  questionId: question.id,
                  value: nextValue,
                })
              }
            />
          );
        })}
      </View>
    );
  }

  if (question.type === "boolean") {
    const active = value === true;

    return (
      <ChoiceButton
        label={question.prompt}
        active={active}
        onPress={() => {
          setConsentChoice(question.id, !active);
          setOnboardingAnswer({
            stepId,
            questionId: question.id,
            value: !active,
          });
        }}
      />
    );
  }

  return (
    <View style={{ gap: 8 }}>
      <Text
        selectable
        style={{
          color: colors.textPrimary,
          fontSize: typography.body.fontSize,
          lineHeight: typography.body.lineHeight,
        }}
      >
        {question.prompt}
      </Text>
      <TextInput
        keyboardType={question.type === "number" ? "numeric" : "default"}
        placeholder={question.type === "time" ? "22:30" : "Answer"}
        placeholderTextColor={colors.textDim}
        value={formatValue(value)}
        onChangeText={(text) =>
          setOnboardingAnswer({
            stepId,
            questionId: question.id,
            value:
              question.type === "number" && text.trim()
                ? Number(text)
                : text,
          })
        }
        style={{
          minHeight: 48,
          borderWidth: borders.hairline,
          borderColor: colors.cardBorder,
          borderRadius: radii.card,
          color: colors.textPrimary,
          paddingHorizontal: 12,
          fontSize: typography.body.fontSize,
        }}
      />
    </View>
  );
}

export function OnboardingWizardScreen() {
  const [stepIndex, setStepIndex] = useState(0);
  const { completeOnboarding } = useAppState();
  const step = onboardingSteps[stepIndex];
  const isConsentStep = step.id === "consent_privacy";
  const isLastStep = stepIndex === onboardingSteps.length - 1;

  return (
    <Screen>
      <View style={{ gap: 4 }}>
        <SectionTitle>{step.title}</SectionTitle>
        <Text
          selectable
          style={{
            color: colors.textMuted,
            fontSize: typography.label.fontSize,
            lineHeight: typography.label.lineHeight,
          }}
        >
          Step {stepIndex + 1} of {onboardingSteps.length}
        </Text>
      </View>

      {isConsentStep ? (
        <Card>
          <Text
            selectable
            style={{
              color: colors.textPrimary,
              fontSize: typography.body.fontSize,
              lineHeight: typography.body.lineHeight,
            }}
          >
            Consent and privacy choices are explicit. Basic app use stays local,
            and upload choices do not create Supabase auth in this shell.
          </Text>
        </Card>
      ) : null}

      <View style={{ gap: 12 }}>
        {step.questions.map((question) => (
          <QuestionRenderer
            key={question.id}
            question={question}
            stepId={step.id}
          />
        ))}
      </View>

      <View style={{ flexDirection: "row", gap: 12 }}>
        {stepIndex > 0 ? (
          <View style={{ flex: 1 }}>
            <PrimaryPillButton
              label="Back"
              onPress={() => setStepIndex((index) => index - 1)}
            />
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <PrimaryPillButton
            label={isLastStep ? "Finish" : "Next"}
            onPress={() => {
              if (isLastStep) {
                completeOnboarding();
                router.replace("/");
                return;
              }

              setStepIndex((index) => index + 1);
            }}
          />
        </View>
      </View>
    </Screen>
  );
}
