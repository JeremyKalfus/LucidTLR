export const LOCAL_RUNTIME_MIGRATIONS = [
  {
    id: "001_initial",
    sql: `
create table if not exists participants (
  id text primary key,
  app_install_id text not null,
  created_at text not null,
  selected_mode text,
  structured_upload_consent integer not null default 0,
  dream_upload_consent integer not null default 0
);

create table if not exists consents (
  id text primary key,
  participant_id text not null,
  consent_type text not null,
  consent_version text not null,
  accepted_at text,
  withdrawn_at text,
  app_version text,
  foreign key (participant_id) references participants(id)
);

create table if not exists questionnaire_responses (
  id text primary key,
  participant_id text not null,
  session_id text,
  form_id text not null,
  question_id text not null,
  value_json text not null,
  created_at text not null,
  updated_at text not null,
  upload_status text not null default 'local_only',
  foreign key (participant_id) references participants(id)
);

create table if not exists sessions (
  id text primary key,
  participant_id text not null,
  session_type text not null,
  mode text,
  status text not null,
  protocol_version text not null,
  started_at text not null,
  ended_at text,
  training_started_at text,
  training_ended_at text,
  cueing_started_at text,
  upload_status text not null default 'local_only',
  foreign key (participant_id) references participants(id)
);

create table if not exists cue_events (
  id text primary key,
  session_id text not null,
  timestamp text not null,
  cue_id text not null,
  volume_level real not null,
  delivery_device text not null default 'phone',
  played integer not null,
  suppression_reason text not null default 'none',
  upload_status text not null default 'local_only',
  foreign key (session_id) references sessions(id)
);

create table if not exists movement_events (
  id text primary key,
  session_id text not null,
  timestamp text not null,
  source text not null,
  intensity real,
  was_cue_associated integer not null default 0,
  pause_started_at text,
  pause_ended_at text,
  upload_status text not null default 'local_only',
  foreign key (session_id) references sessions(id)
);

create table if not exists watch_epochs (
  id text primary key,
  session_id text not null,
  epoch_start text not null,
  epoch_end text not null,
  heart_rate_summary real,
  motion_summary real,
  elapsed_session_seconds integer not null,
  rem_probability real,
  rem_label text,
  classifier_version text,
  upload_status text not null default 'local_only',
  foreign key (session_id) references sessions(id)
);

create table if not exists morning_reports (
  id text primary key,
  session_id text not null,
  submitted_at text not null,
  remembered_dream integer not null,
  lucid_dream integer,
  heard_cue integer,
  cue_incorporated integer,
  cue_woke_user integer,
  returned_to_sleep integer,
  sleep_quality_rating integer,
  upload_status text not null default 'local_only',
  foreign key (session_id) references sessions(id)
);

create table if not exists dream_journals (
  id text primary key,
  participant_id text not null,
  session_id text,
  created_at text not null,
  text text,
  audio_local_uri text,
  local_only integer not null default 1,
  uploaded_with_explicit_consent integer not null default 0,
  upload_status text not null default 'local_only',
  foreign key (participant_id) references participants(id),
  foreign key (session_id) references sessions(id)
);

create table if not exists upload_queue (
  id text primary key,
  entity_type text not null,
  entity_id text not null,
  payload_json text not null,
  consent_type_required text not null,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  last_attempt_at text,
  created_at text not null
);

create table if not exists app_settings (
  key text primary key,
  value_json text not null,
  updated_at text not null
);
`,
  },
  {
    id: "002_indexes",
    sql: `
create index if not exists idx_sessions_participant_started_at
on sessions(participant_id, started_at);

create index if not exists idx_cue_events_session_timestamp
on cue_events(session_id, timestamp);

create index if not exists idx_movement_events_session_timestamp
on movement_events(session_id, timestamp);

create index if not exists idx_watch_epochs_session_epoch_start
on watch_epochs(session_id, epoch_start);

create index if not exists idx_morning_reports_session
on morning_reports(session_id);

create index if not exists idx_dream_journals_participant_created_at
on dream_journals(participant_id, created_at);

create index if not exists idx_upload_queue_status_created_at
on upload_queue(status, created_at);
`,
  },
] as const;
