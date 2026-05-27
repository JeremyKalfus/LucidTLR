import type { AppMode } from "./types";

export type OnboardingStepId =
  | "welcome"
  | "tlr_explanation"
  | "mode_selection"
  | "baseline_sleep"
  | "dream_profile"
  | "sound_sensitivity"
  | "goals"
  | "consent_privacy"
  | "permissions"
  | "ready";

export type OnboardingAnswerValue =
  | string
  | number
  | boolean
  | string[]
  | null;

export interface OnboardingAnswer {
  id: string;
  participantId: string;
  stepId: OnboardingStepId;
  questionId: string;
  value: OnboardingAnswerValue;
  createdAt: string;
  updatedAt: string;
}

export type OnboardingQuestionType =
  | "info"
  | "single_choice"
  | "multi_choice"
  | "boolean"
  | "time"
  | "number"
  | "permission_summary";

export interface OnboardingOption {
  value: string;
  label: string;
  note?: string;
}

export interface OnboardingQuestion {
  id: string;
  type: OnboardingQuestionType;
  prompt: string;
  options?: OnboardingOption[];
  required?: boolean;
  defaultValue?: OnboardingAnswerValue;
  mode?: AppMode;
  disabled?: boolean;
}

export interface OnboardingStep {
  id: OnboardingStepId;
  title: string;
  purpose: string;
  questions: OnboardingQuestion[];
}

export interface OnboardingSurveyState {
  participantId: string;
  answers: OnboardingAnswer[];
}
