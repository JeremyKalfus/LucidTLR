import { router } from "expo-router";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, Text, View } from "react-native";

import {
  Card,
  PrimaryPillButton,
  Screen,
  SectionTitle,
  TextField,
  TimeInput,
} from "@/src/components/ui";
import type {
  OnboardingAnswerValue,
  OnboardingQuestion,
  OnboardingStepId,
} from "@/src/domain/forms";
import {
  onboardingSteps,
  STUDY_PARTICIPATION_QUESTION_ID,
} from "@/src/features/onboarding/onboardingSteps";
import { useAppState } from "@/src/state/AppState";
import { borders, colors, radii, typography } from "@/src/theme/tokens";

function formatValue(value: OnboardingAnswerValue): string {
  if (Array.isArray(value)) {
    return value.join(", ");
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }

  return value == null ? "" : String(value);
}

function parseNumberAnswer(text: string): number | null {
  const sanitized = text.replace(/\D/g, "");

  return sanitized ? Number(sanitized) : null;
}

function ChoiceButton({
  label,
  note,
  active,
  large = false,
  onPress,
}: {
  label: string;
  note?: string;
  active: boolean;
  large?: boolean;
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
        minHeight: large ? 86 : undefined,
        justifyContent: "center",
        padding: large ? 18 : 12,
        gap: large ? 8 : 4,
        backgroundColor: colors.card,
        opacity: pressed ? 0.72 : 1,
      })}
    >
      <Text
        selectable
        style={{
          color: active ? colors.textPrimary : colors.textSecondary,
          fontSize: large ? typography.title.fontSize : typography.body.fontSize,
          lineHeight: large
            ? typography.title.lineHeight
            : typography.body.lineHeight,
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
  plain = false,
  question,
  stepId,
}: {
  plain?: boolean;
  question: OnboardingQuestion;
  stepId: OnboardingStepId;
}) {
  const {
    onboardingAnswers,
    selectedMode,
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
    if (plain) {
      return (
        <Text
          selectable
          style={{
            color: colors.textPrimary,
            fontSize: typography.body.fontSize,
            lineHeight: typography.body.lineHeight,
            paddingHorizontal: 2,
          }}
        >
          {question.prompt}
        </Text>
      );
    }

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
            large={question.id === STUDY_PARTICIPATION_QUESTION_ID}
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
      {question.type === "time" ? (
        <TimeInput
          accessibilityLabel={question.prompt}
          fallbackTime={question.id === "typical_bedtime" ? "23:00" : "07:00"}
          height={48}
          placeholder={question.id === "typical_bedtime" ? "23:00" : "07:00"}
          value={formatValue(value)}
          onChangeText={(time) =>
            setOnboardingAnswer({
              stepId,
              questionId: question.id,
              value: time,
            })
          }
        />
      ) : (
        <TextField
          height={48}
          keyboardType={question.type === "number" ? "numeric" : "default"}
          placeholder="Answer"
          value={formatValue(value)}
          onChangeText={(text) =>
            setOnboardingAnswer({
              stepId,
              questionId: question.id,
              value:
                question.type === "number" ? parseNumberAnswer(text) : text,
            })
          }
        />
      )}
    </View>
  );
}

function hasAnswer(value: OnboardingAnswerValue | undefined): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  return value !== undefined && value !== null;
}

