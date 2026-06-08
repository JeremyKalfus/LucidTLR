create table if not exists watch_lab_debug_events (
  id text primary key,
  timestamp text not null,
  source text not null,
  event_type text not null,
  session_id text,
  plan_hash text,
  package_id text,
  package_hash text,
  previous_status text,
  next_status text,
  success integer not null,
  error_message text,
  direction text,
  message_id text,
  transport_message_type text,
  delivery_method text,
  metadata_json text not null default '{}'
);

create index if not exists idx_watch_lab_debug_events_timestamp
on watch_lab_debug_events(timestamp);

create index if not exists idx_watch_lab_debug_events_session_timestamp
on watch_lab_debug_events(session_id, timestamp);
