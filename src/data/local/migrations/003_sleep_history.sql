create table if not exists external_sleep_sessions (
  id text primary key,
  participant_id text not null,
  source_platform text not null,
  source_record_id_hash text not null,
  start_at text not null,
  end_at text not null,
  imported_at text not null,
  upload_status text not null default 'local_only',
  unique(source_platform, source_record_id_hash),
  foreign key (participant_id) references participants(id)
);

create table if not exists external_sleep_stage_segments (
  id text primary key,
  external_sleep_session_id text not null,
  stage text not null,
  start_at text not null,
  end_at text not null,
  duration_seconds integer not null,
  confidence real,
  foreign key (external_sleep_session_id) references external_sleep_sessions(id)
);

create table if not exists sleep_prior_profiles (
  id text primary key,
  participant_id text not null,
  generated_at text not null,
  source_platform text not null,
  source_nights_count integer not null,
  median_sleep_onset_minutes integer,
  median_wake_minutes integer,
  median_sleep_duration_minutes integer,
  rem_windows_json text not null,
  rem_density_by_minute_json text,
  confidence text not null,
  upload_status text not null default 'local_only',
  foreign key (participant_id) references participants(id)
);

create index if not exists idx_external_sleep_sessions_participant_start_at
on external_sleep_sessions(participant_id, start_at);

create index if not exists idx_external_sleep_stage_segments_session_start_at
on external_sleep_stage_segments(external_sleep_session_id, start_at);

create index if not exists idx_sleep_prior_profiles_participant_generated_at
on sleep_prior_profiles(participant_id, generated_at);