function StaggeredWelcomeItem({
  children,
  playKey,
}: {
  children: ReactNode;
  playKey: number;
}) {
  const value = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    value.setValue(0);

    const animation = Animated.timing(value, {
      toValue: 1,
      duration: 950,
      useNativeDriver: process.env.EXPO_OS !== "web",
    });

    animation.start();

    return () => {
      animation.stop();
    };
  }, [playKey, value]);

  return (
    <Animated.View
      style={{
        opacity: value,
        transform: [
          {
            translateY: value.interpolate({
              inputRange: [0, 1],
              outputRange: [24, 0],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

export function OnboardingWizardScreen() {
  const [stepIndex, setStepIndex] = useState(0);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [welcomeVisibleItemCount, setWelcomeVisibleItemCount] = useState(0);
  const fadeValue = useRef(new Animated.Value(1)).current;
  const {
    completeOnboarding,
    isCompletingOnboarding,
    onboardingAnswers,
    selectedMode,
  } = useAppState();
  const step = onboardingSteps[stepIndex];
  const isWelcomeStep = step.id === "welcome";
  const isLastStep = stepIndex === onboardingSteps.length - 1;
  const canContinue = useMemo(
    () =>
      step.questions.every((question) => {
        if (!question.required || (question.mode && question.mode !== selectedMode)) {
          return true;
        }

        const answer = onboardingAnswers.find(
          (candidate) =>
            candidate.stepId === step.id &&
            candidate.questionId === question.id,
        );

        return hasAnswer(answer?.value ?? question.defaultValue);
      }),
    [onboardingAnswers, selectedMode, step],
  );

  useEffect(() => {
    fadeValue.setValue(0);
    Animated.timing(fadeValue, {
      toValue: 1,
      duration: isWelcomeStep ? 1 : 180,
      useNativeDriver: process.env.EXPO_OS !== "web",
    }).start();
  }, [fadeValue, isWelcomeStep, stepIndex]);

  useEffect(() => {
    if (!isWelcomeStep) {
      setWelcomeVisibleItemCount(Number.MAX_SAFE_INTEGER);
      return;
    }

    const itemCount = step.questions.length + 2;
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    setWelcomeVisibleItemCount(0);

    for (let index = 0; index < itemCount; index += 1) {
      timeouts.push(
        setTimeout(() => {
          setWelcomeVisibleItemCount(index + 1);
        }, 420 + index * 1050),
      );
    }

    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, [isWelcomeStep, step.questions.length, stepIndex]);

  const renderWelcomeItem = (
    children: ReactNode,
    index: number,
    itemKey?: string,
  ) => {
    if (!isWelcomeStep) {
      return children;
    }

    if (index >= welcomeVisibleItemCount) {
      return null;
    }

    return (
      <StaggeredWelcomeItem key={itemKey} playKey={stepIndex}>
        {children}
      </StaggeredWelcomeItem>
    );
  };

  return (
    <Screen bottomNav={false} centered>
      <Animated.View
        style={{
          width: "100%",
          maxWidth: 560,
          alignSelf: "center",
          gap: 18,
          opacity: isWelcomeStep ? 1 : fadeValue,
          transform: [
            {
              translateY: fadeValue.interpolate({
                inputRange: [0, 1],
                outputRange: isWelcomeStep ? [0, 0] : [8, 0],
              }),
            },
          ],
        }}
      >
        {renderWelcomeItem(
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
          </View>,
          0,
        )}

        <View style={{ gap: 12 }}>
          {step.questions.map((question, questionIndex) =>
            renderWelcomeItem(
              <QuestionRenderer
                key={question.id}
                plain={
                  step.id !== "welcome" &&
                  question.type === "info" &&
                  questionIndex === step.questions.length - 1
                }
                question={question}
                stepId={step.id}
              />,
              questionIndex + 1,
              question.id,
            ),
          )}
        </View>

        {completionError ? (
          <Card compact>
            <Text
              selectable
              style={{
                color: colors.textSecondary,
                fontSize: typography.body.fontSize,
                lineHeight: typography.body.lineHeight,
              }}
            >
              {completionError}
            </Text>
          </Card>
        ) : null}

        {renderWelcomeItem(
          <View style={{ flexDirection: "row", gap: 12 }}>
            {stepIndex > 0 ? (
              <View style={{ flex: 1 }}>
                <PrimaryPillButton
                  label="Back"
                  disabled={isCompletingOnboarding}
                  onPress={() => {
                    setCompletionError(null);
                    setStepIndex((index) => index - 1);
                  }}
                />
              </View>
            ) : null}
            <View style={{ flex: 1 }}>
              <PrimaryPillButton
                label={isLastStep ? "Finish" : "Next"}
                disabled={!canContinue || isCompletingOnboarding}
                onPress={() => {
                  setCompletionError(null);

                  if (isLastStep) {
                    completeOnboarding()
                      .then(() => router.replace("/"))
                      .catch((error: unknown) => {
                        setCompletionError(
                          error instanceof Error
                            ? error.message
                            : "Could not complete onboarding.",
                        );
                      });
                    return;
                  }

                  setStepIndex((index) => index + 1);
                }}
              />
            </View>
          </View>,
          step.questions.length + 1,
        )}
      </Animated.View>
    </Screen>
  );
}
