create table participants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  participant_id text not null unique,
  created_at timestamptz not null default now(),
  platform text,
  app_version text,
  structured_upload_enabled boolean not null default false,
  dream_upload_enabled boolean not null default false
);

create table consents (
  id uuid primary key default gen_random_uuid(),
  participant_id text not null references participants(participant_id),
  consent_type text not null,
  consent_version text not null,
  accepted_at timestamptz,
  withdrawn_at timestamptz,
  app_version text
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  local_session_id text not null,
  participant_id text not null references participants(participant_id),
  session_type text not null,
  mode text,
  status text not null,
  protocol_version text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  training_started_at timestamptz,
  training_ended_at timestamptz,
  cueing_started_at timestamptz,
  uploaded_at timestamptz not null default now()
);

create table cue_events (
  id uuid primary key default gen_random_uuid(),
  local_event_id text not null,
  local_session_id text not null,
  participant_id text not null references participants(participant_id),
  timestamp timestamptz not null,
  cue_id text not null,
  volume_level real,
  delivery_device text,
  played boolean not null,
  suppression_reason text
);

create table movement_events (
  id uuid primary key default gen_random_uuid(),
  local_event_id text not null,
  local_session_id text not null,
  participant_id text not null references participants(participant_id),
  timestamp timestamptz not null,
  source text not null,
  intensity real,
  was_cue_associated boolean not null,
  pause_started_at timestamptz,
  pause_ended_at timestamptz
);

create table watch_epochs (
  id uuid primary key default gen_random_uuid(),
  local_epoch_id text not null,
  local_session_id text not null,
  participant_id text not null references participants(participant_id),
  epoch_start timestamptz not null,
  epoch_end timestamptz not null,
  heart_rate_summary real,
  motion_summary real,
  elapsed_session_seconds integer,
  rem_probability real,
  rem_label text,
  classifier_version text
);

create table morning_reports (
  id uuid primary key default gen_random_uuid(),
  local_report_id text not null,
  local_session_id text not null,
  participant_id text not null references participants(participant_id),
  submitted_at timestamptz not null,
  remembered_dream boolean not null,
  lucid_dream boolean,
  heard_cue boolean,
  cue_incorporated boolean,
  cue_woke_user boolean,
  returned_to_sleep boolean,
  sleep_quality_rating integer
);

create table questionnaire_responses (
  id uuid primary key default gen_random_uuid(),
  local_response_id text not null,
  participant_id text not null references participants(participant_id),
  local_session_id text,
  form_id text not null,
  question_id text not null,
  value_json jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table dream_journals (
  id uuid primary key default gen_random_uuid(),
  local_journal_id text not null,
  participant_id text not null references participants(participant_id),
  local_session_id text,
  created_at timestamptz not null,
  text text,
  audio_storage_path text,
  uploaded_with_explicit_consent boolean not null
);
