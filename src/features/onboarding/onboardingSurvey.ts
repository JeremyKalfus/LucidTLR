import type {
  OnboardingAnswer,
  OnboardingAnswerValue,
  OnboardingStep,
  OnboardingStepId,
} from "../../domain/forms";
import { onboardingSteps } from "./onboardingSteps";

export const ONBOARDING_STEP_ORDER: OnboardingStepId[] = onboardingSteps.map(
  (step) => step.id,
);

export function getOnboardingStep(stepId: OnboardingStepId): OnboardingStep {
  const step = onboardingSteps.find((candidate) => candidate.id === stepId);

  if (!step) {
    throw new Error(`Unknown onboarding step: ${stepId}`);
  }

  return step;
}

export function getNextOnboardingStep(
  stepId: OnboardingStepId,
): OnboardingStepId | null {
  const index = ONBOARDING_STEP_ORDER.indexOf(stepId);
  return ONBOARDING_STEP_ORDER[index + 1] ?? null;
}

export function getPreviousOnboardingStep(
  stepId: OnboardingStepId,
): OnboardingStepId | null {
  const index = ONBOARDING_STEP_ORDER.indexOf(stepId);
  return index > 0 ? ONBOARDING_STEP_ORDER[index - 1] : null;
}

export function buildOnboardingAnswer(input: {
  id: string;
  participantId: string;
  stepId: OnboardingStepId;
  questionId: string;
  value: OnboardingAnswerValue;
  now: string;
}): OnboardingAnswer {
  return {
    id: input.id,
    participantId: input.participantId,
    stepId: input.stepId,
    questionId: input.questionId,
    value: input.value,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export function updateOnboardingAnswer(
  answer: OnboardingAnswer,
  value: OnboardingAnswerValue,
  updatedAt: string,
): OnboardingAnswer {
  return {
    ...answer,
    value,
    updatedAt,
  };
}
