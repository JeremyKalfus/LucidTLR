import type { ReactNode } from "react";
import React from "react";

import { getLocalDb } from "@/src/data/local/expoSqliteDb";
import {
  buildQuestionnaireResponsePayload,
  clearAllLocalData,
  getAppSetting,
  getLocalParticipant,
  loadOnboardingResponses,
  ONBOARDING_COMPLETED_AT_SETTING,
  ONBOARDING_VERSION_SETTING,
  replaceStructuredConsent,
  saveOnboardingResponses,
  setAppSetting,
  upsertLocalParticipant,
} from "@/src/data/local/repositories";
import { createLocalUploadQueueStore } from "@/src/data/local/uploadQueueStore";
import { prepareAnonymousResearchUpload, signOutAndClearSupabaseSession } from "@/src/data/supabase/researchUpload";
import { enqueueIfAllowed } from "@/src/data/supabase/syncEngine";
import type {
  AppMode,
  ConsentState,
  DreamJournalEntry,
  NightSession,
  SessionType,
  UploadStatus,
} from "@/src/domain/types";
import type {
  OnboardingAnswer,
  OnboardingAnswerValue,
  OnboardingStepId,
} from "@/src/domain/forms";
import {
  ONBOARDING_FORM_ID,
  STUDY_OPT_IN_VALUE,
  STUDY_OPT_OUT_VALUE,
  STUDY_PARTICIPATION_QUESTION_ID,
} from "@/src/features/onboarding/onboardingSteps";
import { buildOnboardingAnswer, updateOnboardingAnswer } from "@/src/features/onboarding/onboardingSurvey";
import { createLocalDreamJournalEntry } from "@/src/features/journal/journalTypes";
import { createNightSession, applySessionEvent } from "@/src/features/sessions/sessionActions";
import type { SessionEvent } from "@/src/features/sessions/sessionStateMachine";
import { canTransitionSession } from "@/src/features/sessions/sessionStateMachine";

interface AppConsentChoices {
  structuredResearchUploadConsent: boolean;
  dreamJournalUploadConsent: boolean;
}

interface AppStateValue {
  isHydrated: boolean;
  hydrationError: string | null;
  isCompletingOnboarding: boolean;
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
  completeOnboarding: () => Promise<void>;
  resetAppData: () => Promise<void>;
  startSession: (sessionType: SessionType) => NightSession;
  sendSessionEvent: (event: SessionEvent) => void;
  addJournalEntry: (text: string) => void;
}

const AppStateContext = React.createContext<AppStateValue | null>(null);

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function emptyConsentChoices(): AppConsentChoices {
  return {
    structuredResearchUploadConsent: false,
    dreamJournalUploadConsent: false,
  };
}

