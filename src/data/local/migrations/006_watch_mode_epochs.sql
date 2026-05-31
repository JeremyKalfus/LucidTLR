alter table watch_epochs
add column sensor_quality text;

alter table watch_epochs
add column sleep_probability real;

alter table watch_epochs
add column epoch_features_json text;

alter table watch_epochs
add column watch_battery_level real;

alter table watch_epochs
add column watch_connectivity_state text;

alter table watch_epochs
add column sample_counts_json text;

alter table watch_epochs
add column stage_probabilities_json text;

alter table watch_epochs
add column stage_label text;

alter table watch_epochs
add column epoch_received_at text;

alter table watch_epochs
add column processed_at text;

alter table watch_epochs
add column heart_rate_sample_count integer;

alter table watch_epochs
add column motion_sample_count integer;

alter table watch_epochs
add column hr_feature real;

alter table watch_epochs
add column motion_feature real;

alter table watch_epochs
add column motion_ema real;

alter table watch_epochs
add column time_feature real;

alter table watch_epochs
add column raw_epoch_available integer not null default 0;

create table if not exists watch_runtime_events (
  id text primary key,
  session_id text not null,
  timestamp text not null,
  event_type text not null,
  payload_json text not null,
  upload_status text not null default 'local_only',
  foreign key (session_id) references sessions(id)
);

create index if not exists idx_watch_runtime_events_session_timestamp
on watch_runtime_events(session_id, timestamp);
