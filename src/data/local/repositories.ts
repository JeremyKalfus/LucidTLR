import type { LocalDb } from "./localDb";
import type { OnboardingAnswer, OnboardingAnswerValue } from "@/src/domain/forms";
import type {
  AppMode,
  CueEvent,
  ExternalSleepSession,
  ExternalSleepSource,
  ExternalSleepStage,
  ExternalSleepStageSegment,
  HistoricalSleepPrior,
  HistoricalSleepPriorConfidence,
  MovementEvent,
  NightSession,
  RemDensityBin,
  SessionStatus,
  SessionType,
  UploadStatus,
} from "@/src/domain/types";
import type {
  PhoneRuntimeCueRecordDraft,
  PhoneRuntimeMovementRecordDraft,
} from "@/src/native/phoneRuntime/NativePhoneSessionPlan";
import { ONBOARDING_FORM_ID, onboardingSteps } from "@/src/features/onboarding/onboardingSteps";

export const ONBOARDING_COMPLETED_AT_SETTING = "onboarding_completed_at";
export const ONBOARDING_VERSION_SETTING = "onboarding_version";
export const SLEEP_HISTORY_ENABLED_SETTING = "sleep_history_enabled";
export const SLEEP_HISTORY_SOURCE_SETTING = "sleep_history_source";
export const SLEEP_HISTORY_LAST_IMPORTED_AT_SETTING =
  "sleep_history_last_imported_at";
export const SLEEP_HISTORY_PERMISSION_STATUS_SETTING =
  "sleep_history_permission_status";
export const SLEEP_HISTORY_NIGHTS_IMPORTED_SETTING =
  "sleep_history_nights_imported";

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

interface NightSessionRow {
  id: string;
  participant_id: string;
  session_type: SessionType;
  mode: AppMode | null;
  status: SessionStatus;
  protocol_version: string;
  started_at: string;
  ended_at: string | null;
  training_started_at: string | null;
  training_ended_at: string | null;
  cueing_started_at: string | null;
  guided_training_skipped: number;
}

interface CueEventRow {
  id: string;
  session_id: string;
  timestamp: string;
  cue_id: string;
  volume_level: number;
  played: number;
  suppression_reason: CueEvent["suppressionReason"];
}

interface MovementEventRow {
  id: string;
  session_id: string;
  timestamp: string;
  intensity: number | null;
  was_cue_associated: number;
  pause_started_at: string | null;
  pause_ended_at: string | null;
}

interface ExternalSleepSessionRow {
  id: string;
  participant_id: string;
  source_platform: ExternalSleepSource;
  source_record_id_hash: string;
  start_at: string;
  end_at: string;
  imported_at: string;
  upload_status: UploadStatus;
}

interface ExternalSleepStageSegmentRow {
  id: string;
  external_sleep_session_id: string;
  stage: ExternalSleepStage;
  start_at: string;
  end_at: string;
  duration_seconds: number;
  confidence: number | null;
}

interface SleepPriorProfileRow {
  generated_at: string;
  source_platform: ExternalSleepSource;
  source_nights_count: number;
  median_sleep_onset_minutes: number | null;
  median_wake_minutes: number | null;
  median_sleep_duration_minutes: number | null;
  rem_windows_json: string;
  rem_density_by_minute_json: string | null;
  confidence: HistoricalSleepPriorConfidence;
}

