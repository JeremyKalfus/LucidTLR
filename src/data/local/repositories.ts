import type { LocalDb } from "./localDb";
import { normalizeCueId } from "@/src/audio/cueCatalog";
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
  MorningReport,
  MovementEvent,
  NightSession,
  PhoneNightCalibrationNight,
  RemDensityBin,
  SessionStatus,
  SessionType,
  UploadStatus,
  WatchEpoch,
} from "@/src/domain/types";
import type {
  PhoneRuntimeCueRecordDraft,
  PhoneRuntimeMovementRecordDraft,
} from "@/src/native/phoneRuntime/NativePhoneSessionPlan";
import type {
  WatchCueRecordDraft,
  WatchEpochRecordDraft,
  WatchMovementRecordDraft,
  WatchRuntimeEvent,
} from "@/src/features/watchHistory/watchHistoryTypes";
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
export const PHONE_NIGHT_CALIBRATION_NIGHTS_SETTING =
  "phone_night_calibration_nights_v1";

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
  selected_cue_id: string | null;
  guided_training_skipped: number;
}

interface CueEventRow {
  id: string;
  session_id: string;
  timestamp: string;
  cue_id: string;
  volume_level: number;
  delivery_device: CueEvent["deliveryDevice"];
  played: number;
  suppression_reason: CueEvent["suppressionReason"];
}

interface MovementEventRow {
  id: string;
  session_id: string;
  timestamp: string;
  source: MovementEvent["source"];
  intensity: number | null;
  was_cue_associated: number;
  pause_started_at: string | null;
  pause_ended_at: string | null;
}

interface WatchEpochRow {
  id: string;
  session_id: string;
  epoch_start: string;
  epoch_end: string;
  heart_rate_summary: number | null;
  motion_summary: number | null;
  sensor_quality: WatchEpoch["sensorQuality"] | null;
  sleep_probability: number | null;
  elapsed_session_seconds: number;
  rem_probability: number | null;
  rem_label: WatchEpoch["remLabel"] | null;
  classifier_version: string | null;
  epoch_features_json: string | null;
  watch_battery_level: number | null;
  watch_connectivity_state: WatchEpoch["watchConnectivityState"] | null;
  sample_counts_json: string | null;
  stage_probabilities_json: string | null;
  stage_label: string | null;
  epoch_received_at: string | null;
  processed_at: string | null;
  heart_rate_sample_count: number | null;
  motion_sample_count: number | null;
  hr_feature: number | null;
  motion_feature: number | null;
  motion_ema: number | null;
  time_feature: number | null;
  raw_epoch_available: number | null;
  stable_low_movement_seconds: number | null;
  rough_movement_intensity: WatchEpoch["roughMovementIntensity"] | null;
  cue_decision_reason: string | null;
}

interface WatchRuntimeEventRow {
  id: string;
  session_id: string;
  timestamp: string;
  event_type: WatchRuntimeEvent["eventType"];
  payload_json: string;
}

export type WatchSyncPackageImportStatus =
  | "importing"
  | "imported"
  | "import_failed";

export interface WatchSyncPackageImportRecord {
  packageId: string;
  sessionId: string;
  planHash: string;
  packageHash: string;
  sealedAt: string;
  importedAt?: string;
  importStatus: WatchSyncPackageImportStatus;
  manifestJson: string;
  importError?: string;
}

interface WatchSyncPackageRow {
  package_id: string;
  session_id: string;
  plan_hash: string;
  package_hash: string;
  sealed_at: string;
  imported_at: string | null;
  import_status: WatchSyncPackageImportStatus;
  manifest_json: string;
  import_error: string | null;
}

interface MorningReportRow {
  id: string;
  session_id: string;
  submitted_at: string;
  remembered_dream: number;
  lucid_dream: number | null;
  heard_cue: number | null;
  cue_incorporated: number | null;
  cue_woke_user: number | null;
  returned_to_sleep: number | null;
  sleep_quality_rating: number | null;
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
  "watch_runtime_events",
  "watch_session_sync_states",
  "watch_sync_packages",
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
    selectedCueId:
      row.session_type === "tlr"
        ? normalizeCueId(row.selected_cue_id)
        : undefined,
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
    deliveryDevice: row.delivery_device === "watch" ? "watch" : "phone",
    played: row.played === 1,
    suppressionReason: row.suppression_reason,
  };
}

