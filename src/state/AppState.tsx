import type { ReactNode } from "react";
import React from "react";
import { AppState as NativeAppState } from "react-native";

import { getLocalDb } from "@/src/data/local/expoSqliteDb";
import {
  buildQuestionnaireResponsePayload,
  clearAllLocalData,
  getAppSetting,
  getLocalParticipant,
  loadPhoneNightCalibrationNights,
  loadLocalSessions,
  loadOnboardingResponses,
  ONBOARDING_COMPLETED_AT_SETTING,
  ONBOARDING_VERSION_SETTING,
  replaceStructuredConsent,
  saveOnboardingResponses,
  setAppSetting,
  upsertLocalParticipant,
  upsertLocalSession,
} from "@/src/data/local/repositories";
import { createLocalUploadQueueStore } from "@/src/data/local/uploadQueueStore";
import { clearSupabaseSessionForLocalReset, prepareAnonymousResearchUpload } from "@/src/data/supabase/researchUpload";
import { enqueueIfAllowed } from "@/src/data/supabase/syncEngine";
import type {
  AppMode,
  ConsentState,
  DreamJournalEntry,
  NightSession,
  SessionType,
  TlrOptions,
  UploadStatus,
} from "@/src/domain/types";
import type {
  OnboardingAnswer,
  OnboardingAnswerValue,
  OnboardingStepId,
} from "@/src/domain/forms";
import {
  importPhoneRuntimeLogsToLocalRecords,
  latestPhoneRuntimeStopTimestamp,
  latestPhoneTrainingCompletedTimestamp,
  phoneRuntime,
  summarizePhoneRuntimeEvents,
} from "@/src/native/phoneRuntime";
import {
  ONBOARDING_FORM_ID,
  STUDY_OPT_IN_VALUE,
  STUDY_OPT_OUT_VALUE,
  STUDY_PARTICIPATION_QUESTION_ID,
} from "@/src/features/onboarding/onboardingSteps";
import { buildOnboardingAnswer, updateOnboardingAnswer } from "@/src/features/onboarding/onboardingSurvey";
import {
  disableSleepHistoryCalibration,
  importSleepHistory,
  loadSleepHistoryCalibrationState,
  type SleepHistoryCalibrationState,
} from "@/src/features/sleepHistory/importSleepHistory";
import { createLocalDreamJournalEntry } from "@/src/features/journal/journalTypes";
import { createNightSession, applySessionEvent } from "@/src/features/sessions/sessionActions";
import type { SessionEvent } from "@/src/features/sessions/sessionStateMachine";
import { canTransitionSession } from "@/src/features/sessions/sessionStateMachine";
import {
  createDefaultTlrOptions,
  mergeTlrOptionsPatch,
  normalizeTlrOptions,
  TLR_OPTIONS_KEY,
  type TlrOptionsPatch,
} from "@/src/features/tlrOptions/tlrOptions";
import {
  buildEngineSnapshot,
  buildInactiveEngineSnapshot,
  applyPhoneNightCalibrationToSettings,
  buildPhoneNightCalibrationPrior,
  createDefaultEngineSettings,
  emptyPhoneNightCalibrationPrior,
  ENGINE_SETTINGS_KEY,
  evaluateCueDecision,
  isCueingSessionActive,
  normalizeEngineSettings,
  type CueDecisionContext,
  type CueDecisionSettings,
  type EngineSnapshot,
  type PhoneNightCalibrationPrior,
  type SoundSensitivityProfile,
} from "@/src/engine";

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
  tlrOptions: TlrOptions;
  engineSettings: CueDecisionSettings;
  latestEngineSnapshot: EngineSnapshot;
  engineDecisionLog: string[];
  sleepHistory: SleepHistoryCalibrationState;
  phoneNightCalibration: PhoneNightCalibrationPrior;
  isSyncingSleepHistory: boolean;
  refreshPhoneNightCalibration: () => Promise<void>;
  reloadLocalData: () => Promise<void>;
  setSelectedMode: (mode: AppMode) => void;
  updateTlrOptions: (patch: TlrOptionsPatch) => Promise<void>;
  updateEngineSettings: (patch: Partial<CueDecisionSettings>) => Promise<void>;
  setSleepHistoryEnabled: (enabled: boolean) => Promise<void>;
  syncSleepHistoryNow: () => Promise<void>;
  setOnboardingAnswer: (input: {
    stepId: OnboardingStepId;
    questionId: string;
    value: OnboardingAnswerValue;
  }) => void;
  completeOnboarding: () => Promise<void>;
  resetAppData: () => Promise<void>;
  startSession: (sessionType: SessionType) => NightSession;
  sendSessionEvent: (
    event: SessionEvent,
    timestamp?: string,
  ) => NightSession | null;
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