const resetTables = [
  "upload_queue",
  "external_sleep_stage_segments",
  "external_sleep_sessions",
  "sleep_prior_profiles",
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

function toExternalSleepSession(
  row: ExternalSleepSessionRow,
): ExternalSleepSession {
  return {
    id: row.id,
    participantId: row.participant_id,
    sourcePlatform: row.source_platform,
    sourceRecordIdHash: row.source_record_id_hash,
    startAt: row.start_at,
    endAt: row.end_at,
    importedAt: row.imported_at,
    uploadStatus: row.upload_status,
  };
}

function toExternalSleepStageSegment(
  row: ExternalSleepStageSegmentRow,
): ExternalSleepStageSegment {
  return {
    id: row.id,
    externalSleepSessionId: row.external_sleep_session_id,
    stage: row.stage,
    startAt: row.start_at,
    endAt: row.end_at,
    durationSeconds: row.duration_seconds,
    confidence: row.confidence ?? undefined,
  };
}

function toNightSession(row: NightSessionRow): NightSession {
  return {
    id: row.id,
    participantId: row.participant_id,
    sessionType: row.session_type,
    mode: row.mode,
    status: row.status,
    protocolVersion: row.protocol_version,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    trainingStartedAt: row.training_started_at ?? undefined,
    trainingEndedAt: row.training_ended_at ?? undefined,
    cueingStartedAt: row.cueing_started_at ?? undefined,
    guidedTrainingSkipped: row.guided_training_skipped === 1,
  };
}

function toCueEvent(row: CueEventRow): CueEvent {
  return {
    id: row.id,
    sessionId: row.session_id,
    timestamp: row.timestamp,
    cueId: row.cue_id,
    volumeLevel: row.volume_level,
    deliveryDevice: "phone",
    played: row.played === 1,
    suppressionReason: row.suppression_reason,
  };
}

function toMovementEvent(row: MovementEventRow): MovementEvent {
  return {
    id: row.id,
    sessionId: row.session_id,
    timestamp: row.timestamp,
    source: "phone",
    intensity: row.intensity ?? 0,
    wasCueAssociated: row.was_cue_associated === 1,
    pauseStartedAt: row.pause_started_at ?? undefined,
    pauseEndedAt: row.pause_ended_at ?? undefined,
  };
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

export async function upsertLocalSession(input: {
  db: LocalDb;
  session: NightSession;
  uploadStatus?: UploadStatus;
}): Promise<void> {
  await input.db.execute(
    `insert into sessions (
  id,
  participant_id,
  session_type,
  mode,
  status,
  protocol_version,
  started_at,
  ended_at,
  training_started_at,
  training_ended_at,
  cueing_started_at,
  guided_training_skipped,
  upload_status
) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
on conflict(id) do update set
  status = excluded.status,
  ended_at = excluded.ended_at,
  training_started_at = excluded.training_started_at,
  training_ended_at = excluded.training_ended_at,
  cueing_started_at = excluded.cueing_started_at,
  guided_training_skipped = excluded.guided_training_skipped,
  upload_status = excluded.upload_status`,
    [
      input.session.id,
      input.session.participantId,
      input.session.sessionType,
      input.session.mode,
      input.session.status,
      input.session.protocolVersion,
      input.session.startedAt,
      input.session.endedAt ?? null,
      input.session.trainingStartedAt ?? null,
      input.session.trainingEndedAt ?? null,
      input.session.cueingStartedAt ?? null,
      input.session.guidedTrainingSkipped ? 1 : 0,
      input.uploadStatus ?? "local_only",
    ],
  );
}

export async function loadLocalSessions(input: {
  db: LocalDb;
  participantId: string;
}): Promise<NightSession[]> {
  const rows = await input.db.query<NightSessionRow>(
    `select id,
  participant_id,
  session_type,
  mode,
  status,
  protocol_version,
  started_at,
  ended_at,
  training_started_at,
  training_ended_at,
  cueing_started_at,
  guided_training_skipped
from sessions
where participant_id = ?
order by started_at desc`,
    [input.participantId],
  );

  return rows.map(toNightSession);
}

export async function savePhoneRuntimeCueRecords(input: {
  db: LocalDb;
  records: PhoneRuntimeCueRecordDraft[];
}): Promise<void> {
  for (const record of input.records) {
    await input.db.execute(
      `insert into cue_events (
  id,
  session_id,
  timestamp,
  cue_id,
  volume_level,
  delivery_device,
  played,
  suppression_reason,
  upload_status
) values (?, ?, ?, ?, ?, 'phone', ?, ?, 'local_only')
on conflict(id) do nothing`,
      [
        record.id,
        record.sessionId,
        record.timestamp,
        record.cueId,
        record.volumeLevel,
        record.played ? 1 : 0,
        record.suppressionReason,
      ],
    );
  }
}

export async function savePhoneRuntimeMovementRecords(input: {
  db: LocalDb;
  records: PhoneRuntimeMovementRecordDraft[];
}): Promise<void> {
  for (const record of input.records) {
    await input.db.execute(
      `insert into movement_events (
  id,
  session_id,
  timestamp,
  source,
  intensity,
  was_cue_associated,
  pause_started_at,
  pause_ended_at,
  upload_status
) values (?, ?, ?, 'phone', ?, ?, ?, ?, 'local_only')
on conflict(id) do nothing`,
      [
        record.id,
        record.sessionId,
        record.timestamp,
        record.intensity,
        record.wasCueAssociated ? 1 : 0,
        record.pauseStartedAt ?? null,
        record.pauseEndedAt ?? null,
      ],
    );
  }
}

export async function loadCueEventsForSession(input: {
  db: LocalDb;
  sessionId: string;
}): Promise<CueEvent[]> {
  const rows = await input.db.query<CueEventRow>(
    `select id,
  session_id,
  timestamp,
  cue_id,
  volume_level,
  played,
  suppression_reason
from cue_events
where session_id = ?
order by timestamp asc`,
    [input.sessionId],
  );

  return rows.map(toCueEvent);
}

export async function loadMovementEventsForSession(input: {
  db: LocalDb;
  sessionId: string;
}): Promise<MovementEvent[]> {
  const rows = await input.db.query<MovementEventRow>(
    `select id,
  session_id,
  timestamp,
  intensity,
  was_cue_associated,
  pause_started_at,
  pause_ended_at
from movement_events
where session_id = ?
order by timestamp asc`,
    [input.sessionId],
  );

  return rows.map(toMovementEvent);
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

export async function saveExternalSleepHistory(input: {
  db: LocalDb;
  sessions: ExternalSleepSession[];
  stageSegments: ExternalSleepStageSegment[];
}): Promise<void> {
  const segmentsBySessionId = new Map<string, ExternalSleepStageSegment[]>();

  for (const segment of input.stageSegments) {
    const segments = segmentsBySessionId.get(segment.externalSleepSessionId) ?? [];
    segments.push(segment);
    segmentsBySessionId.set(segment.externalSleepSessionId, segments);
  }

  for (const session of input.sessions) {
    await input.db.execute(
      `insert into external_sleep_sessions (
  id,
  participant_id,
  source_platform,
  source_record_id_hash,
  start_at,
  end_at,
  imported_at,
  upload_status
) values (?, ?, ?, ?, ?, ?, ?, ?)
on conflict(source_platform, source_record_id_hash) do update set
  participant_id = excluded.participant_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  imported_at = excluded.imported_at,
  upload_status = 'local_only'`,
      [
        session.id,
        session.participantId,
        session.sourcePlatform,
        session.sourceRecordIdHash,
        session.startAt,
        session.endAt,
        session.importedAt,
        session.uploadStatus,
      ],
    );

    await input.db.execute(
      "delete from external_sleep_stage_segments where external_sleep_session_id = ?",
      [session.id],
    );

    for (const segment of segmentsBySessionId.get(session.id) ?? []) {
      await input.db.execute(
        `insert into external_sleep_stage_segments (
  id,
  external_sleep_session_id,
  stage,
  start_at,
  end_at,
  duration_seconds,
  confidence
) values (?, ?, ?, ?, ?, ?, ?)`,
        [
          segment.id,
          segment.externalSleepSessionId,
          segment.stage,
          segment.startAt,
          segment.endAt,
          segment.durationSeconds,
          segment.confidence ?? null,
        ],
      );
    }
  }
}

export async function loadExternalSleepHistory(input: {
  db: LocalDb;
  participantId: string;
}): Promise<{
  sessions: ExternalSleepSession[];
  stageSegments: ExternalSleepStageSegment[];
}> {
  const sessionRows = await input.db.query<ExternalSleepSessionRow>(
    `select *
from external_sleep_sessions
where participant_id = ?
order by start_at asc`,
    [input.participantId],
  );
  const sessions = sessionRows.map(toExternalSleepSession);

  if (sessions.length === 0) {
    return { sessions, stageSegments: [] };
  }

  const placeholders = sessions.map(() => "?").join(", ");
  const segmentRows = await input.db.query<ExternalSleepStageSegmentRow>(
    `select *
from external_sleep_stage_segments
where external_sleep_session_id in (${placeholders})
order by start_at asc`,
    sessions.map((session) => session.id),
  );

  return {
    sessions,
    stageSegments: segmentRows.map(toExternalSleepStageSegment),
  };
}

export async function countExternalSleepSessions(input: {
  db: LocalDb;
  participantId: string;
}): Promise<number> {
  const row = await input.db.queryOne<{ count: number }>(
    `select count(*) as count
from external_sleep_sessions
where participant_id = ?`,
    [input.participantId],
  );

  return row?.count ?? 0;
}

export async function saveSleepPriorProfile(input: {
  db: LocalDb;
  id: string;
  participantId: string;
  prior: HistoricalSleepPrior;
}): Promise<void> {
  await input.db.execute(
    `insert into sleep_prior_profiles (
  id,
  participant_id,
  generated_at,
  source_platform,
  source_nights_count,
  median_sleep_onset_minutes,
  median_wake_minutes,
  median_sleep_duration_minutes,
  rem_windows_json,
  rem_density_by_minute_json,
  confidence,
  upload_status
) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'local_only')`,
    [
      input.id,
      input.participantId,
      input.prior.generatedAt,
      input.prior.source,
      input.prior.nightsIncluded,
      input.prior.medianSleepOnsetMinutesAfterMidnight,
      input.prior.medianWakeMinutesAfterMidnight,
      input.prior.medianSleepDurationMinutes,
      JSON.stringify(input.prior.remWindows),
      JSON.stringify(input.prior.remDensityByMinute),
      input.prior.confidence,
    ],
  );
}

export async function loadLatestSleepPriorProfile(input: {
  db: LocalDb;
  participantId: string;
}): Promise<HistoricalSleepPrior | null> {
  const row = await input.db.queryOne<SleepPriorProfileRow>(
    `select generated_at,
  source_platform,
  source_nights_count,
  median_sleep_onset_minutes,
  median_wake_minutes,
  median_sleep_duration_minutes,
  rem_windows_json,
  rem_density_by_minute_json,
  confidence
from sleep_prior_profiles
where participant_id = ?
order by generated_at desc
limit 1`,
    [input.participantId],
  );

  if (!row) {
    return null;
  }

  return {
    source: row.source_platform,
    nightsIncluded: row.source_nights_count,
    confidence: row.confidence,
    medianSleepOnsetMinutesAfterMidnight: row.median_sleep_onset_minutes,
    medianWakeMinutesAfterMidnight: row.median_wake_minutes,
    medianSleepDurationMinutes: row.median_sleep_duration_minutes,
    remWindows: JSON.parse(row.rem_windows_json) as HistoricalSleepPrior["remWindows"],
    remDensityByMinute: row.rem_density_by_minute_json
      ? (JSON.parse(row.rem_density_by_minute_json) as RemDensityBin[])
      : [],
    generatedAt: row.generated_at,
  };
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
