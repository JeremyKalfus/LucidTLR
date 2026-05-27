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
] as const;

export const LOCAL_TABLES = [
  "participants",
  "consents",
  "questionnaire_responses",
  "sessions",
  "cue_events",
  "movement_events",
  "watch_epochs",
  "morning_reports",
  "dream_journals",
  "upload_queue",
  "app_settings",
] as const;

export type LocalTableName = (typeof LOCAL_TABLES)[number];