function emptySleepHistoryState(): SleepHistoryCalibrationState {
  return {
    enabled: false,
    source: null,
    permissionStatus: "unknown",
    nightsImported: 0,
    prior: null,
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

const RESEARCH_UPLOAD_PREPARE_PENDING_SETTING =
  "research_upload_prepare_pending";
const ENGINE_DECISION_LOG_LIMIT = 24;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Research upload preparation is pending.";
}

function answerValue(
  answers: OnboardingAnswer[],
  questionId: string,
): OnboardingAnswerValue | undefined {
  return answers.find((answer) => answer.questionId === questionId)?.value;
}

function soundSensitivityFromAnswers(
  answers: OnboardingAnswer[],
): SoundSensitivityProfile {
  const value = answerValue(answers, "sound_sensitivity");

  if (value === "very_sensitive_light_sleeper") {
    return "sensitive";
  }

  if (value === "hard_to_wake") {
    return "hard_to_wake";
  }

  return "standard";
}

function sleepDurationHoursFromAnswer(value: OnboardingAnswerValue | undefined) {
  if (value === "lt_6") {
    return 5.5;
  }

  if (value === "6_7") {
    return 6.5;
  }

  if (value === "7_8") {
    return 7.5;
  }

  if (value === "8_plus") {
    return 8.5;
  }

  return undefined;
}

function buildEngineSettingsFromAnswers(
  answers: OnboardingAnswer[],
): CueDecisionSettings {
  const soundSensitivity = soundSensitivityFromAnswers(answers);
  const defaults = createDefaultEngineSettings(soundSensitivity);
  const typicalBedtime = answerValue(answers, "typical_bedtime");
  const typicalWakeTime = answerValue(answers, "typical_wake_time");
  const typicalSleepDurationHours = sleepDurationHoursFromAnswer(
    answerValue(answers, "typical_sleep_duration_hours"),
  );

  return normalizeEngineSettings({
    ...defaults,
    typicalBedtime:
      typeof typicalBedtime === "string" && typicalBedtime.trim()
        ? typicalBedtime
        : defaults.typicalBedtime,
    typicalWakeTime:
      typeof typicalWakeTime === "string" && typicalWakeTime.trim()
        ? typicalWakeTime
        : defaults.typicalWakeTime,
    typicalSleepDurationHours:
      typicalSleepDurationHours ?? defaults.typicalSleepDurationHours,
  });
}

function mergePersistedEngineSettings(
  answers: OnboardingAnswer[],
  persisted: CueDecisionSettings | null,
): CueDecisionSettings {
  if (!persisted) {
    return buildEngineSettingsFromAnswers(answers);
  }

  const soundSensitivity =
    persisted.soundSensitivity === "sensitive" ||
    persisted.soundSensitivity === "standard" ||
    persisted.soundSensitivity === "hard_to_wake"
      ? persisted.soundSensitivity
      : "standard";

  return normalizeEngineSettings({
    ...createDefaultEngineSettings(soundSensitivity),
    ...persisted,
    soundSensitivity,
  });
}

function buildEngineContext(input: {
  now: string;
  selectedMode: AppMode;
  activeSession: NightSession | null;
  engineSettings: CueDecisionSettings;
  sleepHistory: SleepHistoryCalibrationState;
  phoneNightCalibration: PhoneNightCalibrationPrior;
}): CueDecisionContext {
  const mode = input.activeSession?.mode ?? input.selectedMode;
  const historicalSleepPrior =
    input.sleepHistory.enabled &&
    input.sleepHistory.prior &&
    input.sleepHistory.prior.confidence !== "none"
      ? input.sleepHistory.prior
      : undefined;
  const phoneNightPrior =
    input.phoneNightCalibration.nightsIncluded > 0
      ? input.phoneNightCalibration
      : undefined;
  const settings = applyPhoneNightCalibrationToSettings(
    input.engineSettings,
    phoneNightPrior,
  );

  return {
    now: input.now,
    mode: mode ?? input.selectedMode,
    session: input.activeSession,
    settings,
    cueHistory: {
      previousCues: [],
      numberOfCuesTonight: 0,
      numberOfCuesInCurrentBlock: 0,
      latestVolumeLevel: settings.volumeStartLevel,
    },
    movement: {
      recentMovementIntensity: 0,
      stableLowMovementSeconds:
        settings.stableLowMovementRequiredSeconds,
      phonePickedUpRecently: false,
      orientationChangedRecently: false,
      largeMovementEvents: [],
    },
    userFeedback: {},
    historicalSleepPrior,
    phoneNightPrior,
  };
}

async function importCompletedPhoneRuntimeCalibrations(
  sessions: NightSession[],
): Promise<void> {
  if (!phoneRuntime.isAvailable()) {
    return;
  }

  const db = await getLocalDb();
  const existingSessionIds = new Set(
    (await loadPhoneNightCalibrationNights(db)).map((night) => night.sessionId),
  );
  const completedPhoneSessions = sessions
    .filter(
      (session) =>
        session.sessionType === "tlr" &&
        session.mode === "phone" &&
        Boolean(session.trainingEndedAt) &&
        (session.status === "ended" ||
          session.status === "morning_review_complete") &&
        !existingSessionIds.has(session.id),
    )
    .slice(0, 5);

  for (const session of completedPhoneSessions) {
    try {
      const logs = await phoneRuntime.getPhoneRuntimeLogs(session.id);

      await importPhoneRuntimeLogsToLocalRecords(logs);
    } catch {
      // Missing native logs should not block app hydration.
    }
  }
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
  const [tlrOptions, setTlrOptions] = React.useState(() =>
    createDefaultTlrOptions(),
  );
  const [engineSettings, setEngineSettings] = React.useState(() =>
    createDefaultEngineSettings("standard"),
  );
  const [sleepHistory, setSleepHistory] = React.useState(
    emptySleepHistoryState,
  );
  const [phoneNightCalibration, setPhoneNightCalibration] = React.useState(() =>
    emptyPhoneNightCalibrationPrior(),
  );
  const [isSyncingSleepHistory, setIsSyncingSleepHistory] =
    React.useState(false);
  const [engineNowMs, setEngineNowMs] = React.useState(() => Date.now());
  const [engineDecisionLog, setEngineDecisionLog] = React.useState<string[]>([]);
  const shouldRecordEngineDecisions = isCueingSessionActive(activeSession);

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
        const persistedEngineSettings =
          await getAppSetting<CueDecisionSettings>(db, ENGINE_SETTINGS_KEY);
        const nextEngineSettings = mergePersistedEngineSettings(
          persistedAnswers,
          persistedEngineSettings,
        );
        const persistedTlrOptions = await getAppSetting<TlrOptions>(
          db,
          TLR_OPTIONS_KEY,
        );
        const nextTlrOptions = normalizeTlrOptions(
          persistedTlrOptions,
          nextEngineSettings.typicalWakeTime,
        );
        const persistedSleepHistory = participant
          ? await loadSleepHistoryCalibrationState({
              db,
              participantId: participant.id,
            })
          : emptySleepHistoryState();
        const persistedSessions = participant
          ? await loadLocalSessions({
              db,
              participantId: participant.id,
            })
          : [];
        await importCompletedPhoneRuntimeCalibrations(persistedSessions);
        const persistedPhoneNightCalibration = buildPhoneNightCalibrationPrior({
          nights: await loadPhoneNightCalibrationNights(db),
        });

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
        setSessionHistory(persistedSessions);
        setActiveSession(
          persistedSessions.find(
            (session) =>
              session.status !== "ended" &&
              session.status !== "morning_review_complete",
          ) ?? null,
        );
        setTlrOptions(nextTlrOptions);
        setEngineSettings(nextEngineSettings);
        setSleepHistory(persistedSleepHistory);
        setPhoneNightCalibration(persistedPhoneNightCalibration);
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

  const reloadLocalData = React.useCallback(async () => {
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
    const persistedEngineSettings =
      await getAppSetting<CueDecisionSettings>(db, ENGINE_SETTINGS_KEY);
    const nextEngineSettings = mergePersistedEngineSettings(
      persistedAnswers,
      persistedEngineSettings,
    );
    const persistedTlrOptions = await getAppSetting<TlrOptions>(
      db,
      TLR_OPTIONS_KEY,
    );
    const nextTlrOptions = normalizeTlrOptions(
      persistedTlrOptions,
      nextEngineSettings.typicalWakeTime,
    );
    const persistedSleepHistory = participant
      ? await loadSleepHistoryCalibrationState({
          db,
          participantId: participant.id,
        })
      : emptySleepHistoryState();
    const persistedSessions = participant
      ? await loadLocalSessions({
          db,
          participantId: participant.id,
        })
      : [];

    await importCompletedPhoneRuntimeCalibrations(persistedSessions);

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
    setSessionHistory(persistedSessions);
    setActiveSession(
      persistedSessions.find(
        (session) =>
          session.status !== "ended" &&
          session.status !== "morning_review_complete",
      ) ?? null,
    );
    setTlrOptions(nextTlrOptions);
    setEngineSettings(nextEngineSettings);
    setSleepHistory(persistedSleepHistory);
    setPhoneNightCalibration(
      buildPhoneNightCalibrationPrior({
        nights: await loadPhoneNightCalibrationNights(db),
      }),
    );
    setOnboardingComplete(Boolean(completedAt && onboardingVersion));
    setEngineDecisionLog([]);
    setHydrationError(null);
  }, []);

  React.useEffect(() => {
    if (!shouldRecordEngineDecisions) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      setEngineNowMs(Date.now());
    }, 30000);

    return () => clearInterval(intervalId);
  }, [shouldRecordEngineDecisions]);

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
    const nextEngineSettings = buildEngineSettingsFromAnswers(onboardingAnswers);
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
        try {
          await prepareAnonymousResearchUpload({
            db,
            participantId,
            consentVersion: ONBOARDING_FORM_ID,
            acceptedAt: now,
          });
        } catch (error) {
          await setAppSetting(
            db,
            RESEARCH_UPLOAD_PREPARE_PENDING_SETTING,
            {
              failedAt: now,
              message: getErrorMessage(error),
            },
            now,
          );
        }
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
      await setAppSetting(db, ENGINE_SETTINGS_KEY, nextEngineSettings, now);
      await setAppSetting(
        db,
        TLR_OPTIONS_KEY,
        normalizeTlrOptions(tlrOptions, nextEngineSettings.typicalWakeTime),
        now,
      );
      setEngineSettings(nextEngineSettings);
      setTlrOptions(normalizeTlrOptions(tlrOptions, nextEngineSettings.typicalWakeTime));
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
    tlrOptions,
  ]);

  const resetAppData = React.useCallback(async () => {
    const db = await getLocalDb();

    await clearSupabaseSessionForLocalReset(db);
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
    setTlrOptions(createDefaultTlrOptions());
    setEngineSettings(createDefaultEngineSettings("standard"));
    setSleepHistory(emptySleepHistoryState());
    setPhoneNightCalibration(emptyPhoneNightCalibrationPrior());
    setIsSyncingSleepHistory(false);
    setEngineDecisionLog([]);
  }, []);

  const persistSelectedMode = React.useCallback(
    (mode: AppMode) => {
      setSelectedMode(mode);

      if (!onboardingComplete) {
        return;
      }

      void getLocalDb().then((db) =>
        upsertLocalParticipant({
          db,
          participantId,
          appInstallId,
          createdAt: participantCreatedAt,
          selectedMode: mode,
          structuredResearchUploadAccepted:
            consentChoices.structuredResearchUploadConsent,
          dreamJournalUploadAccepted: consentChoices.dreamJournalUploadConsent,
        }),
      );
    },
    [
      appInstallId,
      consentChoices.dreamJournalUploadConsent,
      consentChoices.structuredResearchUploadConsent,
      onboardingComplete,
      participantCreatedAt,
      participantId,
    ],
  );

  const updateTlrOptions = React.useCallback(
    async (patch: TlrOptionsPatch) => {
      const nextOptions = mergeTlrOptionsPatch(
        tlrOptions,
        patch,
        engineSettings.typicalWakeTime,
      );
      const db = await getLocalDb();
      const now = new Date().toISOString();

      await setAppSetting(db, TLR_OPTIONS_KEY, nextOptions, now);
      setTlrOptions(nextOptions);
    },
    [engineSettings.typicalWakeTime, tlrOptions],
  );

  const updateEngineSettings = React.useCallback(
    async (patch: Partial<CueDecisionSettings>) => {
      const nextSettings = normalizeEngineSettings({
        ...engineSettings,
        ...patch,
      });
      const db = await getLocalDb();
      const now = new Date().toISOString();

      await setAppSetting(db, ENGINE_SETTINGS_KEY, nextSettings, now);
      setEngineSettings(nextSettings);
    },
    [engineSettings],
  );

  const syncSleepHistoryNow = React.useCallback(async () => {
    const db = await getLocalDb();

    setIsSyncingSleepHistory(true);
    setSleepHistory((state) => ({
      ...state,
      lastSyncError: undefined,
    }));

    try {
      const result = await importSleepHistory({
        db,
        participantId,
      });

      setSleepHistory({
        enabled: result.enabled,
        source: result.source,
        permissionStatus: result.permissionStatus,
        lastImportedAt: result.lastImportedAt,
        nightsImported: result.nightsImported,
        prior: result.prior,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Sleep history sync failed.";

      setSleepHistory((state) => ({
        ...state,
        lastSyncError: message,
      }));
    } finally {
      setIsSyncingSleepHistory(false);
    }
  }, [participantId]);

  const setSleepHistoryEnabled = React.useCallback(
    async (enabled: boolean) => {
      const db = await getLocalDb();

      if (!enabled) {
        const now = new Date().toISOString();
        const disabledState = await disableSleepHistoryCalibration({
          db,
          participantId,
          now,
        });

        setSleepHistory(disabledState);
        return;
      }

      await syncSleepHistoryNow();
    },
    [participantId, syncSleepHistoryNow],
  );

  const refreshPhoneNightCalibration = React.useCallback(async () => {
    const db = await getLocalDb();

    setPhoneNightCalibration(
      buildPhoneNightCalibrationPrior({
        nights: await loadPhoneNightCalibrationNights(db),
      }),
    );
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
        selectedCueId: tlrOptions.selectedCueId,
      });
      const nextSession =
        sessionType === "sleep_log"
          ? applySessionEvent(session, "start_cueing", now)
          : session;

      setActiveSession(nextSession);
      setSessionHistory((sessions) => [nextSession, ...sessions]);
      void getLocalDb().then((db) =>
        upsertLocalSession({
          db,
          session: nextSession,
        }),
      );
      return nextSession;
    },
    [participantId, selectedMode, tlrOptions.selectedCueId],
  );

  const sendSessionEvent = React.useCallback(
    (event: SessionEvent, timestamp = new Date().toISOString()) => {
      if (
        !activeSession ||
        !canTransitionSession(
          activeSession.sessionType,
          activeSession.status,
          event,
        )
      ) {
        return null;
      }

      const nextSession = applySessionEvent(activeSession, event, timestamp);

      setActiveSession(nextSession);
      setSessionHistory((sessions) =>
        sessions.map((candidate) =>
          candidate.id === nextSession.id ? nextSession : candidate,
        ),
      );
      void getLocalDb().then((db) =>
        upsertLocalSession({
          db,
          session: nextSession,
        }),
      );

      return nextSession;
    },
    [activeSession],
  );

  const reconcileNativePhoneRuntimeCompletion = React.useCallback(async () => {
    if (
      !activeSession ||
      activeSession.sessionType !== "tlr" ||
      activeSession.mode !== "phone" ||
      !canTransitionSession(
        activeSession.sessionType,
        activeSession.status,
        "end_session",
      )
    ) {
      return;
    }

    try {
      const status = await phoneRuntime.getPhoneRuntimeStatus();

      if (!status.available || status.running) {
        if (
          status.available &&
          status.running &&
          activeSession.status === "training" &&
          status.sessionId === activeSession.id &&
          (status.phase === "runtime" ||
            status.audioBedRunning ||
            status.motionRunning ||
            status.latestDecisionReason === "training_completed")
        ) {
          const logs = await phoneRuntime.getPhoneRuntimeLogs(activeSession.id);
          const completedAt = latestPhoneTrainingCompletedTimestamp(logs);

          if (completedAt) {
            sendSessionEvent("finish_training", completedAt);
          }
        }

        return;
      }

      const logs = await phoneRuntime.getPhoneRuntimeLogs(activeSession.id);
      const summary = summarizePhoneRuntimeEvents(logs);

      if (!summary.stopped && !summary.completed && !summary.errored) {
        return;
      }

      if (activeSession.status === "training") {
        const completedAt = latestPhoneTrainingCompletedTimestamp(logs);

        if (completedAt) {
          sendSessionEvent("finish_training", completedAt);
          return;
        }
      }

      await importPhoneRuntimeLogsToLocalRecords(logs);
      await refreshPhoneNightCalibration();
      sendSessionEvent(
        "end_session",
        latestPhoneRuntimeStopTimestamp(logs) ?? new Date().toISOString(),
      );
    } catch {
      // Screen-level runtime panels surface actionable native errors.
    }
  }, [activeSession, refreshPhoneNightCalibration, sendSessionEvent]);

  React.useEffect(() => {
    const subscription = NativeAppState.addEventListener("change", (state) => {
      if (state === "active") {
        void reconcileNativePhoneRuntimeCompletion();
        void importCompletedPhoneRuntimeCalibrations(sessionHistory).then(
          refreshPhoneNightCalibration,
        );
      }
    });

    return () => subscription.remove();
  }, [
    reconcileNativePhoneRuntimeCompletion,
    refreshPhoneNightCalibration,
    sessionHistory,
  ]);

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

  const engineContext = React.useMemo(
    () =>
      buildEngineContext({
        now: new Date(engineNowMs).toISOString(),
        selectedMode,
        activeSession,
        engineSettings,
        sleepHistory,
        phoneNightCalibration,
      }),
    [
      activeSession,
      engineNowMs,
      engineSettings,
      phoneNightCalibration,
      selectedMode,
      sleepHistory,
    ],
  );
  const latestEngineSnapshot = React.useMemo(() => {
    if (!shouldRecordEngineDecisions) {
      return buildInactiveEngineSnapshot({ context: engineContext });
    }

    const decision = evaluateCueDecision(engineContext);
    return buildEngineSnapshot({ context: engineContext, decision });
  }, [engineContext, shouldRecordEngineDecisions]);

  React.useEffect(() => {
    if (!shouldRecordEngineDecisions) {
      return;
    }

    setEngineDecisionLog((log) => {
      if (log[0] === latestEngineSnapshot.decisionLogLine) {
        return log;
      }

      return [latestEngineSnapshot.decisionLogLine, ...log].slice(
        0,
        ENGINE_DECISION_LOG_LIMIT,
      );
    });
  }, [
    latestEngineSnapshot.decisionLogLine,
    shouldRecordEngineDecisions,
  ]);

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
      tlrOptions,
      engineSettings,
      latestEngineSnapshot,
      engineDecisionLog,
      sleepHistory,
      phoneNightCalibration,
      isSyncingSleepHistory,
      refreshPhoneNightCalibration,
      reloadLocalData,
      setSelectedMode: persistSelectedMode,
      updateTlrOptions,
      updateEngineSettings,
      setSleepHistoryEnabled,
      syncSleepHistoryNow,
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
      engineDecisionLog,
      engineSettings,
      hydrationError,
      isCompletingOnboarding,
      isHydrated,
      isSyncingSleepHistory,
      journalEntries,
      latestEngineSnapshot,
      onboardingAnswers,
      onboardingComplete,
      participantId,
      phoneNightCalibration,
      persistSelectedMode,
      refreshPhoneNightCalibration,
      reloadLocalData,
      resetAppData,
      selectedMode,
      sendSessionEvent,
      setOnboardingAnswer,
      setSleepHistoryEnabled,
      sleepHistory,
      startSession,
      syncSleepHistoryNow,
      tlrOptions,
      updateEngineSettings,
      updateTlrOptions,
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
