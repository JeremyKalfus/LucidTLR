import type { ReactNode } from "react";
import React from "react";

import type {
  AppMode,
  ConsentState,
  DreamJournalEntry,
  NightSession,
  SessionType,
} from "@/src/domain/types";
import type {
  OnboardingAnswer,
  OnboardingAnswerValue,
  OnboardingStepId,
} from "@/src/domain/forms";
import { buildOnboardingAnswer, updateOnboardingAnswer } from "@/src/features/onboarding/onboardingSurvey";
import { createLocalDreamJournalEntry } from "@/src/features/journal/journalTypes";
import { createNightSession, applySessionEvent } from "@/src/features/sessions/sessionActions";
import type { SessionEvent } from "@/src/features/sessions/sessionStateMachine";
import { canTransitionSession } from "@/src/features/sessions/sessionStateMachine";

interface AppConsentChoices {
  acceptedAppTerms: boolean;
  acceptedResearchInfo: boolean;
  structuredResearchUploadConsent: boolean;
  dreamJournalUploadConsent: boolean;
}

interface AppStateValue {
  participantId: string;
  selectedMode: AppMode;
  onboardingComplete: boolean;
  onboardingAnswers: OnboardingAnswer[];
  consentChoices: AppConsentChoices;
  consentState: ConsentState;
  activeSession: NightSession | null;
  sessionHistory: NightSession[];
  journalEntries: DreamJournalEntry[];
  setSelectedMode: (mode: AppMode) => void;
  setOnboardingAnswer: (input: {
    stepId: OnboardingStepId;
    questionId: string;
    value: OnboardingAnswerValue;
  }) => void;
  setConsentChoice: (questionId: string, value: boolean) => void;
  completeOnboarding: () => void;
  startSession: (sessionType: SessionType) => NightSession;
  sendSessionEvent: (event: SessionEvent) => void;
  addJournalEntry: (text: string) => void;
}

const AppStateContext = React.createContext<AppStateValue | null>(null);

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toConsentState(consentChoices: AppConsentChoices): ConsentState {
  return {
    structuredResearchUploadAccepted:
      consentChoices.structuredResearchUploadConsent,
    structuredResearchUploadWithdrawn: false,
    dreamJournalUploadAccepted: consentChoices.dreamJournalUploadConsent,
    dreamJournalUploadWithdrawn: false,
  };
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [participantId] = React.useState(() => createId("participant"));
  const [selectedMode, setSelectedMode] = React.useState<AppMode>("phone");
  const [onboardingComplete, setOnboardingComplete] = React.useState(false);
  const [onboardingAnswers, setOnboardingAnswers] = React.useState<
    OnboardingAnswer[]
  >([]);
  const [consentChoices, setConsentChoices] = React.useState<AppConsentChoices>({
    acceptedAppTerms: false,
    acceptedResearchInfo: false,
    structuredResearchUploadConsent: false,
    dreamJournalUploadConsent: false,
  });
  const [activeSession, setActiveSession] = React.useState<NightSession | null>(
    null,
  );
  const [sessionHistory, setSessionHistory] = React.useState<NightSession[]>([]);
  const [journalEntries, setJournalEntries] = React.useState<
    DreamJournalEntry[]
  >([]);

  const setOnboardingAnswer = React.useCallback(
    (input: {
      stepId: OnboardingStepId;
      questionId: string;
      value: OnboardingAnswerValue;
    }) => {
      const now = new Date().toISOString();

      setOnboardingAnswers((answers) => {
        const existing = answers.find(
          (answer) =>
            answer.stepId === input.stepId &&
            answer.questionId === input.questionId,
        );

        if (existing) {
          return answers.map((answer) =>
            answer.id === existing.id
              ? updateOnboardingAnswer(answer, input.value, now)
              : answer,
          );
        }

        return [
          ...answers,
          buildOnboardingAnswer({
            id: createId("answer"),
            participantId,
            stepId: input.stepId,
            questionId: input.questionId,
            value: input.value,
            now,
          }),
        ];
      });

      if (input.questionId === "mode" && (input.value === "phone" || input.value === "watch")) {
        setSelectedMode(input.value);
      }
    },
    [participantId],
  );

  const setConsentChoice = React.useCallback(
    (questionId: string, value: boolean) => {
      setConsentChoices((choices) => {
        if (questionId === "accepted_app_terms") {
          return { ...choices, acceptedAppTerms: value };
        }

        if (questionId === "accepted_research_info") {
          return { ...choices, acceptedResearchInfo: value };
        }

        if (questionId === "structured_research_upload_consent") {
          return { ...choices, structuredResearchUploadConsent: value };
        }

        if (questionId === "dream_journal_upload_consent") {
          return { ...choices, dreamJournalUploadConsent: value };
        }

        return choices;
      });
    },
    [],
  );

  const completeOnboarding = React.useCallback(() => {
    setOnboardingComplete(true);
  }, []);

  const startSession = React.useCallback(
    (sessionType: SessionType) => {
      const now = new Date().toISOString();
      const session = createNightSession({
        id: createId("session"),
        participantId,
        sessionType,
        mode: selectedMode,
        startedAt: now,
      });
      const nextSession =
        sessionType === "sleep_log"
          ? applySessionEvent(session, "start_cueing", now)
          : session;

      setActiveSession(nextSession);
      setSessionHistory((sessions) => [nextSession, ...sessions]);
      return nextSession;
    },
    [participantId, selectedMode],
  );

  const sendSessionEvent = React.useCallback((event: SessionEvent) => {
    setActiveSession((session) => {
      if (!session || !canTransitionSession(session.sessionType, session.status, event)) {
        return session;
      }

      const nextSession = applySessionEvent(
        session,
        event,
        new Date().toISOString(),
      );

      setSessionHistory((sessions) =>
        sessions.map((candidate) =>
          candidate.id === nextSession.id ? nextSession : candidate,
        ),
      );

      return nextSession;
    });
  }, []);

  const addJournalEntry = React.useCallback((text: string) => {
    const now = new Date().toISOString();
    const entry = createLocalDreamJournalEntry({
      id: createId("journal"),
      createdAt: now,
      draft: {
        sessionId: activeSession?.id,
        text,
      },
    });

    setJournalEntries((entries) => [entry, ...entries]);
  }, [activeSession?.id]);

  const value = React.useMemo<AppStateValue>(
    () => ({
      participantId,
      selectedMode,
      onboardingComplete,
      onboardingAnswers,
      consentChoices,
      consentState: toConsentState(consentChoices),
      activeSession,
      sessionHistory,
      journalEntries,
      setSelectedMode,
      setOnboardingAnswer,
      setConsentChoice,
      completeOnboarding,
      startSession,
      sendSessionEvent,
      addJournalEntry,
    }),
    [
      activeSession,
      addJournalEntry,
      completeOnboarding,
      consentChoices,
      journalEntries,
      onboardingAnswers,
      onboardingComplete,
      participantId,
      selectedMode,
      sendSessionEvent,
      setConsentChoice,
      setOnboardingAnswer,
      startSession,
    ],
  );

  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState(): AppStateValue {
  const value = React.use(AppStateContext);

  if (!value) {
    throw new Error("useAppState must be used within AppStateProvider");
  }

  return value;
}