function isAppMode(value: string | null): value is AppMode {
  return value === "phone" || value === "watch";
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

function studyChoiceFromAnswers(
  answers: OnboardingAnswer[],
): typeof STUDY_OPT_IN_VALUE | typeof STUDY_OPT_OUT_VALUE | null {
  const value = answers.find(
    (answer) => answer.questionId === STUDY_PARTICIPATION_QUESTION_ID,
  )?.value;

  if (value === STUDY_OPT_IN_VALUE || value === STUDY_OPT_OUT_VALUE) {
    return value;
  }

  return null;
}

function consentChoicesFromStudyChoice(
  studyChoice: typeof STUDY_OPT_IN_VALUE | typeof STUDY_OPT_OUT_VALUE,
): AppConsentChoices {
  return {
    structuredResearchUploadConsent: studyChoice === STUDY_OPT_IN_VALUE,
    dreamJournalUploadConsent: false,
  };
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [isHydrated, setIsHydrated] = React.useState(false);
  const [hydrationError, setHydrationError] = React.useState<string | null>(null);
  const [isCompletingOnboarding, setIsCompletingOnboarding] =
    React.useState(false);
  const [participantId, setParticipantId] = React.useState(() =>
    createId("participant"),
  );
  const [appInstallId, setAppInstallId] = React.useState(() =>
    createId("install"),
  );
  const [participantCreatedAt, setParticipantCreatedAt] = React.useState(() =>
    new Date().toISOString(),
  );
  const [selectedMode, setSelectedMode] = React.useState<AppMode>("phone");
  const [onboardingComplete, setOnboardingComplete] = React.useState(false);
  const [onboardingAnswers, setOnboardingAnswers] = React.useState<
    OnboardingAnswer[]
  >([]);
  const [consentChoices, setConsentChoices] =
    React.useState<AppConsentChoices>(emptyConsentChoices);
  const [activeSession, setActiveSession] = React.useState<NightSession | null>(
    null,
  );
  const [sessionHistory, setSessionHistory] = React.useState<NightSession[]>([]);
  const [journalEntries, setJournalEntries] = React.useState<
    DreamJournalEntry[]
  >([]);

  React.useEffect(() => {
    let cancelled = false;

    async function hydrate(): Promise<void> {
      try {
        const db = await getLocalDb();
        const participant = await getLocalParticipant(db);
        const completedAt = await getAppSetting<string>(
          db,
          ONBOARDING_COMPLETED_AT_SETTING,
        );
        const onboardingVersion = await getAppSetting<string>(
          db,
          ONBOARDING_VERSION_SETTING,
        );
        const persistedAnswers = participant
          ? await loadOnboardingResponses(db, participant.id)
          : [];

        if (cancelled) {
          return;
        }

        if (participant) {
          setParticipantId(participant.id);
          setAppInstallId(participant.app_install_id);
          setParticipantCreatedAt(participant.created_at);
          setConsentChoices({
            structuredResearchUploadConsent:
              participant.structured_upload_consent === 1,
            dreamJournalUploadConsent: participant.dream_upload_consent === 1,
          });

          if (isAppMode(participant.selected_mode)) {
            setSelectedMode(participant.selected_mode);
          }
        }

        setOnboardingAnswers(persistedAnswers);
        setOnboardingComplete(Boolean(completedAt && onboardingVersion));
      } catch (error) {
        if (!cancelled) {
          setHydrationError(
            error instanceof Error ? error.message : "Failed to load app data.",
          );
          setOnboardingComplete(false);
        }
      } finally {
        if (!cancelled) {
          setIsHydrated(true);
        }
      }
    }

    hydrate();

    return () => {
      cancelled = true;
    };
  }, []);

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

      if (
        input.questionId === "mode" &&
        (input.value === "phone" || input.value === "watch")
      ) {
        setSelectedMode(input.value);
      }

      if (
        input.questionId === STUDY_PARTICIPATION_QUESTION_ID &&
        (input.value === STUDY_OPT_IN_VALUE ||
          input.value === STUDY_OPT_OUT_VALUE)
      ) {
        setConsentChoices(consentChoicesFromStudyChoice(input.value));
      }
    },
    [participantId],
  );

  const completeOnboarding = React.useCallback(async () => {
    const studyChoice = studyChoiceFromAnswers(onboardingAnswers);

    if (!studyChoice) {
      throw new Error("Choose whether to opt in or opt out of the study.");
    }

    const now = new Date().toISOString();
    const nextConsentChoices = consentChoicesFromStudyChoice(studyChoice);
    const nextConsentState = toConsentState(nextConsentChoices);
    const uploadStatus: UploadStatus =
      nextConsentChoices.structuredResearchUploadConsent
        ? "pending"
        : "local_only";
    const db = await getLocalDb();

    setIsCompletingOnboarding(true);

    try {
      await upsertLocalParticipant({
        db,
        participantId,
        appInstallId,
        createdAt: participantCreatedAt,
        selectedMode,
        structuredResearchUploadAccepted:
          nextConsentChoices.structuredResearchUploadConsent,
        dreamJournalUploadAccepted: false,
      });
      await replaceStructuredConsent({
        db,
        consentId: createId("consent"),
        participantId,
        consentVersion: ONBOARDING_FORM_ID,
        acceptedAt: nextConsentChoices.structuredResearchUploadConsent
          ? now
          : null,
        appVersion: "0.1.0",
      });

      if (nextConsentChoices.structuredResearchUploadConsent) {
        await prepareAnonymousResearchUpload({
          db,
          participantId,
          consentVersion: ONBOARDING_FORM_ID,
          acceptedAt: now,
        });
      }

      await saveOnboardingResponses({
        db,
        answers: onboardingAnswers,
        uploadStatus,
      });

      if (nextConsentChoices.structuredResearchUploadConsent) {
        const queue = createLocalUploadQueueStore(db);

        for (const answer of onboardingAnswers) {
          await enqueueIfAllowed({
            queue,
            consents: nextConsentState,
            item: {
              id: `upload-${answer.id}`,
              entityType: "questionnaire_response",
              entityId: answer.id,
              payload: buildQuestionnaireResponsePayload(answer),
              createdAt: now,
            },
          });
        }
      }

      await setAppSetting(db, ONBOARDING_COMPLETED_AT_SETTING, now, now);
      await setAppSetting(db, ONBOARDING_VERSION_SETTING, ONBOARDING_FORM_ID, now);
      setConsentChoices(nextConsentChoices);
      setOnboardingComplete(true);
    } finally {
      setIsCompletingOnboarding(false);
    }
  }, [
    appInstallId,
    onboardingAnswers,
    participantCreatedAt,
    participantId,
    selectedMode,
  ]);

  const resetAppData = React.useCallback(async () => {
    const db = await getLocalDb();

    await signOutAndClearSupabaseSession(db);
    await clearAllLocalData(db);

    setParticipantId(createId("participant"));
    setAppInstallId(createId("install"));
    setParticipantCreatedAt(new Date().toISOString());
    setSelectedMode("phone");
    setOnboardingComplete(false);
    setOnboardingAnswers([]);
    setConsentChoices(emptyConsentChoices());
    setActiveSession(null);
    setSessionHistory([]);
    setJournalEntries([]);
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
      if (
        !session ||
        !canTransitionSession(session.sessionType, session.status, event)
      ) {
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
      isHydrated,
      hydrationError,
      isCompletingOnboarding,
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
      completeOnboarding,
      resetAppData,
      startSession,
      sendSessionEvent,
      addJournalEntry,
    }),
    [
      activeSession,
      addJournalEntry,
      completeOnboarding,
      consentChoices,
      hydrationError,
      isCompletingOnboarding,
      isHydrated,
      journalEntries,
      onboardingAnswers,
      onboardingComplete,
      participantId,
      resetAppData,
      selectedMode,
      sendSessionEvent,
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
