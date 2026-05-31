export const LOCAL_DATABASE_NAME = "lucidcue.db";

export const LOCAL_MIGRATIONS = [
  {
    id: "001_initial",
    filename: "001_initial.sql",
  },
  {
    id: "002_indexes",
    filename: "002_indexes.sql",
  },
  {
    id: "003_sleep_history",
    filename: "003_sleep_history.sql",
  },
  {
    id: "004_tlr_options",
    filename: "004_tlr_options.sql",
  },
  {
    id: "005_selected_cue",
    filename: "005_selected_cue.sql",
  },
  {
    id: "006_watch_mode_epochs",
    filename: "006_watch_mode_epochs.sql",
  },
] as const;

export const LOCAL_TABLES = [
  "participants",
  "consents",
  "questionnaire_responses",
  "sessions",
  "cue_events",
  "movement_events",
  "watch_epochs",
  "watch_runtime_events",
  "morning_reports",
  "dream_journals",
  "external_sleep_sessions",
  "external_sleep_stage_segments",
  "sleep_prior_profiles",
  "upload_queue",
  "app_settings",
] as const;

export type LocalTableName = (typeof LOCAL_TABLES)[number];
