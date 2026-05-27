import type { LocalDb } from "./localDb";
import type { OnboardingAnswer, OnboardingAnswerValue } from "@/src/domain/forms";
import type { AppMode, UploadStatus } from "@/src/domain/types";
import { ONBOARDING_FORM_ID, onboardingSteps } from "@/src/features/onboarding/onboardingSteps";

export const ONBOARDING_COMPLETED_AT_SETTING = "onboarding_completed_at";
export const ONBOARDING_VERSION_SETTING = "onboarding_version";

export interface LocalParticipantRow {
  id: string;
  app_install_id: string;
  created_at: string;
  selected_mode: string | null;
  structured_upload_consent: number;
  dream_upload_consent: number;
}

interface QuestionnaireResponseRow {
  id: string;
  participant_id: string;
  question_id: string;
  value_json: string;
  created_at: string;
  updated_at: string;
}

interface AppSettingRow {
  value_json: string;
}

const resetTables = [
  "upload_queue",
  "dream_journals",
  "morning_reports",
  "watch_epochs",
  "movement_events",
  "cue_events",
  "sessions",
  "questionnaire_responses",
  "consents",
  "participants",
  "app_settings",
] as const;

const questionStepIdByQuestionId = new Map(
  onboardingSteps.flatMap((step) =>
    step.questions.map((question) => [question.id, step.id] as const),
  ),
);

export async function getAppSetting<T>(
  db: LocalDb,
  key: string,
): Promise<T | null> {
  const row = await db.queryOne<AppSettingRow>(
    "select value_json from app_settings where key = ? limit 1",
    [key],
  );

  return row ? (JSON.parse(row.value_json) as T) : null;
}

export async function setAppSetting(
  db: LocalDb,
  key: string,
  value: unknown,
  updatedAt: string,
): Promise<void> {
  await db.execute(
    `insert into app_settings (key, value_json, updated_at)
values (?, ?, ?)
on conflict(key) do update set
  value_json = excluded.value_json,
  updated_at = excluded.updated_at`,
    [key, JSON.stringify(value), updatedAt],
  );
}

export async function deleteAppSettingsWithPrefix(
  db: LocalDb,
  prefix: string,
): Promise<void> {
  await db.execute("delete from app_settings where key like ?", [`${prefix}%`]);
}

export async function clearAllLocalData(db: LocalDb): Promise<void> {
  for (const table of resetTables) {
    await db.execute(`delete from ${table}`);
  }
}

export async function getLocalParticipant(
  db: LocalDb,
): Promise<LocalParticipantRow | null> {
  return db.queryOne<LocalParticipantRow>(
    "select * from participants order by created_at asc limit 1",
  );
}

export async function upsertLocalParticipant(input: {
  db: LocalDb;
  participantId: string;
  appInstallId: string;
  createdAt: string;
  selectedMode: AppMode;
  structuredResearchUploadAccepted: boolean;
  dreamJournalUploadAccepted: boolean;
}): Promise<void> {
  await input.db.execute(
    `insert into participants (
  id,
  app_install_id,
  created_at,
  selected_mode,
  structured_upload_consent,
  dream_upload_consent
) values (?, ?, ?, ?, ?, ?)
on conflict(id) do update set
  selected_mode = excluded.selected_mode,
  structured_upload_consent = excluded.structured_upload_consent,
  dream_upload_consent = excluded.dream_upload_consent`,
    [
      input.participantId,
      input.appInstallId,
      input.createdAt,
      input.selectedMode,
      input.structuredResearchUploadAccepted ? 1 : 0,
      input.dreamJournalUploadAccepted ? 1 : 0,
    ],
  );
}

export async function replaceStructuredConsent(input: {
  db: LocalDb;
  consentId: string;
  participantId: string;
  consentVersion: string;
  acceptedAt: string | null;
  appVersion: string;
}): Promise<void> {
  await input.db.execute(
    "delete from consents where participant_id = ? and consent_type = ?",
    [input.participantId, "structured_research_upload"],
  );

  if (!input.acceptedAt) {
    return;
  }

  await input.db.execute(
    `insert into consents (
  id,
  participant_id,
  consent_type,
  consent_version,
  accepted_at,
  app_version
) values (?, ?, ?, ?, ?, ?)`,
    [
      input.consentId,
      input.participantId,
      "structured_research_upload",
      input.consentVersion,
      input.acceptedAt,
      input.appVersion,
    ],
  );
}

export async function saveOnboardingResponses(input: {
  db: LocalDb;
  answers: OnboardingAnswer[];
  uploadStatus: UploadStatus;
}): Promise<void> {
  for (const answer of input.answers) {
    await input.db.execute(
      `insert into questionnaire_responses (
  id,
  participant_id,
  form_id,
  question_id,
  value_json,
  created_at,
  updated_at,
  upload_status
) values (?, ?, ?, ?, ?, ?, ?, ?)
on conflict(id) do update set
  value_json = excluded.value_json,
  updated_at = excluded.updated_at,
  upload_status = excluded.upload_status`,
      [
        answer.id,
        answer.participantId,
        ONBOARDING_FORM_ID,
        answer.questionId,
        JSON.stringify(answer.value),
        answer.createdAt,
        answer.updatedAt,
        input.uploadStatus,
      ],
    );
  }
}

export async function loadOnboardingResponses(
  db: LocalDb,
  participantId: string,
): Promise<OnboardingAnswer[]> {
  const rows = await db.query<QuestionnaireResponseRow>(
    `select id, participant_id, question_id, value_json, created_at, updated_at
from questionnaire_responses
where participant_id = ? and form_id = ?
order by created_at asc`,
    [participantId, ONBOARDING_FORM_ID],
  );

  return rows.flatMap((row) => {
    const stepId = questionStepIdByQuestionId.get(row.question_id);

    if (!stepId) {
      return [];
    }

    return [
      {
        id: row.id,
        participantId: row.participant_id,
        stepId,
        questionId: row.question_id,
        value: JSON.parse(row.value_json) as OnboardingAnswerValue,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    ];
  });
}

export function buildQuestionnaireResponsePayload(answer: OnboardingAnswer) {
  return {
    local_response_id: answer.id,
    participant_id: answer.participantId,
    local_session_id: null,
    form_id: ONBOARDING_FORM_ID,
    question_id: answer.questionId,
    value_json: answer.value,
    created_at: answer.createdAt,
    updated_at: answer.updatedAt,
  };
}