function toMovementEvent(row: MovementEventRow): MovementEvent {
  return {
    id: row.id,
    sessionId: row.session_id,
    timestamp: row.timestamp,
    source: row.source === "watch" ? "watch" : "phone",
    intensity: row.intensity ?? 0,
    wasCueAssociated: row.was_cue_associated === 1,
    pauseStartedAt: row.pause_started_at ?? undefined,
    pauseEndedAt: row.pause_ended_at ?? undefined,
  };
}

function toWatchEpoch(row: WatchEpochRow): WatchEpoch {
  return {
    id: row.id,
    sessionId: row.session_id,
    epochStart: row.epoch_start,
    epochEnd: row.epoch_end,
    heartRateSummary: row.heart_rate_summary ?? undefined,
    motionSummary: row.motion_summary ?? undefined,
    sensorQuality: row.sensor_quality ?? undefined,
    sleepProbability: row.sleep_probability ?? undefined,
    elapsedSessionSeconds: row.elapsed_session_seconds,
    remProbability: row.rem_probability ?? undefined,
    remLabel: row.rem_label ?? undefined,
    classifierVersion: row.classifier_version ?? undefined,
    epochFeaturesJson: row.epoch_features_json ?? undefined,
    watchBatteryLevel: row.watch_battery_level ?? undefined,
    watchConnectivityState: row.watch_connectivity_state ?? undefined,
    sampleCountsJson: row.sample_counts_json ?? undefined,
    stageProbabilitiesJson: row.stage_probabilities_json ?? undefined,
    stageLabel: row.stage_label ?? undefined,
    epochReceivedAt: row.epoch_received_at ?? undefined,
    processedAt: row.processed_at ?? undefined,
    heartRateSampleCount: row.heart_rate_sample_count ?? undefined,
    motionSampleCount: row.motion_sample_count ?? undefined,
    hrFeature: row.hr_feature ?? undefined,
    motionFeature: row.motion_feature ?? undefined,
    motionEma: row.motion_ema ?? undefined,
    timeFeature: row.time_feature ?? undefined,
    rawEpochAvailable: row.raw_epoch_available === 1,
    stableLowMovementSeconds: row.stable_low_movement_seconds ?? undefined,
    roughMovementIntensity: row.rough_movement_intensity ?? undefined,
    cueDecisionReason: row.cue_decision_reason ?? undefined,
  };
}

function toWatchRuntimeEvent(row: WatchRuntimeEventRow): WatchRuntimeEvent {
  return {
    id: row.id,
    sessionId: row.session_id,
    timestamp: row.timestamp,
    eventType: row.event_type,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
  };
}

function toWatchSyncPackageImport(
  row: WatchSyncPackageRow,
): WatchSyncPackageImportRecord {
  return {
    packageId: row.package_id,
    sessionId: row.session_id,
    planHash: row.plan_hash,
    packageHash: row.package_hash,
    sealedAt: row.sealed_at,
    importedAt: row.imported_at ?? undefined,
    importStatus: row.import_status,
    manifestJson: row.manifest_json,
    importError: row.import_error ?? undefined,
  };
}

function nullableBoolean(value: number | null): boolean | null {
  if (value === null) {
    return null;
  }

  return value === 1;
}

