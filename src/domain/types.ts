export type AppMode = "phone" | "watch";

export type SoundSensitivityProfile = "sensitive" | "standard" | "hard_to_wake";

export type WatchSensorQuality = "good" | "degraded" | "missing" | "bad";

export type CueDecisionAction =
  | "idle"
  | "play_cue"
  | "suppress"
  | "pause"
  | "wait";

export type CueDecisionReason =
  | "none"
  | "before_training_finished"
  | "before_cue_window"
  | "outside_sleep_opportunity"
  | "recent_cue"
  | "movement"
  | "cue_associated_movement"
  | "user_interaction"
  | "post_awakening_pause"
  | "cue_budget_exhausted"
  | "phone_late_rem_opportunity"
  | "watch_likely_rem"
  | "rem_persistent_suppression"
  | "sensor_quality_bad"
  | "session_not_active";

export type SessionType = "tlr" | "sleep_log";

export type SessionStatus =
  | "idle"
  | "setup"
  | "training"
  | "waiting_for_cue_window"
  | "cueing"
  | "paused_for_movement"
  | "paused_after_awakening"
  | "cueing_disabled_sleep_log"
  | "ended"
  | "morning_review_complete";

export type UploadConsentLevel =
  | "none"
  | "structured_research"
  | "dream_journal_research";

export type ConsentType =
  | "app_terms"
  | "research_info"
  | "structured_research_upload"
  | "dream_journal_upload";

export type EntityType =
  | "participant"
  | "consent"
  | "questionnaire_response"
  | "session"
  | "cue_event"
  | "movement_event"
  | "watch_epoch"
  | "morning_report"
  | "dream_journal";

export type UploadStatus =
  | "local_only"
  | "pending"
  | "uploaded"
  | "canceled"
  | "failed";

export type CueSuppressionReason =
  | "none"
  | "movement"
  | "cue_associated_movement"
  | "user_reported_awakening"
  | "likely_rem_persistent_suppression"
  | "outside_cue_window"
  | "session_not_active";

export interface ParticipantProfile {
  participantId: string;
  appInstallId: string;
  createdAt: string;
  mode: AppMode | null;
  uploadConsentLevel: UploadConsentLevel;
}

export interface ConsentRecord {
  id: string;
  participantId: string;
  consentType: ConsentType;
  consentVersion: string;
  acceptedAt?: string;
  withdrawnAt?: string;
  appVersion?: string;
}

export interface ConsentState {
  structuredResearchUploadAccepted: boolean;
  structuredResearchUploadWithdrawn: boolean;
  dreamJournalUploadAccepted: boolean;
  dreamJournalUploadWithdrawn: boolean;
}

export interface NightSession {
  id: string;
  participantId: string;
  sessionType: SessionType;
  mode: AppMode | null;
  status: SessionStatus;
  protocolVersion: string;
  startedAt: string;
  endedAt?: string;
  trainingStartedAt?: string;
  trainingEndedAt?: string;
  cueingStartedAt?: string;
}

export interface CueEvent {
  id: string;
  sessionId: string;
  timestamp: string;
  cueId: string;
  volumeLevel: number;
  deliveryDevice: "phone";
  played: boolean;
  suppressionReason: CueSuppressionReason;
}

export interface MovementEvent {
  id: string;
  sessionId: string;
  timestamp: string;
  source: "phone" | "watch";
  intensity: number;
  wasCueAssociated: boolean;
  pauseStartedAt?: string;
  pauseEndedAt?: string;
}

export interface WatchEpoch {
  id: string;
  sessionId: string;
  epochStart: string;
  epochEnd: string;
  heartRateSummary?: number;
  motionSummary?: number;
  sensorQuality?: WatchSensorQuality;
  sleepProbability?: number;
  elapsedSessionSeconds: number;
  remProbability?: number;
  remLabel?: "likely_rem" | "not_likely_rem" | "unknown";
  classifierVersion?: string;
}

export interface MorningReport {
  id: string;
  sessionId: string;
  submittedAt: string;
  rememberedDream: boolean;
  lucidDream: boolean | null;
  heardCue: boolean | null;
  cueIncorporated: boolean | null;
  cueWokeUser: boolean | null;
  returnedToSleep: boolean | null;
  sleepQualityRating?: number;
}

export interface DreamJournalEntry {
  id: string;
  sessionId?: string;
  createdAt: string;
  text?: string;
  audioLocalUri?: string;
  localOnly: boolean;
  uploadedWithExplicitConsent: boolean;
}