function toMorningReport(row: MorningReportRow): MorningReport {
  return {
    id: row.id,
    sessionId: row.session_id,
    submittedAt: row.submitted_at,
    rememberedDream: row.remembered_dream === 1,
    lucidDream: nullableBoolean(row.lucid_dream),
    heardCue: nullableBoolean(row.heard_cue),
    cueIncorporated: nullableBoolean(row.cue_incorporated),
    cueWokeUser: nullableBoolean(row.cue_woke_user),
    returnedToSleep: nullableBoolean(row.returned_to_sleep),
    sleepQualityRating: row.sleep_quality_rating ?? undefined,
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
  selected_cue_id,
  guided_training_skipped,
  upload_status
) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
on conflict(id) do update set
  status = excluded.status,
  ended_at = excluded.ended_at,
  training_started_at = excluded.training_started_at,
  training_ended_at = excluded.training_ended_at,
  cueing_started_at = excluded.cueing_started_at,
  selected_cue_id = excluded.selected_cue_id,
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
      input.session.selectedCueId ?? null,
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
  selected_cue_id,
  guided_training_skipped
from sessions
where participant_id = ?
order by started_at desc`,
    [input.participantId],
  );

  return rows.map(toNightSession);
}

export async function deleteLocalSession(input: {
  db: LocalDb;
  sessionId: string;
  updatedAt: string;
}): Promise<void> {
  const sessionScopedTables = [
    "cue_events",
    "movement_events",
    "watch_epochs",
    "watch_runtime_events",
    "watch_session_sync_states",
    "watch_sync_packages",
    "morning_reports",
    "dream_journals",
    "questionnaire_responses",
  ] as const;

  for (const table of sessionScopedTables) {
    await input.db.execute(`delete from ${table} where session_id = ?`, [
      input.sessionId,
    ]);
  }

  await input.db.execute("delete from upload_queue where entity_id = ?", [
    input.sessionId,
  ]);
  await input.db.execute("delete from sessions where id = ?", [input.sessionId]);

  const existingCalibrationNights = await loadPhoneNightCalibrationNights(
    input.db,
  );
  const nextCalibrationNights = existingCalibrationNights.filter(
    (night) => night.sessionId !== input.sessionId,
  );

  if (nextCalibrationNights.length !== existingCalibrationNights.length) {
    await setAppSetting(
      input.db,
      PHONE_NIGHT_CALIBRATION_NIGHTS_SETTING,
      nextCalibrationNights,
      input.updatedAt,
    );
  }
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

export async function saveWatchCueRecords(input: {
  db: LocalDb;
  records: WatchCueRecordDraft[];
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
) values (?, ?, ?, ?, ?, ?, ?, ?, 'local_only')
on conflict(id) do nothing`,
      [
        record.id,
        record.sessionId,
        record.timestamp,
        record.cueId,
        record.volumeLevel,
        record.deliveryDevice ?? "watch",
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

export async function saveWatchMovementRecords(input: {
  db: LocalDb;
  records: WatchMovementRecordDraft[];
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
) values (?, ?, ?, 'watch', ?, ?, ?, ?, 'local_only')
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
  delivery_device,
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
  source,
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

const watchEpochSelect = `select id,
  session_id,
  epoch_start,
  epoch_end,
  heart_rate_summary,
  motion_summary,
  sensor_quality,
  sleep_probability,
  elapsed_session_seconds,
  rem_probability,
  rem_label,
  classifier_version,
  epoch_features_json,
  watch_battery_level,
  watch_connectivity_state,
  sample_counts_json,
  stage_probabilities_json,
  stage_label,
  epoch_received_at,
  processed_at,
  heart_rate_sample_count,
  motion_sample_count,
  hr_feature,
  motion_feature,
  motion_ema,
  time_feature,
  raw_epoch_available,
  stable_low_movement_seconds,
  rough_movement_intensity,
  cue_decision_reason
from watch_epochs`;

export async function saveWatchEpochs(input: {
  db: LocalDb;
  records: WatchEpochRecordDraft[];
}): Promise<void> {
  for (const record of input.records) {
    await input.db.execute(
      `insert into watch_epochs (
  id,
  session_id,
  epoch_start,
  epoch_end,
  heart_rate_summary,
  motion_summary,
  sensor_quality,
  sleep_probability,
  elapsed_session_seconds,
  rem_probability,
  rem_label,
  classifier_version,
  epoch_features_json,
  watch_battery_level,
  watch_connectivity_state,
  sample_counts_json,
  stage_probabilities_json,
  stage_label,
  epoch_received_at,
  processed_at,
  heart_rate_sample_count,
  motion_sample_count,
  hr_feature,
  motion_feature,
  motion_ema,
  time_feature,
  raw_epoch_available,
  stable_low_movement_seconds,
  rough_movement_intensity,
  cue_decision_reason,
  upload_status
) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'local_only')
on conflict(id) do update set
  heart_rate_summary = excluded.heart_rate_summary,
  motion_summary = excluded.motion_summary,
  sensor_quality = excluded.sensor_quality,
  sleep_probability = excluded.sleep_probability,
  rem_probability = excluded.rem_probability,
  rem_label = excluded.rem_label,
  classifier_version = excluded.classifier_version,
  epoch_features_json = excluded.epoch_features_json,
  watch_battery_level = excluded.watch_battery_level,
  watch_connectivity_state = excluded.watch_connectivity_state,
  sample_counts_json = excluded.sample_counts_json,
  stage_probabilities_json = excluded.stage_probabilities_json,
  stage_label = excluded.stage_label,
  epoch_received_at = excluded.epoch_received_at,
  processed_at = excluded.processed_at,
  heart_rate_sample_count = excluded.heart_rate_sample_count,
  motion_sample_count = excluded.motion_sample_count,
  hr_feature = excluded.hr_feature,
  motion_feature = excluded.motion_feature,
  motion_ema = excluded.motion_ema,
  time_feature = excluded.time_feature,
  raw_epoch_available = excluded.raw_epoch_available,
  stable_low_movement_seconds = excluded.stable_low_movement_seconds,
  rough_movement_intensity = excluded.rough_movement_intensity,
  cue_decision_reason = excluded.cue_decision_reason`,
      [
        record.id,
        record.sessionId,
        record.epochStart,
        record.epochEnd,
        record.heartRateSummary ?? null,
        record.motionSummary ?? null,
        record.sensorQuality ?? null,
        record.sleepProbability ?? null,
        record.elapsedSessionSeconds,
        record.remProbability ?? null,
        record.remLabel ?? null,
        record.classifierVersion ?? null,
        record.epochFeaturesJson ?? null,
        record.watchBatteryLevel ?? null,
        record.watchConnectivityState ?? null,
        record.sampleCountsJson ?? null,
        record.stageProbabilitiesJson ?? null,
        record.stageLabel ?? null,
        record.epochReceivedAt ?? null,
        record.processedAt ?? null,
        record.heartRateSampleCount ?? null,
        record.motionSampleCount ?? null,
        record.hrFeature ?? null,
        record.motionFeature ?? null,
        record.motionEma ?? null,
        record.timeFeature ?? null,
        record.rawEpochAvailable ? 1 : 0,
        record.stableLowMovementSeconds ?? null,
        record.roughMovementIntensity ?? null,
        record.cueDecisionReason ?? null,
      ],
    );
  }
}

export async function loadWatchEpochsForSession(input: {
  db: LocalDb;
  sessionId: string;
}): Promise<WatchEpoch[]> {
  const rows = await input.db.query<WatchEpochRow>(
    `${watchEpochSelect}
where session_id = ?
order by epoch_start asc`,
    [input.sessionId],
  );

  return rows.map(toWatchEpoch);
}

export async function loadLatestWatchEpoch(input: {
  db: LocalDb;
  sessionId: string;
}): Promise<WatchEpoch | null> {
  const row = await input.db.queryOne<WatchEpochRow>(
    `${watchEpochSelect}
where session_id = ?
order by epoch_start desc
limit 1`,
    [input.sessionId],
  );

  return row ? toWatchEpoch(row) : null;
}

export async function summarizeWatchSession(input: {
  db: LocalDb;
  sessionId: string;
}): Promise<{
  epochsReceived: number;
  usableEpochs: number;
  likelyRemEpochs: number;
  connectivityGaps: number;
  classifierVersions: string[];
}> {
  const epochs = await loadWatchEpochsForSession(input);
  const classifierVersions = new Set(
    epochs
      .map((epoch) => epoch.classifierVersion)
      .filter((version): version is string => Boolean(version)),
  );

  return {
    epochsReceived: epochs.length,
    usableEpochs: epochs.filter((epoch) => epoch.sensorQuality !== "missing").length,
    likelyRemEpochs: epochs.filter((epoch) => epoch.remLabel === "likely_rem").length,
    connectivityGaps: epochs.filter(
      (epoch) =>
        epoch.watchConnectivityState === "delayed" ||
        epoch.watchConnectivityState === "disconnected",
    ).length,
    classifierVersions: [...classifierVersions],
  };
}

export async function saveWatchRuntimeEvents(input: {
  db: LocalDb;
  events: WatchRuntimeEvent[];
}): Promise<void> {
  for (const event of input.events) {
    await input.db.execute(
      `insert into watch_runtime_events (
  id,
  session_id,
  timestamp,
  event_type,
  payload_json,
  upload_status
) values (?, ?, ?, ?, ?, 'local_only')
on conflict(id) do nothing`,
      [
        event.id,
        event.sessionId,
        event.timestamp,
        event.eventType,
        JSON.stringify(event.payload),
      ],
    );
  }
}

export async function loadWatchRuntimeEventsForSession(input: {
  db: LocalDb;
  sessionId: string;
}): Promise<WatchRuntimeEvent[]> {
  const rows = await input.db.query<WatchRuntimeEventRow>(
    `select id,
  session_id,
  timestamp,
  event_type,
  payload_json
from watch_runtime_events
where session_id = ?
order by timestamp asc`,
    [input.sessionId],
  );

  return rows.map(toWatchRuntimeEvent);
}

export async function loadWatchSyncPackageImport(input: {
  db: LocalDb;
  packageId: string;
}): Promise<WatchSyncPackageImportRecord | null> {
  const row = await input.db.queryOne<WatchSyncPackageRow>(
    `select package_id,
  session_id,
  plan_hash,
  package_hash,
  sealed_at,
  imported_at,
  import_status,
  manifest_json,
  import_error
from watch_sync_packages
where package_id = ?
limit 1`,
    [input.packageId],
  );

  return row ? toWatchSyncPackageImport(row) : null;
}

export async function markWatchSyncPackageImporting(input: {
  db: LocalDb;
  packageId: string;
  sessionId: string;
  planHash: string;
  packageHash: string;
  sealedAt: string;
  manifestJson: string;
}): Promise<void> {
  await input.db.execute(
    `insert into watch_sync_packages (
  package_id,
  session_id,
  plan_hash,
  package_hash,
  sealed_at,
  imported_at,
  import_status,
  manifest_json,
  import_error
) values (?, ?, ?, ?, ?, null, 'importing', ?, null)
on conflict(package_id) do update set
  import_status = 'importing',
  manifest_json = excluded.manifest_json,
  import_error = null
where watch_sync_packages.package_hash = excluded.package_hash`,
    [
      input.packageId,
      input.sessionId,
      input.planHash,
      input.packageHash,
      input.sealedAt,
      input.manifestJson,
    ],
  );
}

export async function markWatchSyncPackageImported(input: {
  db: LocalDb;
  packageId: string;
  packageHash: string;
  importedAt: string;
  manifestJson: string;
}): Promise<void> {
  await input.db.execute(
    `update watch_sync_packages
set imported_at = ?,
  import_status = 'imported',
  manifest_json = ?,
  import_error = null
where package_id = ?
  and package_hash = ?`,
    [
      input.importedAt,
      input.manifestJson,
      input.packageId,
      input.packageHash,
    ],
  );
}

export async function markWatchSyncPackageImportFailed(input: {
  db: LocalDb;
  packageId: string;
  packageHash: string;
  importError: string;
}): Promise<void> {
  await input.db.execute(
    `update watch_sync_packages
set import_status = 'import_failed',
  import_error = ?
where package_id = ?
  and package_hash = ?`,
    [input.importError, input.packageId, input.packageHash],
  );
}

export async function saveMorningReport(input: {
  db: LocalDb;
  report: MorningReport;
  uploadStatus?: UploadStatus;
}): Promise<void> {
  await input.db.execute(
    `insert into morning_reports (
  id,
  session_id,
  submitted_at,
  remembered_dream,
  lucid_dream,
  heard_cue,
  cue_incorporated,
  cue_woke_user,
  returned_to_sleep,
  sleep_quality_rating,
  upload_status
) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
on conflict(id) do update set
  submitted_at = excluded.submitted_at,
  remembered_dream = excluded.remembered_dream,
  lucid_dream = excluded.lucid_dream,
  heard_cue = excluded.heard_cue,
  cue_incorporated = excluded.cue_incorporated,
  cue_woke_user = excluded.cue_woke_user,
  returned_to_sleep = excluded.returned_to_sleep,
  sleep_quality_rating = excluded.sleep_quality_rating,
  upload_status = excluded.upload_status`,
    [
      input.report.id,
      input.report.sessionId,
      input.report.submittedAt,
      input.report.rememberedDream ? 1 : 0,
      input.report.lucidDream === null ? null : input.report.lucidDream ? 1 : 0,
      input.report.heardCue === null ? null : input.report.heardCue ? 1 : 0,
      input.report.cueIncorporated === null
        ? null
        : input.report.cueIncorporated
          ? 1
          : 0,
      input.report.cueWokeUser === null
        ? null
        : input.report.cueWokeUser
          ? 1
          : 0,
      input.report.returnedToSleep === null
        ? null
        : input.report.returnedToSleep
          ? 1
          : 0,
      input.report.sleepQualityRating ?? null,
      input.uploadStatus ?? "local_only",
    ],
  );
}

export async function loadMorningReportForSession(input: {
  db: LocalDb;
  sessionId: string;
}): Promise<MorningReport | null> {
  const row = await input.db.queryOne<MorningReportRow>(
    `select id,
  session_id,
  submitted_at,
  remembered_dream,
  lucid_dream,
  heard_cue,
  cue_incorporated,
  cue_woke_user,
  returned_to_sleep,
  sleep_quality_rating
from morning_reports
where session_id = ?
order by submitted_at desc
limit 1`,
    [input.sessionId],
  );

  return row ? toMorningReport(row) : null;
}

export async function loadPhoneNightCalibrationNights(
  db: LocalDb,
): Promise<PhoneNightCalibrationNight[]> {
  return (
    (await getAppSetting<PhoneNightCalibrationNight[]>(
      db,
      PHONE_NIGHT_CALIBRATION_NIGHTS_SETTING,
    )) ?? []
  );
}

export async function upsertPhoneNightCalibrationNight(input: {
  db: LocalDb;
  night: PhoneNightCalibrationNight;
  updatedAt: string;
}): Promise<void> {
  const existing = await loadPhoneNightCalibrationNights(input.db);
  const existingNight = existing.find(
    (night) => night.sessionId === input.night.sessionId,
  );
  const mergedNight: PhoneNightCalibrationNight = existingNight
    ? {
        ...existingNight,
        ...input.night,
        cueWokeUser: input.night.cueWokeUser ?? existingNight.cueWokeUser,
        sleepQualityRating:
          input.night.sleepQualityRating ?? existingNight.sleepQualityRating,
      }
    : input.night;
  const next = [
    mergedNight,
    ...existing.filter((night) => night.sessionId !== mergedNight.sessionId),
  ]
    .sort((a, b) => Date.parse(b.trainingEndedAt) - Date.parse(a.trainingEndedAt))
    .slice(0, 30);

  await setAppSetting(
    input.db,
    PHONE_NIGHT_CALIBRATION_NIGHTS_SETTING,
    next,
    input.updatedAt,
  );
}

export async function updatePhoneNightCalibrationFeedback(input: {
  db: LocalDb;
  sessionId: string;
  cueWokeUser?: boolean | null;
  sleepQualityRating?: number;
  updatedAt: string;
}): Promise<void> {
  const existing = await loadPhoneNightCalibrationNights(input.db);
  const found = existing.some((night) => night.sessionId === input.sessionId);

  if (!found) {
    return;
  }

  const next = existing.map((night) =>
    night.sessionId === input.sessionId
      ? {
          ...night,
          generatedAt: input.updatedAt,
          cueWokeUser: input.cueWokeUser,
          sleepQualityRating: input.sleepQualityRating,
        }
      : night,
  );

  await setAppSetting(
    input.db,
    PHONE_NIGHT_CALIBRATION_NIGHTS_SETTING,
    next,
    input.updatedAt,
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
